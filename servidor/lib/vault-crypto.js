// Este programa é um software livre (Licença AGPLv3)
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');

const MAGIC = Buffer.from('AURTENC2', 'ascii'); // 8 bytes
const VERSION = 0x02;
const HEADER_SIZE = 76;
const DEFAULT_CHUNK_SIZE = 65536; // 64 KB
const AUTH_TAG_SIZE = 16;

function isEncryptionEnabled() {
  return String(process.env.VAULT_ENCRYPTION_ENABLED || '').toLowerCase() === 'true';
}

function getMasterKey() {
  const raw = (process.env.VAULT_MASTER_KEY || '').trim();
  if (!raw) {
    const err = new Error('VAULT_MASTER_KEY ausente: operação de cofre criptografado bloqueada (fail-closed).');
    err.code = 'VAULT_KEY_MISSING';
    err.statusCode = 503;
    throw err;
  }
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, 'hex');
  } else {
    buf = Buffer.from(raw, 'base64');
  }
  if (buf.length !== 32) {
    const err = new Error('VAULT_MASTER_KEY inválida: deve possuir exatamente 32 bytes (64 hex ou base64).');
    err.code = 'VAULT_KEY_INVALID';
    err.statusCode = 503;
    throw err;
  }
  return buf;
}

function deriveTenantKey(masterKey, tenantNamespaceId) {
  const salt = Buffer.from(String(tenantNamespaceId || 'default'), 'utf8');
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, Buffer.from('aurtistic-vault-tenant-v2', 'utf8'), 32));
}

function deriveFileKey(tenantKey, fileSalt) {
  return Buffer.from(crypto.hkdfSync('sha256', tenantKey, fileSalt, Buffer.from('aurtistic-file-v2', 'utf8'), 32));
}

function buildChunkNonce(noncePrefix, chunkIndex) {
  const nonce = Buffer.alloc(12);
  noncePrefix.copy(nonce, 0, 0, 4);
  nonce.writeBigUInt64BE(BigInt(chunkIndex), 4);
  return nonce;
}

function buildChunkAad(headerBuf, chunkIndex, isFinal) {
  const aad = Buffer.alloc(HEADER_SIZE + 9);
  headerBuf.copy(aad, 0, 0, HEADER_SIZE);
  aad.writeBigUInt64BE(BigInt(chunkIndex), HEADER_SIZE);
  aad.writeUInt8(isFinal ? 1 : 0, HEADER_SIZE + 8);
  return aad;
}

function buildHeader({ chunkSize = DEFAULT_CHUNK_SIZE, plaintextSize, fileSalt, noncePrefix, plaintextSha256, flags = 0 }) {
  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0); // 0..7
  header.writeUInt8(VERSION, 8); // 8
  header.writeUInt8((flags >> 16) & 0xff, 9);
  header.writeUInt8((flags >> 8) & 0xff, 10);
  header.writeUInt8(flags & 0xff, 11); // 9..11
  header.writeUInt32BE(chunkSize, 12); // 12..15
  header.writeBigUInt64BE(BigInt(plaintextSize), 16); // 16..23
  fileSalt.copy(header, 24, 0, 16); // 24..39
  noncePrefix.copy(header, 40, 0, 4); // 40..43
  plaintextSha256.copy(header, 44, 0, 32); // 44..75
  return header;
}

function parseHeaderBuffer(headerBuf, actualFileSize = null) {
  if (!Buffer.isBuffer(headerBuf) || headerBuf.length < HEADER_SIZE) return null;
  if (!headerBuf.subarray(0, 8).equals(MAGIC)) return null;
  const version = headerBuf.readUInt8(8);
  if (version !== VERSION) {
    throw new Error(`Versão AURTENC2 não suportada: ${version}`);
  }
  const flags = (headerBuf.readUInt8(9) << 16) | (headerBuf.readUInt8(10) << 8) | headerBuf.readUInt8(11);
  const chunkSize = headerBuf.readUInt32BE(12);
  const plaintextSize = Number(headerBuf.readBigUInt64BE(16));
  const fileSalt = Buffer.from(headerBuf.subarray(24, 40));
  const noncePrefix = Buffer.from(headerBuf.subarray(40, 44));
  const plaintextSha256 = Buffer.from(headerBuf.subarray(44, 76));

  if (actualFileSize !== null) {
    const expectedChunks = plaintextSize === 0 ? 1 : Math.ceil(plaintextSize / chunkSize);
    const expectedSize = HEADER_SIZE + plaintextSize + expectedChunks * AUTH_TAG_SIZE;
    if (actualFileSize !== expectedSize) {
      const err = new Error(`Arquivo AURTENC2 corrompido ou truncado (esperado ${expectedSize}B, encontrado ${actualFileSize}B).`);
      err.code = 'VAULT_FILE_CORRUPTED';
      throw err;
    }
  }

  return {
    version,
    flags,
    chunkSize,
    plaintextSize,
    fileSalt,
    noncePrefix,
    plaintextSha256,
    headerBuf: Buffer.from(headerBuf.subarray(0, HEADER_SIZE)),
  };
}

