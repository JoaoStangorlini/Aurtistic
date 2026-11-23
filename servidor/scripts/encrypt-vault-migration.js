// Este programa é um software livre (Licença AGPLv3)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vaultCrypto = require('../lib/vault-crypto');

const CONTROL_FILENAMES = new Set([
  '.shortcut.json',
  '.pins.json',
  '.sync-journal.json',
  'webdav_tokens.json',
  'catalog.json',
  'sig_index.json',
]);

function isControlOrTempFile(name) {
  if (CONTROL_FILENAMES.has(name)) return true;
  if (
    name.startsWith('.aurt_tmp_') ||
    name.startsWith('.aurt_chunk_') ||
    name.endsWith('.tmp') ||
    name.endsWith('.enc.tmp')
  ) {
    return true;
  }
  return false;
}

async function migrateDirectory(rootDir, tenantNamespaceId, options = {}) {
  const apply = Boolean(options.apply);
  const stats = {
    scanned: 0,
    encrypted: 0,
    skippedAlreadyEncrypted: 0,
    skippedControlOrSymlink: 0,
    errors: 0,
    bytesVerified: 0,
  };

  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: false });
    for (const name of entries) {
      const fullPath = path.join(dir, name);
      const lst = await fs.promises.lstat(fullPath);

      if (lst.isSymbolicLink()) {
        stats.skippedControlOrSymlink++;
        continue;
      }
      if (lst.isDirectory()) {
        if (name.startsWith('.aurt_chunk_')) {
          stats.skippedControlOrSymlink++;
          continue;
        }
        if (name === '.trash') {
          // Pula metadados JSON da lixeira dentro de .trash mas cifra arquivos reais
          await walk(fullPath);
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (!lst.isFile()) continue;

      if (isControlOrTempFile(name) || (dir.endsWith(`${path.sep}.trash`) && name.endsWith('.json'))) {
        stats.skippedControlOrSymlink++;
        continue;
      }

      stats.scanned++;
      const existingHeader = await vaultCrypto.readEncryptedHeader(fullPath).catch(() => null);
      if (existingHeader) {
        stats.skippedAlreadyEncrypted++;
        continue;
      }

      if (!apply) {
        stats.encrypted++;
        stats.bytesVerified += lst.size;
        continue;
      }

      try {
        const shaBefore = await vaultCrypto.computeFileSha256(fullPath);
        const tmpEncrypted = `${fullPath}.mig.enc.tmp`;
        await vaultCrypto.encryptFileAtomic(fullPath, tmpEncrypted, tenantNamespaceId);

        // Verifica round-trip descriptografando
        const decBuf = await vaultCrypto.decryptBuffer(tmpEncrypted, tenantNamespaceId);
        const shaAfter = crypto.createHash('sha256').update(decBuf).digest();
        if (!shaBefore.equals(shaAfter) || decBuf.length !== lst.size) {
          await fs.promises.unlink(tmpEncrypted).catch(() => {});
          throw new Error(`Falha na verificação de integridade pós-cifragem: ${fullPath}`);
        }

        await fs.promises.rename(tmpEncrypted, fullPath);
        stats.encrypted++;
        stats.bytesVerified += lst.size;
      } catch (err) {
        stats.errors++;
        console.error(`[MIGRATION ERROR] ${fullPath}: ${err.message}`);
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    await walk(rootDir);
  }
  return stats;
}

async function runCli() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const confirmed = args.includes('--i-have-backed-up-hd-and-key');
  const allVolumes = args.includes('--all-volumes');
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const targetRoot = dirArg ? dirArg.slice(6) : process.env.STORAGE_DIR;

  if (apply && !confirmed) {
    console.error('ERRO: Para executar com --apply é obrigatório passar --i-have-backed-up-hd-and-key.');
    process.exit(1);
  }

  let rootsToScan = [];
  if (allVolumes) {
    const storagePool = require('../lib/storage-pool');
    rootsToScan = storagePool.discoverStorageVolumes(targetRoot).filter((v) => v.online).map((v) => v.rootDir);
  } else if (targetRoot && fs.existsSync(targetRoot)) {
    rootsToScan = [targetRoot];
  }

  if (rootsToScan.length === 0) {
    console.error('ERRO: Nenhum diretório alvo encontrado. Informe --dir=/caminho/do/storage ou --all-volumes.');
    process.exit(1);
  }

  // Garante chave válida antes de iniciar (fail-closed)
  vaultCrypto.getMasterKey();

  const total = { scanned: 0, encrypted: 0, skippedAlreadyEncrypted: 0, skippedControlOrSymlink: 0, errors: 0, bytesVerified: 0, volumesScanned: rootsToScan.length };
  for (const root of rootsToScan) {
    for (const scopeType of ['users', 'orgs']) {
      const scopeDir = path.join(root, scopeType);
      if (!fs.existsSync(scopeDir)) continue;
      const tenants = await fs.promises.readdir(scopeDir);
      for (const id of tenants) {
        const tenantDir = path.join(scopeDir, id);
        const st = await fs.promises.lstat(tenantDir);
        if (!st.isDirectory() || st.isSymbolicLink()) continue;
        const ns = scopeType === 'users' ? `user:${id}` : `org:${id}`;
        const res = await migrateDirectory(tenantDir, ns, { apply });
        total.scanned += res.scanned;
        total.encrypted += res.encrypted;
        total.skippedAlreadyEncrypted += res.skippedAlreadyEncrypted;
        total.skippedControlOrSymlink += res.skippedControlOrSymlink;
        total.errors += res.errors;
        total.bytesVerified += res.bytesVerified;
      }
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', ...total }, null, 2));
  if (total.errors > 0) process.exit(1);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrateDirectory, isControlOrTempFile };
