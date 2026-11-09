// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/deduplicator.js
 * Identificação de arquivos duplicados por tamanho e hash SHA-256 (streaming)
 * e conversão assistida em Atalhos Virtuais para liberar espaço real no HD.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Calcula hash SHA-256 de um arquivo via streaming para não sobrecarregar a RAM.
 */
function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Escaneia recursivamente um diretório coletando arquivos por tamanho.
 */
async function scanFilesBySize(dir, baseDir = dir, result = new Map()) {
  const IGNORED = new Set(['.trash', '.git', 'node_modules', 'thumbs', '.tmp']);
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const d of dirents) {
    if (IGNORED.has(d.name)) continue;
    const full = path.join(dir, d.name);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');

    if (d.isDirectory()) {
      await scanFilesBySize(full, baseDir, result);
    } else if (d.isFile()) {
      try {
        const stat = await fs.promises.stat(full);
        if (stat.size > 1024) { // Ignora arquivos minúsculos < 1KB
          if (!result.has(stat.size)) {
            result.set(stat.size, []);
          }
          result.get(stat.size).push({
            name: d.name,
            fullPath: full,
            relPath: rel,
            sizeBytes: stat.size,
            mtime: stat.mtime,
          });
        }
      } catch {}
    }
  }
  return result;
}

/**
 * Localiza duplicatas reais comparando hash apenas dos arquivos com tamanhos idênticos.
 */
async function findDuplicates(targetDir) {
  const sizeMap = await scanFilesBySize(targetDir);
  const duplicateGroups = [];

  for (const [size, files] of sizeMap.entries()) {
    if (files.length < 2) continue; // Sem duplicatas em potencial

    const hashMap = new Map();
    for (const f of files) {
      try {
        const hash = await computeFileHash(f.fullPath);
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash).push({
          ...f,
          hash,
        });
      } catch {}
    }

    for (const [hash, group] of hashMap.entries()) {
      if (group.length > 1) {
        // Ordena por data de modificação mais antiga para mais recente (o original é o mais antigo)
        group.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));
        const original = group[0];
        const copies = group.slice(1);
        const wastedBytes = (group.length - 1) * original.sizeBytes;

        duplicateGroups.push({
          hash,
          sizeBytes: original.sizeBytes,
          original,
          copies,
          totalFiles: group.length,
          wastedBytes,
        });
      }
    }
  }

  // Ordena os grupos pelos que mais gastam espaço no HD
  duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  const totalWastedBytes = duplicateGroups.reduce((acc, g) => acc + g.wastedBytes, 0);

  return {
    groups: duplicateGroups,
    totalDuplicateFiles: duplicateGroups.reduce((acc, g) => acc + g.copies.length, 0),
    totalWastedBytes,
  };
}

module.exports = {
  findDuplicates,
  computeFileHash,
};

