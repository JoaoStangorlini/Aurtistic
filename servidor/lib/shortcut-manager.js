// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/shortcut-manager.js
 * Gerenciamento lógico de Atalhos Virtuais (sem consumir bytes extras no HD)
 * e propagação em cascata quando o arquivo original sofrer alterações.
 */

const crypto = require('crypto');

/**
 * Cria uma entrada de atalho virtual apontando para um item físico existente.
 *
 * @param {Object} memoryCatalog - Referência ao catálogo em memória
 * @param {Object} params - { targetItemId, targetAlbum, targetSubalbum, aliasTitle }
 * @returns {Object} O item de atalho virtual criado
 */
function createVirtualShortcut(memoryCatalog, { targetItemId, targetAlbum, targetSubalbum = null, aliasTitle = null }) {
  if (!memoryCatalog || !Array.isArray(memoryCatalog.items)) {
    throw new Error('Catálogo inválido.');
  }

  const targetItem = memoryCatalog.items.find((it) => it.id === targetItemId);
  if (!targetItem) {
    throw new Error('Arquivo original não encontrado no catálogo.');
  }

  // Se o item selecionado já for um atalho, resolve até a raiz física
  const realTargetId = targetItem.isShortcut ? targetItem.targetId : targetItem.id;
  const realTarget = memoryCatalog.items.find((it) => it.id === realTargetId) || targetItem;

  const targetRel = realTarget.relativePath || (realTarget.album && realTarget.originalFile ? `${realTarget.album}/${realTarget.originalFile}` : '');
  const cleanTargetAlbum = String(targetAlbum || '').trim();
  const cleanTargetSub = targetSubalbum ? String(targetSubalbum).trim() : null;

  if (!cleanTargetAlbum) {
    throw new Error('Álbum de destino obrigatório para o atalho.');
  }

  const shortcutSeed = `${realTarget.id}_to_${cleanTargetAlbum}_${cleanTargetSub || ''}_${Date.now()}`;
  const shortcutHash = crypto.createHash('md5').update(shortcutSeed).digest('hex');
  const shortcutId = `sc_${shortcutHash.slice(0, 16)}`;

  // Garante rotas corretas de mídia apontando para o arquivo real
  const encodedRealRel = targetRel.split('/').map(encodeURIComponent).join('/');
  const realOriginalUrl = realTarget.originalUrl || `/portfolio-media/content/${encodedRealRel}`;
  const realThumbUrl = realTarget.thumbUrl || `/portfolio-media/thumb/${encodedRealRel}`;

  const shortcutItem = {
    id: shortcutId,
    title: aliasTitle ? String(aliasTitle).trim() : realTarget.title || realTarget.originalFile,
    album: cleanTargetAlbum,
    subalbum: cleanTargetSub,
    description: realTarget.description || '',
    originalFile: realTarget.originalFile,
    relativePath: realTarget.relativePath,
    fileSig: realTarget.fileSig,
    originalUrl: realOriginalUrl,
    thumbUrl: realThumbUrl,
    width: realTarget.width,
    height: realTarget.height,
    sizeBytes: realTarget.sizeBytes || 0,
    thumbBytes: realTarget.thumbBytes || 0,
    exif: realTarget.exif || {},
    featured: false,
    visibility: realTarget.visibility || 'public',
    order: memoryCatalog.items.length,
    span: realTarget.span || '1x1',
    fit: realTarget.fit || 'auto',
    aspectRatioOverride: realTarget.aspectRatioOverride || 'auto',
    focalPoint: realTarget.focalPoint || { x: 50, y: 50 },
    createdAt: new Date().toISOString(),
    isFavorite: false,
    tags: Array.isArray(realTarget.tags) ? [...realTarget.tags] : [],
    // Campos de marcação virtual
    isShortcut: true,
    targetId: realTarget.id,
    targetRelativePath: targetRel,
  };

  memoryCatalog.items.push(shortcutItem);

  // Garante que o álbum destino exista na lista de álbuns
  if (!memoryCatalog.albums.includes(cleanTargetAlbum)) {
    memoryCatalog.albums.push(cleanTargetAlbum);
  }
  if (cleanTargetSub) {
    if (!memoryCatalog.subalbums) memoryCatalog.subalbums = {};
    if (!Array.isArray(memoryCatalog.subalbums[cleanTargetAlbum])) {
      memoryCatalog.subalbums[cleanTargetAlbum] = [];
    }
    if (!memoryCatalog.subalbums[cleanTargetAlbum].includes(cleanTargetSub)) {
      memoryCatalog.subalbums[cleanTargetAlbum].push(cleanTargetSub);
    }
  }

  return shortcutItem;
}