async function readEncryptedHeader(filePath) {
  const st = await fs.promises.stat(filePath);
  if (st.size < HEADER_SIZE) return null;
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEADER_SIZE);
    const { bytesRead } = await fd.read(buf, 0, HEADER_SIZE, 0);
    if (bytesRead < HEADER_SIZE) return null;
    if (!buf.subarray(0, 8).equals(MAGIC)) return null;
    return parseHeaderBuffer(buf, st.size);
  } finally {
    await fd.close();
  }
}

function readEncryptedHeaderSync(filePath) {
  const st = fs.statSync(filePath);
  if (st.size < HEADER_SIZE) return null;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEADER_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, HEADER_SIZE, 0);
    if (bytesRead < HEADER_SIZE) return null;
    if (!buf.subarray(0, 8).equals(MAGIC)) return null;
    return parseHeaderBuffer(buf, st.size);
  } finally {
    fs.closeSync(fd);
  }
}

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest()));
    rs.on('error', reject);
  });
}

async function encryptFileAtomic(srcPath, destPath, tenantNamespaceId) {
  const masterKey = getMasterKey();
  const tenantKey = deriveTenantKey(masterKey, tenantNamespaceId);
  const st = await fs.promises.stat(srcPath);
  const plaintextSize = st.size;
  const plaintextSha256 = await computeFileSha256(srcPath);
  const fileSalt = crypto.randomBytes(16);
  const noncePrefix = crypto.randomBytes(4);
  const fileKey = deriveFileKey(tenantKey, fileSalt);

  const headerBuf = buildHeader({
    chunkSize: DEFAULT_CHUNK_SIZE,
    plaintextSize,
    fileSalt,
    noncePrefix,
    plaintextSha256,
  });

  const tmpDest = `${destPath}.enc.tmp`;
  const outFd = await fs.promises.open(tmpDest, 'w', 0o600);
  const inFd = await fs.promises.open(srcPath, 'r');
  try {
    await outFd.write(headerBuf, 0, HEADER_SIZE, 0);
    let outPos = HEADER_SIZE;

    if (plaintextSize === 0) {
      const nonce = buildChunkNonce(noncePrefix, 0);
      const aad = buildChunkAad(headerBuf, 0, true);
      const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, nonce);
      cipher.setAAD(aad);
      const enc = cipher.final();
      const tag = cipher.getAuthTag();
      if (enc.length > 0) {
        await outFd.write(enc, 0, enc.length, outPos);
        outPos += enc.length;
      }
      await outFd.write(tag, 0, AUTH_TAG_SIZE, outPos);
    } else {
      const totalChunks = Math.ceil(plaintextSize / DEFAULT_CHUNK_SIZE);
      const readBuf = Buffer.alloc(DEFAULT_CHUNK_SIZE);
      let inPos = 0;

      for (let i = 0; i < totalChunks; i++) {
        const toRead = Math.min(DEFAULT_CHUNK_SIZE, plaintextSize - inPos);
        const { bytesRead } = await inFd.read(readBuf, 0, toRead, inPos);
        const plainSlice = readBuf.subarray(0, bytesRead);
        const isFinal = i === totalChunks - 1;
        const nonce = buildChunkNonce(noncePrefix, i);
        const aad = buildChunkAad(headerBuf, i, isFinal);
        const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, nonce);
        cipher.setAAD(aad);
        const enc = Buffer.concat([cipher.update(plainSlice), cipher.final()]);
        const tag = cipher.getAuthTag();
        await outFd.write(enc, 0, enc.length, outPos);
        outPos += enc.length;
        await outFd.write(tag, 0, AUTH_TAG_SIZE, outPos);
        outPos += AUTH_TAG_SIZE;
        inPos += bytesRead;
      }
    }

    await outFd.sync();
  } catch (err) {
    await outFd.close().catch(() => {});
    await inFd.close().catch(() => {});
    await fs.promises.unlink(tmpDest).catch(() => {});
    throw err;
  }

  await outFd.close();
  await inFd.close();
  await fs.promises.rename(tmpDest, destPath);
  return { plaintextSize, plaintextSha256Hex: plaintextSha256.toString('hex') };
}

