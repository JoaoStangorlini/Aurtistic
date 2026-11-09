// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/share-manager.js
 * Gerenciador de links de compartilhamento temporários (Sprint 3 / V11.0).
 * Suporta permissões ('view', 'proofing', 'upload_only'), expiração automática,
 * marca d'água opcional e persistência atômica em shares.json.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ShareManager {
  /**
   * @param {string} sharesFilePath - Caminho completo para shares.json
   */
  constructor(sharesFilePath) {
    this.filePath = sharesFilePath;
    this.shares = new Map();
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id) {
              this.shares.set(item.id, item);
            }
          }
        }
      } else {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.persist();
      }
    } catch (err) {
      console.warn('[ShareManager] Erro ao carregar shares.json, iniciando vazio:', err.message);
    }
  }

  persist() {
    try {
      const arr = Array.from(this.shares.values());
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(arr, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[ShareManager] Falha ao persistir shares.json:', err.message);
    }
  }

  /**
   * Cria um novo link de compartilhamento.
   * @param {Object} options
   * @param {string} options.targetPath - Caminho da pasta ou álbum
   * @param {string} [options.title] - Título amigável
   * @param {string} [options.mode] - 'view' | 'proofing' | 'upload_only'
   * @param {number|null} [options.expiresInHours] - Horas até expirar (ex: 24, 168, 720 ou null)
   * @param {boolean} [options.allowZip] - Se permite baixar .ZIP
   * @param {boolean} [options.watermark] - Se aplica marca d'água no cliente e bloqueia download original
   * @param {string} [options.createdBy] - Usuário que criou
   * @returns {Object} Share record criado
   */
  createShare({
    targetPath,
    title = '',
    mode = 'view',
    expiresInHours = 168, // Padrão 7 dias
    allowZip = true,
    watermark = false,
    createdBy = 'adm',
  }) {
    const id = crypto.randomBytes(12).toString('hex');
    const now = new Date();
    let expiresAt = null;

    if (expiresInHours && Number(expiresInHours) > 0) {
      expiresAt = new Date(now.getTime() + Number(expiresInHours) * 3600 * 1000).toISOString();
    }

    const share = {
      id,
      targetPath: String(targetPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
      title: title || path.basename(targetPath || 'Compartilhamento'),
      mode: ['view', 'proofing', 'upload_only'].includes(mode) ? mode : 'view',
      createdAt: now.toISOString(),
      expiresAt,
      allowZip: watermark ? false : Boolean(allowZip),
      watermark: Boolean(watermark),
      createdBy,
      viewCount: 0,
      clientNotes: '',
      selectedItems: [],
      feedbackSubmittedAt: null,
      status: 'active',
    };

    this.shares.set(id, share);
    this.persist();
    return share;
  }

  /**
   * Busca e valida um link de compartilhamento pelo ID / token.
   * @param {string} id
   * @returns {{ valid: boolean, error?: string, share?: Object }}
   */
  getShare(id) {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: 'Token inválido.' };
    }

    const share = this.shares.get(id);
    if (!share) {
      return { valid: false, error: 'Link de compartilhamento não encontrado.' };
    }

    if (share.status === 'revoked') {
      return { valid: false, error: 'Este link de compartilhamento foi revogado.' };
    }

    if (share.expiresAt) {
      const now = new Date().getTime();
      const exp = new Date(share.expiresAt).getTime();
      if (now > exp) {
        share.status = 'expired';
        this.persist();
        return { valid: false, error: 'Este link de compartilhamento expirou.' };
      }
    }

    return { valid: true, share };
  }

  /**
   * Registra incremento de acesso a um link.
   * @param {string} id
   */
  recordAccess(id) {
    const s = this.shares.get(id);
    if (s) {
      s.viewCount = (s.viewCount || 0) + 1;
      s.lastAccessedAt = new Date().toISOString();
      this.persist();
    }
  }

  /**
   * Salva o feedback do cliente no modo 'proofing' (seleção de fotos e notas).
   * @param {string} id
   * @param {Array<string>} selectedItems
   * @param {string} clientNotes
   * @returns {Object}
   */
  saveClientFeedback(id, selectedItems = [], clientNotes = '') {
    const { valid, error, share } = this.getShare(id);
    if (!valid) throw new Error(error);

    share.selectedItems = Array.isArray(selectedItems) ? selectedItems : [];
    share.clientNotes = String(clientNotes || '').trim();
    share.feedbackSubmittedAt = new Date().toISOString();
    this.persist();
    return share;
  }

  /**
   * Revoga um link.
   * @param {string} id
   * @returns {boolean}
   */
  revokeShare(id) {
    const share = this.shares.get(id);
    if (share) {
      share.status = 'revoked';
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * Exclui um link.
   * @param {string} id
   * @returns {boolean}
   */
  deleteShare(id) {
    const deleted = this.shares.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Lista todos os links de compartilhamento.
   * @returns {Array<Object>}
   */
  listShares() {
    const now = new Date().getTime();
    const result = [];
    for (const share of this.shares.values()) {
      if (share.status === 'active' && share.expiresAt && now > new Date(share.expiresAt).getTime()) {
        share.status = 'expired';
      }
      result.push({ ...share });
    }
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = ShareManager;