/**
 * Remove um atalho virtual do catálogo sem tocar no disco físico
 *
 * @param {Object} memoryCatalog
 * @param {string} shortcutId
 * @returns {boolean} Se foi removido com sucesso
 */
function removeVirtualShortcut(memoryCatalog, shortcutId) {
  if (!memoryCatalog || !Array.isArray(memoryCatalog.items)) return false;
  const idx = memoryCatalog.items.findIndex((it) => it.id === shortcutId && it.isShortcut);
  if (idx === -1) return false;
  memoryCatalog.items.splice(idx, 1);
  return true;
}

/**
 * Atualiza todos os atalhos vinculados quando o arquivo original for movido ou renomeado
 *
 * @param {Object} memoryCatalog
 * @param {string} targetId - ID do arquivo físico original
 * @param {string} newRelativePath - Novo relativePath físico
 * @param {string} newThumbUrl - Nova URL de miniatura
 * @param {string} newOriginalUrl - Nova URL de mídia original
 */
function syncShortcutsCascade(memoryCatalog, targetId, newRelativePath, newThumbUrl, newOriginalUrl) {
  if (!memoryCatalog || !Array.isArray(memoryCatalog.items)) return 0;
  let updatedCount = 0;

  for (const it of memoryCatalog.items) {
    if (it.isShortcut && it.targetId === targetId) {
      if (newRelativePath) {
        it.targetRelativePath = newRelativePath;
        it.relativePath = newRelativePath;
      }
      if (newThumbUrl) it.thumbUrl = newThumbUrl;
      if (newOriginalUrl) it.originalUrl = newOriginalUrl;
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Preserva atalhos virtuais válidos durante o escaneamento do disco físico
 *
 * @param {Array} previousItems - Itens anteriores em memoryCatalog.items
 * @param {Array} scannedPhysicalItems - Novos itens gerados pela leitura física do HD
 * @returns {Array} Array combinado com físicos + atalhos cujo targetId existe
 */
function mergeShortcutsAfterScan(previousItems = [], scannedPhysicalItems = []) {
  const physicalIdSet = new Set(scannedPhysicalItems.map((it) => it.id));
  const validShortcuts = [];

  for (const prev of previousItems) {
    if (prev.isShortcut && prev.targetId) {
      // O atalho só sobrevive se seu targetId ainda existe fisicamente no catálogo
      const targetPhysical = scannedPhysicalItems.find((it) => it.id === prev.targetId);
      if (targetPhysical) {
        // Atualiza URLs de miniatura e original sincronizadas com o físico
        prev.thumbUrl = targetPhysical.thumbUrl;
        prev.originalUrl = targetPhysical.originalUrl;
        prev.targetRelativePath = targetPhysical.relativePath;
        prev.relativePath = targetPhysical.relativePath;
        validShortcuts.push(prev);
      }
    }
  }

  return [...scannedPhysicalItems, ...validShortcuts];
}


/**
 * Normaliza caminhos de pastas para scopeKey único (compatível entre Cofre e Portfólio).
 * Ex: 'portfolio/BAHIA' -> 'BAHIA', 'stangorlini/BAHIA' -> 'BAHIA', 'portfolio/POLÍTICAS/SUB' -> 'POLÍTICAS::SUB', 'vault' -> 'vault'
 * Para a raiz de portfolio ou stangorlini, retorna a chave canônica 'portfolio' ou 'stangorlini' (nunca string vazia).
 */
function normalizeFolderScopeKey(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return '';
  let clean = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean === 'portfolio') return 'portfolio';
  if (clean === 'stangorlini') return 'stangorlini';
  if (clean.startsWith('stangorlini/')) {
    clean = clean.slice('stangorlini/'.length);
  }
  if (clean.startsWith('portfolio/')) {
    clean = clean.slice('portfolio/'.length);
  }
  return clean.replace(/\//g, '::');
}

module.exports = {
  normalizeFolderScopeKey,
  createVirtualShortcut,
  removeVirtualShortcut,
  syncShortcutsCascade,
  mergeShortcutsAfterScan,
};

