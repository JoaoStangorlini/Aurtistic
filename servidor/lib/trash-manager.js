// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/trash-manager.js
 * Gerenciador da Lixeira Centralizada (.trash) com retenção automática de 15 dias,
 * metadados de exclusão e restauração segura.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RETENTION_DAYS = 15;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

class TrashManager {
  constructor(storageDir) {
    this.storageDir = path.resolve(storageDir);
    this.trashDir = path.join(this.storageDir, '.trash');
    this.manifestPath = path.join(this.trashDir, 'trash_manifest.json');
    this._ensureInit();
  }

  _ensureInit() {
    try {
      if (!fs.existsSync(this.trashDir)) {
        fs.mkdirSync(this.trashDir, { recursive: true });
      }
      if (!fs.existsSync(this.manifestPath)) {
        fs.writeFileSync(this.manifestPath, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('[TrashManager] Erro ao inicializar diretório de lixeira:', err.message);
    }
  }

  _readManifest() {
    try {
      if (!fs.existsSync(this.manifestPath)) return [];
      const raw = fs.readFileSync(this.manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  _writeManifest(items) {
    try {
      const tmp = `${this.manifestPath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf-8');
      fs.renameSync(tmp, this.manifestPath);
    } catch (err) {
      console.error('[TrashManager] Erro ao gravar manifesto:', err.message);
    }
  }

  /**
   * Move um arquivo ou diretório físico para a lixeira.
   * @param {string} fullPath - Caminho absoluto no disco
   * @param {string} originalRelPath - Caminho relativo original no cofre/portfólio
   * @param {string} [deletedBy='admin'] - Identificador do usuário
   */
  async moveToTrash(fullPath, originalRelPath, deletedBy = 'admin') {
    if (!fs.existsSync(fullPath)) {
      throw new Error('Arquivo ou pasta de origem não encontrado.');
    }

    const stat = await fs.promises.stat(fullPath);
    const isDirectory = stat.isDirectory();
    const id = `trash_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const baseName = path.basename(fullPath);
    const trashFileName = `${id}__${baseName}`;
    const trashFullPath = path.join(this.trashDir, trashFileName);

    // Move fisicamente o arquivo/pasta
    await fs.promises.rename(fullPath, trashFullPath);

    const now = Date.now();
    const entry = {
      id,
      trashFileName,
      originalBaseName: baseName,
      originalRelPath: originalRelPath.replace(/\\/g, '/').replace(/^\/+/, ''),
      isDirectory,
      sizeBytes: isDirectory ? 0 : stat.size,
      deletedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + RETENTION_MS).toISOString(),
      deletedBy,
    };

    const manifest = this._readManifest();
    manifest.unshift(entry);
    this._writeManifest(manifest);

    return entry;
  }

  /**
   * Lista todos os itens na lixeira, calculando os dias restantes.
   */
  list() {
    this.cleanExpired();
    const manifest = this._readManifest();
    const now = Date.now();

    return manifest.map((item) => {
      const expiresTime = new Date(item.expiresAt).getTime();
      const remainingMs = Math.max(0, expiresTime - now);
      const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      return {
        ...item,
        remainingDays,
      };
    });
  }

  /**
   * Restaura um item da lixeira para seu local original.
   * @param {string} id - ID da entrada na lixeira
   */
  async restore(id) {
    const manifest = this._readManifest();
    const idx = manifest.findIndex((it) => it.id === id);
    if (idx === -1) {
      throw new Error('Item não encontrado na lixeira.');
    }

    const item = manifest[idx];
    const trashFullPath = path.join(this.trashDir, item.trashFileName);

    if (!fs.existsSync(trashFullPath)) {
      // Se não existir o arquivo no disco, limpa o manifesto
      manifest.splice(idx, 1);
      this._writeManifest(manifest);
      throw new Error('Arquivo físico não encontrado na lixeira.');
    }

    const destFullPath = path.join(this.storageDir, item.originalRelPath);
    const destParent = path.dirname(destFullPath);

    if (!fs.existsSync(destParent)) {
      await fs.promises.mkdir(destParent, { recursive: true });
    }

    // Se já existir no destino, renomeia com sufixo (restored)
    let finalDest = destFullPath;
    if (fs.existsSync(finalDest)) {
      const ext = path.extname(item.originalBaseName);
      const nameWithoutExt = path.basename(item.originalBaseName, ext);
      finalDest = path.join(destParent, `${nameWithoutExt}_restored_${Date.now()}${ext}`);
    }

    await fs.promises.rename(trashFullPath, finalDest);

    // Remove do manifesto
    manifest.splice(idx, 1);
    this._writeManifest(manifest);

    return {
      success: true,
      restoredPath: finalDest,
      originalRelPath: item.originalRelPath,
      isDirectory: item.isDirectory,
    };
  }

  /**
   * Exclui definitivamente um item específico da lixeira.
   */
  async purge(id) {
    const manifest = this._readManifest();
    const idx = manifest.findIndex((it) => it.id === id);
    if (idx === -1) return false;

    const item = manifest[idx];
    const trashFullPath = path.join(this.trashDir, item.trashFileName);

    try {
      if (fs.existsSync(trashFullPath)) {
        if (item.isDirectory) {
          await fs.promises.rm(trashFullPath, { recursive: true, force: true });
        } else {
          await fs.promises.unlink(trashFullPath);
        }
      }
    } catch (err) {
      console.warn('[TrashManager] Erro ao excluir fisicamente:', err.message);
    }

    manifest.splice(idx, 1);
    this._writeManifest(manifest);
    return true;
  }

  /**
   * Esvazia completamente a lixeira.
   */
  async empty() {
    const manifest = this._readManifest();
    for (const item of manifest) {
      const trashFullPath = path.join(this.trashDir, item.trashFileName);
      try {
        if (fs.existsSync(trashFullPath)) {
          if (item.isDirectory) {
            await fs.promises.rm(trashFullPath, { recursive: true, force: true });
          } else {
            await fs.promises.unlink(trashFullPath);
          }
        }
      } catch {}
    }
    this._writeManifest([]);
    return { success: true, count: manifest.length };
  }

  /**
   * Limpa automaticamente itens expirados (> 15 dias).
   */
  async cleanExpired() {
    try {
      const manifest = this._readManifest();
      const now = Date.now();
      const valid = [];

      for (const item of manifest) {
        const expiresTime = new Date(item.expiresAt).getTime();
        if (expiresTime <= now) {
          const trashFullPath = path.join(this.trashDir, item.trashFileName);
          try {
            if (fs.existsSync(trashFullPath)) {
              if (item.isDirectory) {
                await fs.promises.rm(trashFullPath, { recursive: true, force: true });
              } else {
                await fs.promises.unlink(trashFullPath);
              }
            }
          } catch {}
        } else {
          valid.push(item);
        }
      }

      if (valid.length !== manifest.length) {
        this._writeManifest(valid);
      }
    } catch {}
  }
}

module.exports = TrashManager;