async function encryptBufferToFile(buf, destPath, tenantNamespaceId) {
  const masterKey = getMasterKey();
  const tenantKey = deriveTenantKey(masterKey, tenantNamespaceId);
  const plaintextSize = buf.length;
  const plaintextSha256 = crypto.createHash('sha256').update(buf).digest();
  const fileSalt = crypto.randomBytes(16);
  const noncePrefix = crypto.randomBytes(4);
  const fileKey = deriveFileKey(tenantKey, fileSalt);

  const headerBuf = buildHeader({
    chunkSize: DEFAULT_CHUNK_SIZE,
    plaintextSize,
    fileSalt,
    noncePrefix,
    plaintextSha256,
  });

  const tmpDest = `${destPath}.enc.tmp`;
  const outFd = await fs.promises.open(tmpDest, 'w', 0o600);
  try {
    await outFd.write(headerBuf, 0, HEADER_SIZE, 0);
    let outPos = HEADER_SIZE;
    const totalChunks = plaintextSize === 0 ? 1 : Math.ceil(plaintextSize / DEFAULT_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * DEFAULT_CHUNK_SIZE;
      const end = Math.min(plaintextSize, start + DEFAULT_CHUNK_SIZE);
      const plainSlice = buf.subarray(start, end);
      const isFinal = i === totalChunks - 1;
      const nonce = buildChunkNonce(noncePrefix, i);
      const aad = buildChunkAad(headerBuf, i, isFinal);
      const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, nonce);
      cipher.setAAD(aad);
      const enc = Buffer.concat([cipher.update(plainSlice), cipher.final()]);
      const tag = cipher.getAuthTag();
      if (enc.length > 0) {
        await outFd.write(enc, 0, enc.length, outPos);
        outPos += enc.length;
      }
      await outFd.write(tag, 0, AUTH_TAG_SIZE, outPos);
      outPos += AUTH_TAG_SIZE;
    }
    await outFd.sync();
  } catch (err) {
    await outFd.close().catch(() => {});
    await fs.promises.unlink(tmpDest).catch(() => {});
    throw err;
  }
  await outFd.close();
  await fs.promises.rename(tmpDest, destPath);
  return { plaintextSize, plaintextSha256Hex: plaintextSha256.toString('hex') };
}

function createDecryptStream(filePath, tenantNamespaceId, rangeStart = 0, rangeEnd = null) {
  const masterKey = getMasterKey();
  const tenantKey = deriveTenantKey(masterKey, tenantNamespaceId);

  async function* generateChunks() {
    const header = await readEncryptedHeader(filePath);
    if (!header) {
      throw new Error('Arquivo não está no formato AURTENC2.');
    }
    const { chunkSize, plaintextSize, fileSalt, noncePrefix, headerBuf } = header;
    const fileKey = deriveFileKey(tenantKey, fileSalt);

    if (plaintextSize === 0) {
      const fd = await fs.promises.open(filePath, 'r');
      try {
        const tagBuf = Buffer.alloc(AUTH_TAG_SIZE);
        await fd.read(tagBuf, 0, AUTH_TAG_SIZE, HEADER_SIZE);
        const nonce = buildChunkNonce(noncePrefix, 0);
        const aad = buildChunkAad(headerBuf, 0, true);
        const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, nonce);
        decipher.setAAD(aad);
        decipher.setAuthTag(tagBuf);
        decipher.final();
      } finally {
        await fd.close();
      }
      return;
    }

    const effectiveEnd = rangeEnd === null ? plaintextSize - 1 : Math.min(rangeEnd, plaintextSize - 1);
    if (rangeStart > effectiveEnd) return;

    const totalChunks = Math.ceil(plaintextSize / chunkSize);
    const firstChunk = Math.floor(rangeStart / chunkSize);
    const lastChunk = Math.floor(effectiveEnd / chunkSize);

    const fd = await fs.promises.open(filePath, 'r');
    try {
      for (let i = firstChunk; i <= lastChunk; i++) {
        const isFinal = i === totalChunks - 1;
        const plainLen = isFinal ? plaintextSize - i * chunkSize : chunkSize;
        const diskOffset = HEADER_SIZE + i * (chunkSize + AUTH_TAG_SIZE);
        const blockBuf = Buffer.alloc(plainLen + AUTH_TAG_SIZE);
        await fd.read(blockBuf, 0, blockBuf.length, diskOffset);

        const cipherPart = blockBuf.subarray(0, plainLen);
        const tagPart = blockBuf.subarray(plainLen, plainLen + AUTH_TAG_SIZE);
        const nonce = buildChunkNonce(noncePrefix, i);
        const aad = buildChunkAad(headerBuf, i, isFinal);
        const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, nonce);
        decipher.setAAD(aad);
        decipher.setAuthTag(tagPart);
        const plain = Buffer.concat([decipher.update(cipherPart), decipher.final()]);

        const chunkPlainStart = i * chunkSize;
        const sliceStart = Math.max(0, rangeStart - chunkPlainStart);
        const sliceEnd = Math.min(plain.length, effectiveEnd - chunkPlainStart + 1);
        if (sliceStart < sliceEnd) {
          yield plain.subarray(sliceStart, sliceEnd);
        }
      }
    } finally {
      await fd.close();
    }
  }

  return Readable.from(generateChunks());
}

