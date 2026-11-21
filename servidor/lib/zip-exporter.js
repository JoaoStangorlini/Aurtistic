// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/zip-exporter.js
 * Streaming de diretórios em formato .ZIP sob demanda (Sprint 3 / V11.0).
 * Utiliza fflate em modo ZipPassThrough (STORE / Level 0) para zero impacto na CPU do Fire Stick.
 * Aborta imediatamente se a conexão do cliente for interrompida (req.on('close')).
 */

const fs = require('fs');
const path = require('path');
const fflate = require('fflate');
const vaultCrypto = require('./vault-crypto');

const IGNORED_ENTRIES = new Set([
  '.trash',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '__MACOSX',
  'trash_manifest.json',
  'catalog.json',
  'shares.json',
  'audit.jsonl',
]);

/**
 * Coleta recursivamente todos os arquivos de uma pasta.
 * @param {string} baseDir - Diretório raiz da exportação
 * @param {string} currentDir - Subdiretório atual
 * @param {((relPath: string, isDir: boolean) => boolean)|null} [isPathAllowedFn] - Predicado de permissão
 * @returns {Promise<Array<{ absolutePath: string, relativePath: string, size: number }>>}
 */
async function collectFiles(baseDir, currentDir = '', isPathAllowedFn = null) {
  const fullPath = path.join(baseDir, currentDir);
  const dirents = await fs.promises.readdir(fullPath, { withFileTypes: true }).catch(() => []);
  let files = [];

  for (const d of dirents) {
    if (IGNORED_ENTRIES.has(d.name) || d.name.startsWith('.tmp')) continue;

    const rel = currentDir ? `${currentDir}/${d.name}` : d.name;
    const abs = path.join(fullPath, d.name);

    if (isPathAllowedFn && !isPathAllowedFn(rel, d.isDirectory())) {
      continue;
    }

    if (d.isDirectory()) {
      const subFiles = await collectFiles(baseDir, rel, isPathAllowedFn);
      files = files.concat(subFiles);
    } else if (d.isFile()) {
      try {
        const encHdr = await vaultCrypto.readEncryptedHeader(abs).catch(() => null);
        const stat = await fs.promises.stat(abs);
        files.push({
          absolutePath: abs,
          relativePath: rel.replace(/\\/g, '/'),
          size: encHdr ? encHdr.plaintextSize : stat.size,
          encrypted: Boolean(encHdr),
        });
      } catch {}
    }
  }

  return files;
}

/**
 * Envia o diretório compactado como stream direto para a resposta HTTP.
 * @param {string} sourceDir - Diretório a compactar
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @param {string} [downloadFilename] - Nome do arquivo para download
 * @param {Set<string>|Array<string>|null} [filterFiles] - Lista ou conjunto opcional para download seletivo
 * @param {((relPath: string, isDir: boolean) => boolean)|null} [isPathAllowedFn] - Predicado opcional de permissão por caminho/PIN
 */
async function streamDirectoryAsZip(sourceDir, req, res, downloadFilename = 'download.zip', filterFiles = null, isPathAllowedFn = null) {
  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({ error: 'Diretório não encontrado para exportação.' });
  }

  let files = await collectFiles(sourceDir, '', isPathAllowedFn);
  if (filterFiles && (filterFiles instanceof Set || Array.isArray(filterFiles))) {
    const filterSet = filterFiles instanceof Set ? filterFiles : new Set(filterFiles);
    files = files.filter(
      (f) => filterSet.has(f.relativePath) || filterSet.has(path.basename(f.relativePath))
    );
  }

  if (files.length === 0) {
    return res.status(400).json({ error: 'A pasta está vazia ou não contém arquivos exportáveis correspondentes.' });
  }

  let isAborted = false;
  let activeReadStream = null;

  const onAbort = () => {
    isAborted = true;
    if (activeReadStream) {
      try {
        activeReadStream.destroy();
      } catch {}
      activeReadStream = null;
    }
  };

  req.on('close', onAbort);
  res.on('close', onAbort);

  const safeFilename = downloadFilename.replace(/[^a-zA-Z0-9_\u00C0-\u017F\s.-]/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);

  let isDraining = false;
  const zip = new fflate.Zip((err, chunk, isLast) => {
    if (err) {
      console.error('[ZipExporter] Erro no stream do ZIP:', err);
      if (!res.headersSent) res.status(500).end();
      return;
    }
    if (!isAborted && res.writable) {
      const ok = res.write(Buffer.from(chunk));
      if (!ok && activeReadStream && !isDraining) {
        isDraining = true;
        try {
          activeReadStream.pause();
        } catch {}
        res.once('drain', () => {
          isDraining = false;
          if (!isAborted && activeReadStream) {
            try {
              activeReadStream.resume();
            } catch {}
          }
        });
      }
      if (isLast) {
        res.end();
      }
    }
  });

  // Itera sequencialmente pelos arquivos para não estourar descritores de arquivo ou RAM
  for (const file of files) {
    if (isAborted) break;

    await new Promise((resolve) => {
      const zipEntry = new fflate.ZipPassThrough(file.relativePath);
      zip.add(zipEntry);

      const readStream = fs.createReadStream(file.absolutePath, { highWaterMark: 64 * 1024 });
      activeReadStream = readStream;

      readStream.on('data', (chunk) => {
        if (isAborted) {
          readStream.destroy();
          activeReadStream = null;
          resolve();
          return;
        }
        zipEntry.push(chunk);
      });

      readStream.on('end', () => {
        activeReadStream = null;
        zipEntry.push(new Uint8Array(0), true);
        resolve();
      });

      readStream.on('error', (readErr) => {
        activeReadStream = null;
        console.warn(`[ZipExporter] Erro ao ler arquivo ${file.relativePath}:`, readErr.message);
        zipEntry.push(new Uint8Array(0), true);
        resolve();
      });
    });
  }

  if (!isAborted) {
    zip.end();
  }
}

module.exports = {
  streamDirectoryAsZip,
  collectFiles,
};

