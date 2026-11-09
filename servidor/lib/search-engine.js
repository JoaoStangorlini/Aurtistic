// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/search-engine.js
 * Motor de busca e filtros avançados em memória (RAM)
 * Rápido e de baixo consumo de CPU/I/O no Fire Stick
 */

/**
 * Executa busca multi-critério no catálogo em memória
 *
 * @param {Array} items - Array de itens (catalog.items)
 * @param {Object} folderMeta - Mapa settings.layout.folderMeta
 * @param {Object} query - Parâmetros de busca { q, ext, from, to, tags, device, favorite, album, subalbum }
 * @returns {Array} Itens filtrados
 */
function searchCatalogItems(items = [], folderMeta = {}, query = {}) {
  const q = String(query.q || '').trim().toLowerCase();
  const ext = String(query.ext || '').trim().toLowerCase();
  const fromMs = query.from ? new Date(query.from).getTime() : null;
  const toMs = query.to ? new Date(query.to).getTime() : null;
  const targetDevice = query.device ? String(query.device).trim().toLowerCase() : null;
  const onlyFavorite = query.favorite === 'true' || query.favorite === true;
  const targetAlbum = query.album ? String(query.album).trim() : null;
  const targetSubalbum = query.subalbum ? String(query.subalbum).trim() : null;

  // Tags buscadas (suporta separação por vírgula ou espaço)
  const searchTags = query.tags
    ? String(query.tags)
        .split(/[\s,]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
    : [];

  return items.filter((it) => {
    // 1. Filtro de Favorito
    if (onlyFavorite && !it.isFavorite) {
      return false;
    }

    // 2. Filtro de Álbum / Subálbum
    if (targetAlbum && it.album !== targetAlbum) {
      return false;
    }
    if (targetSubalbum && it.subalbum !== targetSubalbum) {
      return false;
    }

    // 3. Filtro por Extensão (.jpg, .mp4, etc.)
    if (ext) {
      const itExt = (it.originalFile ? it.originalFile.slice(it.originalFile.lastIndexOf('.')) : '').toLowerCase();
      const normExt = ext.startsWith('.') ? ext : `.${ext}`;
      if (itExt !== normExt) return false;
    }

    // 4. Filtro por Data (mtimeMs ou createdAt)
    if (fromMs || toMs) {
      const itemTime = it.exifMtimeMs || (it.createdAt ? new Date(it.createdAt).getTime() : null);
      if (itemTime) {
        if (fromMs && itemTime < fromMs) return false;
        if (toMs && itemTime > toMs) return false;
      }
    }

    // 5. Filtro por Tipo de Dispositivo (associado via folderMeta da pasta)
    if (targetDevice && ['phone', 'camera'].includes(targetDevice)) {
      const scopeKey = it.subalbum ? `${it.album}::${it.subalbum}` : it.album;
      const fMeta = folderMeta[scopeKey] || folderMeta[it.album] || {};
      const dev = fMeta.deviceType || (it.metadata?.deviceType);
      if (dev !== targetDevice) return false;
    }

    // 6. Filtro por Tags (todas as tags solicitadas devem coincidir no item ou na pasta)
    if (searchTags.length > 0) {
      const scopeKey = it.subalbum ? `${it.album}::${it.subalbum}` : it.album;
      const fMeta = folderMeta[scopeKey] || {};
      const folderTags = Array.isArray(fMeta.tags) ? fMeta.tags.map((t) => String(t).toLowerCase()) : [];
      const itemTags = Array.isArray(it.tags) ? it.tags.map((t) => String(t).toLowerCase()) : [];
      const combinedTags = new Set([...itemTags, ...folderTags]);

      const matchesAllTags = searchTags.every((st) => combinedTags.has(st));
      if (!matchesAllTags) return false;
    }

    // 7. Filtro de Texto (Nome, Título, Descrição, Álbum, Tags)
    if (q) {
      const name = String(it.originalFile || '').toLowerCase();
      const title = String(it.title || '').toLowerCase();
      const desc = String(it.description || '').toLowerCase();
      const album = String(it.album || '').toLowerCase();
      const sub = String(it.subalbum || '').toLowerCase();
      const itemTagsStr = Array.isArray(it.tags) ? it.tags.join(' ').toLowerCase() : '';

      const match =
        name.includes(q) ||
        title.includes(q) ||
        desc.includes(q) ||
        album.includes(q) ||
        sub.includes(q) ||
        itemTagsStr.includes(q);

      if (!match) return false;
    }

    return true;
  });
}

module.exports = {
  searchCatalogItems,
};