async function decryptBuffer(filePath, tenantNamespaceId) {
  const chunks = [];
  for await (const chunk of createDecryptStream(filePath, tenantNamespaceId)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Criptografa diretamente uma sequência ordenada de arquivos-parte (*.part) em formato AURTENC2
 * sem criar nenhum arquivo plaintext concatenado intermediário no disco (máx. 2x espaço).
 * Passo 1: leitura sequencial verificando soma de tamanhos e SHA-256 final do plaintext.
 * Passo 2: criptografia AES-256-GCM em streaming por blocos de 64 KB gravando em
 * `<destPath>.<pid>.<ts>.enc.tmp` no mesmo diretório/volume de `destPath`, seguida de rename atômico.
 */
async function encryptPartFilesAtomic(
  partPaths,
  expectedTotalSize,
  expectedSha256Hex,
  destPath,
  tenantNamespaceId
) {
  const list = Array.isArray(partPaths) ? partPaths : [];
  const totalSize = Number(expectedTotalSize);
  if (!Number.isInteger(totalSize) || totalSize < 0) {
    const err = new Error('expectedTotalSize inválido para encryptPartFilesAtomic.');
    err.statusCode = 400;
    throw err;
  }

  const normalizedExpectedSha =
    typeof expectedSha256Hex === 'string' && expectedSha256Hex.trim().length > 0
      ? expectedSha256Hex.trim().toLowerCase()
      : null;
  if (normalizedExpectedSha && !/^[a-f0-9]{64}$/.test(normalizedExpectedSha)) {
    const err = new Error('expectedSha256Hex malformado.');
    err.statusCode = 400;
    throw err;
  }

  const masterKey = getMasterKey();
  const tenantKey = deriveTenantKey(masterKey, tenantNamespaceId);

  // Passo 1: validar soma exata dos tamanhos e calcular SHA-256 em streaming sem escrita temporária
  let observedSize = 0;
  const hash = crypto.createHash('sha256');
  for (const partPath of list) {
    const st = await fs.promises.stat(partPath);
    if (!st.isFile()) {
      const err = new Error(`Parte inválida ou ausente: ${partPath}`);
      err.statusCode = 400;
      throw err;
    }
    observedSize += st.size;
    if (st.size > 0) {
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(partPath, { highWaterMark: DEFAULT_CHUNK_SIZE });
        rs.on('data', (chunk) => hash.update(chunk));
        rs.on('end', resolve);
        rs.on('error', reject);
      });
    }
  }

  if (observedSize !== totalSize) {
    const err = new Error(`Soma das partes (${observedSize}) diverge do tamanho esperado (${totalSize}).`);
    err.statusCode = 400;
    throw err;
  }

  const plaintextSha256 = hash.digest();
  const plaintextSha256Hex = plaintextSha256.toString('hex');
  if (normalizedExpectedSha && normalizedExpectedSha !== plaintextSha256Hex) {
    const err = new Error('SHA-256 final do plaintext não confere com fileSha256 declarado.');
    err.statusCode = 400;
    throw err;
  }

  const fileSalt = crypto.randomBytes(16);
  const noncePrefix = crypto.randomBytes(4);
  const fileKey = deriveFileKey(tenantKey, fileSalt);

  const headerBuf = buildHeader({
    chunkSize: DEFAULT_CHUNK_SIZE,
    plaintextSize: totalSize,
    fileSalt,
    noncePrefix,
    plaintextSha256,
  });

  const path = require('path');
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  // Sempre no mesmo diretório/volume de destPath para rename atômico sem EXDEV
  const tmpDest = `${destPath}.${process.pid}.${Date.now()}.enc.tmp`;
  const outFd = await fs.promises.open(tmpDest, 'w', 0o600);

  const writePlainChunk = async (plainSlice, chunkIdx, isFinal, outPos) => {
    const nonce = buildChunkNonce(noncePrefix, chunkIdx);
    const aad = buildChunkAad(headerBuf, chunkIdx, isFinal);
    const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, nonce);
    cipher.setAAD(aad);
    const enc = plainSlice.length > 0
      ? Buffer.concat([cipher.update(plainSlice), cipher.final()])
      : cipher.final();
    const tag = cipher.getAuthTag();
    let nextPos = outPos;
    if (enc.length > 0) {
      await outFd.write(enc, 0, enc.length, nextPos);
      nextPos += enc.length;
    }
    await outFd.write(tag, 0, AUTH_TAG_SIZE, nextPos);
    nextPos += AUTH_TAG_SIZE;
    return nextPos;
  };

  try {
    await outFd.write(headerBuf, 0, HEADER_SIZE, 0);
    let outPos = HEADER_SIZE;

    if (totalSize === 0) {
      // Arquivo vazio: grava exatamente 1 chunk vazio autenticado conforme parser AURTENC2
      outPos = await writePlainChunk(Buffer.alloc(0), 0, true, outPos);
    } else {
      const totalChunks = Math.ceil(totalSize / DEFAULT_CHUNK_SIZE);
      const readBuf = Buffer.alloc(DEFAULT_CHUNK_SIZE);
      let chunkIdx = 0;
      let carry = Buffer.alloc(0);

      for (const partPath of list) {
        const inFd = await fs.promises.open(partPath, 'r');
        let inPos = 0;
        try {
          while (true) {
            const { bytesRead } = await inFd.read(readBuf, 0, DEFAULT_CHUNK_SIZE, inPos);
            if (bytesRead <= 0) break;
            inPos += bytesRead;

            const incoming = readBuf.subarray(0, bytesRead);
            let combined = carry.length > 0 ? Buffer.concat([carry, incoming]) : Buffer.from(incoming);
            let offset = 0;

            while (combined.length - offset >= DEFAULT_CHUNK_SIZE) {
              const slice = combined.subarray(offset, offset + DEFAULT_CHUNK_SIZE);
              const isFinal = chunkIdx === totalChunks - 1;
              outPos = await writePlainChunk(slice, chunkIdx, isFinal, outPos);
              chunkIdx++;
              offset += DEFAULT_CHUNK_SIZE;
            }
            carry = offset < combined.length ? Buffer.from(combined.subarray(offset)) : Buffer.alloc(0);
          }
        } finally {
          await inFd.close().catch(() => {});
        }
      }

      if (carry.length > 0) {
        outPos = await writePlainChunk(carry, chunkIdx, true, outPos);
        chunkIdx++;
      }

      if (chunkIdx !== totalChunks) {
        throw new Error(`Contagem de chunks inconsistente na criptografia (${chunkIdx} != ${totalChunks}).`);
      }
    }

    await outFd.sync();
  } catch (err) {
    await outFd.close().catch(() => {});
    await fs.promises.unlink(tmpDest).catch(() => {});
    throw err;
  }

  await outFd.close();
  await fs.promises.rename(tmpDest, destPath);
  return { plaintextSize: totalSize, plaintextSha256Hex };
}

module.exports = {
  MAGIC,
  VERSION,
  HEADER_SIZE,
  DEFAULT_CHUNK_SIZE,
  AUTH_TAG_SIZE,
  isEncryptionEnabled,
  getMasterKey,
  deriveTenantKey,
  deriveFileKey,
  readEncryptedHeader,
  readEncryptedHeaderSync,
  encryptFileAtomic,
  encryptBufferToFile,
  encryptPartFilesAtomic,
  createDecryptStream,
  decryptBuffer,
  computeFileSha256,
};
