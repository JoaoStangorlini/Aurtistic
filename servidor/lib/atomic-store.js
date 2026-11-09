// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/atomic-store.js
 * Utilitário de persistência atômica com arquivo temporário e mutex
 * Seguro para FAT32 / ext4 no Fire Stick
 */

const fs = require('fs');
const path = require('path');

let writeQueues = new Map();

/**
 * Grava um arquivo de forma atômica escrevendo primeiro em .tmp e substituindo via fs.promises.rename.
 * Enfileira gravações por caminho de arquivo para evitar concorrência.
 *
 * @param {string} filePath - Caminho absoluto de destino
 * @param {string|Buffer} data - Conteúdo a ser gravado
 * @param {string} encoding - Padrão 'utf8'
 * @returns {Promise<void>}
 */
function atomicWriteFile(filePath, data, encoding = 'utf8') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  const prevPromise = writeQueues.get(filePath) || Promise.resolve();

  const nextPromise = prevPromise
    .then(async () => {
      const tmpPath = `${filePath}.${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`;
      await fs.promises.writeFile(tmpPath, data, encoding);
      try {
        await fs.promises.rename(tmpPath, filePath);
      } catch (err) {
        // Fallback para sistemas de arquivos que bloqueiem rename atômico direto
        if (fs.existsSync(tmpPath)) {
          try {
            await fs.promises.copyFile(tmpPath, filePath);
            await fs.promises.unlink(tmpPath);
          } catch (copyErr) {
            try { await fs.promises.unlink(tmpPath); } catch {}
            throw copyErr;
          }
        } else {
          throw err;
        }
      }
    })
    .catch((err) => {
      console.error(`[AtomicStore] Erro ao gravar atomicamente ${filePath}:`, err.message);
      throw err;
    })
    .finally(() => {
      if (writeQueues.get(filePath) === nextPromise) {
        writeQueues.delete(filePath);
      }
    });

  writeQueues.set(filePath, nextPromise);
  return nextPromise;
}

module.exports = {
  atomicWriteFile,
};

