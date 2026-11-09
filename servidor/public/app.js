/*!
 * Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal v2.0
 * Copyright (C) 2026 João Paulo Stangorlini de Carvalho
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da Licença Pública Geral Affero GNU (AGPLv3) conforme
 * publicada pela Free Software Foundation.
 *
 * Este programa é distribuído na esperança de que seja útil, mas SEM
 * QUALQUER GARANTIA; sem mesmo a garantia implícita de COMERCIALIZAÇÃO
 * ou ADEQUAÇÃO A UM DETERMINADO FIM.
 */

'use strict';

(() => {
  // Limite seguro por arquivo abaixo do teto de 100 MB do Cloudflare Tunnel
  const MAX_FILE_BYTES = 95 * 1024 * 1024;
  const MAX_CONCURRENT_UPLOADS = 2;

  const WM_TILE_PRESETS = [
    {
      id: '1-full',
      short: '1',
      label: '1 coluna inteira',
      title: '1 Obra (100% largura)',
      icon: 'crop_original',
      slots: 1,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="22" height="14" rx="2" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: '2-split',
      short: '2',
      label: '2 lado a lado',
      title: '2 Obras Lado a Lado (50% | 50%)',
      icon: 'view_column_2',
      slots: 2,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="10" height="14" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="13" y="1" width="10" height="14" rx="1.5" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: '2-asym',
      short: '2A',
      label: '2 assimétricas',
      title: '2 Obras Assimétricas (65% | 35%)',
      icon: 'view_sidebar',
      slots: 2,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="14" height="14" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="17" y="1" width="6" height="14" rx="1.5" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: '3-cols',
      short: '3',
      label: '3 colunas',
      title: '3 Colunas Iguais',
      icon: 'view_column',
      slots: 3,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="6" height="14" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="17" y="1" width="6" height="14" rx="1.5" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: '1g-2d',
      short: '1+2',
      label: '1 grande + 2',
      title: '1 Grande Esq + 2 Empilhadas Dir',
      icon: 'grid_view',
      slots: 3,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="10" height="14" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="13" y="1" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="13" y="9" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: 'grid-4',
      short: '4',
      label: 'grade 4',
      title: 'Grade 2x2 (4 Obras)',
      icon: 'grid_on',
      slots: 4,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="13" y="1" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="1" y="9" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /><rect x="13" y="9" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: 'mosaic-6',
      short: '6',
      label: 'mosaico 6',
      title: 'Mosaico 3x2 (6 Obras)',
      icon: 'view_comfy',
      slots: 6,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /><rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /><rect x="17" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /><rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /><rect x="17" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" /></svg>`,
    },
    {
      id: 'carousel',
      short: '🎠',
      label: 'Carrossel',
      title: 'Carrossel Fluxo Contínuo (Netflix Peek)',
      icon: 'view_carousel',
      slots: 8,
      svgIcon: `<svg viewBox="0 0 24 16" class="w-5 h-3.5 fill-current"><rect x="0" y="2" width="4" height="12" rx="1" fill="currentColor" opacity="0.4" /><rect x="6" y="1" width="12" height="14" rx="1.5" fill="currentColor" opacity="0.9" /><rect x="20" y="2" width="4" height="12" rx="1" fill="currentColor" opacity="0.4" /></svg>`,
    },
  ];

  const ALBUM_ICONS = {
    'ALL': 'collections',
    'POLÍTICAS': 'campaign',
    'EVENTOS': 'event',
    'FESTAS': 'celebration',
    'SHOW DE FISICA': 'science',
    'STREET-TRILHAS': 'hiking',
    'USP': 'school',
    'BAHIA': 'beach_access',
    'CIENTEC': 'biotech',
    'PASSARINHADA': 'flutter_dash',
    'CENTRO HISTORICO': 'account_balance',
    'GERAL': 'photo_camera',
    'PIZZARIA': 'local_pizza',
  };

  // ==========================================================================
  // MAPA DE ÍCONES SVG INLINE COLORIDOS (100% NÍTIDOS E INDEPENDENTES DE FONTE)
  // ==========================================================================
  const FOLDER_ICON_SVGS = {
    'folder': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    'folder_open': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>`,
    'photo_camera': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
    'smartphone': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
    'videocam': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`,
    'audiotrack': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    'star': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    'code': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    'description': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>`,
    'favorite': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    'lock': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    'celebration': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 10 7-7m-7 7-4 4m11-11-2 5-3-3 5-2Zm-7 7-5 2-2-5 7 3Zm-5 2-4 7h7l-3-7Z"/></svg>`,
    'flight': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
    'work': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    'science': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3h15M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3M6 14h12"/></svg>`,
    'beach_access': (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12c0-5.5 4.5-10 10-10s10 4.5 10 10M17.5 17.5c-1.5 1.5-3.5 2.5-5.5 2.5"/></svg>`,
  };

  function renderFolderIconSvg(iconName, color = '#FFB703', size = 20) {
    const fn = FOLDER_ICON_SVGS[iconName] || FOLDER_ICON_SVGS['folder'];
    return fn(color, size);
  }


  const state = {
    isAdmin: false,
    activeView: 'portfolio',
    vaultMode: 'vault', // 'vault' | 'portfolio'
    isMultiColMobile: localStorage.getItem('portfolio_multi_col_mobile') === 'true',
    catalog: {
      settings: {
        title: 'João Stangorlini',
        subtitle: 'Ensaios visuais, registros de rua, ciência em movimento e experimentos ópticos.',
        accentTag: 'Comunicador - fotógrafo - desenvolvedor',
        layout: {
          gridMode: 'masonry',
          defaultFit: 'natural',
          gapPx: 18,
          borderRadiusPx: 12,
          columnsDesktop: 4,
          sections: {},
        },
      },
      albums: ['Destaques'],
      subalbums: {},
      items: [],
    },
    selectedAlbum: 'ALL',
    selectedSubalbum: 'ALL',
    portfolioDisplayMode: localStorage.getItem('portfolio_display_mode') || 'sections', // 'sections' | 'free'
    freeViewDirection: localStorage.getItem('portfolio_free_dir') || 'vertical', // 'vertical' | 'carousel'
    freeViewColumns: localStorage.getItem('portfolio_free_cols') || 'multi', // 'multi' | 'single'
    freeCarouselIndex: 0,
    isEmbedMode: false,
    embedLockedAlbum: null,
    embedFixedLayout: null, // 'vertical' | 'horizontal'
    embedGeneratorLayout: 'vertical',
    filteredPortfolio: [],
    lightboxIndex: -1,
    lbZoom: 1,
    lbPanX: 0,
    lbPanY: 0,
    vaultFolder: '',
    vaultTreeData: null,
    vaultFilesByFolder: {},
    vaultExpandedPaths: new Set(['', 'portfolio', 'vault', 'media']),
    vaultSelectedFile: null,
    vaultData: { folders: [], files: [], breadcrumbs: [] },
    hubType: 'all',
    hubSort: 'newest',
    hubQuery: '',
    telemetryTimer: null,
    selectedPortfolioFiles: [],
    collapsedAlbums: new Set(JSON.parse(localStorage.getItem('portfolio_collapsed_albums') || '[]')),
    isVisualEditMode: false,
    isVisitorViewOverride: false,
    vaultActiveDrive: 'primary',
    vaultDrives: [],
    studioSnapshot: null,
    studioDirty: false,
    activeFocalCardId: null,
    createdAlbums: [],
    renamedAlbums: {},
    draggedItemId: null,
    selectedStudioItemIds: new Set(),
    vaultSelectedFiles: new Set(),
    lastVaultClickIdx: -1,
    // Sprint 1 (V9.0): Busca, Ordenação, Tags, Favoritos e Atalhos no Cofre
    vaultSearchQuery: '',
    vaultSearchSort: 'date_desc', // 'name_asc', 'name_desc', 'date_desc', 'date_asc', 'size_desc'
    vaultFavoritesOnly: false,
    vaultSelectedTags: new Set(),
    contextMenuTarget: null, // { type: 'file' | 'folder', path: string, name: string, isFavorite?: boolean, tags?: string[] }
  };

  // ==========================================================================
  // UTILITÁRIOS GERAIS & TOASTS
  // ==========================================================================
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let val = n / 1024;
    let idx = 0;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[idx]}`;
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
  }

  // ---------------------------------------------------------------------------
  // NORMALIZADOR DE SCOPEKEY (espelha lib/shortcut-manager.js no frontend)
  // stangorlini/BAHIA → 'BAHIA' | portfolio/BAHIA → 'BAHIA' | portfolio/POL/SUB → 'POL::SUB' | vault → 'vault'
  // ---------------------------------------------------------------------------
  function normalizeFolderScopeKey(folderPath) {
    if (!folderPath || typeof folderPath !== 'string') return '';
    let clean = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (clean === 'portfolio') return 'portfolio';
    if (clean === 'stangorlini') return 'stangorlini';
    if (clean.startsWith('stangorlini/')) clean = clean.slice('stangorlini/'.length);
    if (clean.startsWith('portfolio/')) clean = clean.slice('portfolio/'.length);
    return clean.replace(/\//g, '::');
  }

  function showToast(msg, isError = false) {
    const container = $('toastContainer');
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 4200);
  }

  async function apiJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  // ==========================================================================
  // LEITOR BINÁRIO EXIF JPEG + GERADOR DE MINIATURA WEBP (ZERO CPU NO STICK)
  // ==========================================================================
  async function extractJpegExif(file) {
    try {
      if (!file.type.includes('jpeg') && !/\.(jpe?g)$/i.test(file.name)) return {};
      const slice = await file.slice(0, 131072).arrayBuffer();
      const view = new DataView(slice);
      if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return {};

      let offset = 2;
      while (offset + 4 < view.byteLength) {
        const marker = view.getUint16(offset);
        offset += 2;
        if (marker === 0xffe1) {
          const segLen = view.getUint16(offset);
          if (
            offset + 8 < view.byteLength &&
            view.getUint32(offset + 2) === 0x45786966 &&
            view.getUint16(offset + 6) === 0x0000
          ) {
            return parseTiffExif(view, offset + 8, Math.min(view.byteLength, offset + segLen));
          }
          offset += segLen;
        } else if ((marker & 0xff00) === 0xff00) {
          offset += view.getUint16(offset);
        } else {
          break;
        }
      }
    } catch {}
    return {};
  }

  function parseTiffExif(view, tiffStart, maxEnd) {
    const endianMark = view.getUint16(tiffStart);
    const little = endianMark === 0x4949;
    if (!little && endianMark !== 0x4d4d) return {};
    if (view.getUint16(tiffStart + 2, little) !== 0x002a) return {};

    const readStr = (pos, count) => {
      let out = '';
      for (let i = 0; i < count - 1 && pos + i < maxEnd; i++) {
        const ch = view.getUint8(pos + i);
        if (ch === 0) break;
        if (ch >= 32 && ch < 127) out += String.fromCharCode(ch);
      }
      return out.trim();
    };

    const readRational = (pos) => {
      if (pos + 8 > maxEnd) return null;
      const num = view.getUint32(pos, little);
      const den = view.getUint32(pos + 4, little);
      return den ? { num, den, val: num / den } : null;
    };

    const readIfd = (ifdOffset) => {
      const tags = {};
      if (ifdOffset + 2 > maxEnd) return tags;
      const entries = view.getUint16(ifdOffset, little);
      for (let i = 0; i < entries; i++) {
        const ePos = ifdOffset + 2 + i * 12;
        if (ePos + 12 > maxEnd) break;
        const tag = view.getUint16(ePos, little);
        const type = view.getUint16(ePos + 2, little);
        const count = view.getUint32(ePos + 4, little);
        const valOff = ePos + 8;

        if (type === 2) {
          const strPos = count <= 4 ? valOff : tiffStart + view.getUint32(valOff, little);
          tags[tag] = readStr(strPos, Math.min(count, 80));
        } else if (type === 3) {
          tags[tag] = view.getUint16(valOff, little);
        } else if (type === 4) {
          tags[tag] = view.getUint32(valOff, little);
        } else if (type === 5) {
          const rPos = tiffStart + view.getUint32(valOff, little);
          tags[tag] = readRational(rPos);
        }
      }
      return tags;
    };

    const firstIfdRel = view.getUint32(tiffStart + 4, little);
    const ifd0 = readIfd(tiffStart + firstIfdRel);
    const subIfd = ifd0[0x8769] ? readIfd(tiffStart + ifd0[0x8769]) : {};

    const exif = {};
    const make = ifd0[0x010f] || '';
    const model = ifd0[0x0110] || '';
    if (model) {
      exif.camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim();
    }
    if (subIfd[0xa434]) exif.lens = subIfd[0xa434];
    if (subIfd[0x920a]?.val) exif.focalLength = `${Math.round(subIfd[0x920a].val)}mm`;
    if (subIfd[0x829d]?.val) exif.aperture = `f/${Number(subIfd[0x829d].val.toFixed(1))}`;
    if (subIfd[0x829a]?.val) {
      const exp = subIfd[0x829a];
      exif.shutter = exp.val >= 1 ? `${exp.val.toFixed(1)}s` : `1/${Math.round(exp.den / exp.num)}s`;
    }
    if (subIfd[0x8827]) exif.iso = `ISO ${subIfd[0x8827]}`;
    return exif;
  }

  function preparePhotoThumbnailAndMeta(file, maxThumbDim = 960) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        const origW = img.naturalWidth || 1600;
        const origH = img.naturalHeight || 1067;

        let tW = origW;
        let tH = origH;
        if (tW > maxThumbDim || tH > maxThumbDim) {
          if (tW >= tH) {
            tH = Math.max(1, Math.round((tH * maxThumbDim) / tW));
            tW = maxThumbDim;
          } else {
            tW = Math.max(1, Math.round((tW * maxThumbDim) / tH));
            tH = maxThumbDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = tW;
        canvas.height = tH;
        const ctx = canvas.getContext('2d');
        let thumbBlob = null;
        if (ctx) {
          ctx.drawImage(img, 0, 0, tW, tH);
          thumbBlob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.78));
        }

        URL.revokeObjectURL(objectUrl);
        const exif = await extractJpegExif(file);
        resolve({ width: origW, height: origH, thumbBlob, exif });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: 1600, height: 1067, thumbBlob: null, exif: {} });
      };
      img.src = objectUrl;
    });
  }

  // ==========================================================================
  // MINIATURAS CLIENT-SIDE PARA UPLOADS NO COFRE (Stangorlini/portifolio)
  // O navegador gera o WebP 640px e envia ao cache ext4 do Fire Stick.
  // Se falhar, a fila do servidor gera a miniatura faltante depois.
  // ==========================================================================
  const CLIENT_THUMB_MAX_DIM = 640;
  const CLIENT_THUMB_IMAGE_RE = /\.(jpe?g|png|webp|avif)$/i;

  function isPortfolioVaultPath(vaultPath) {
    const n = String(vaultPath || '').toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
    return /^(stangorlini\/)?(portfolio|portifolio)(\/|$)/.test(n);
  }

  async function generateClientThumbWebP(file, maxDim = CLIENT_THUMB_MAX_DIM) {
    // Caminho rápido: decodificação já reduzida + orientação EXIF (Chrome/Edge/Firefox)
    if (typeof createImageBitmap === 'function') {
      let bmp = null;
      try {
        const probe = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width: w, height: h } = probe;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const tW = Math.max(1, Math.round(w * scale));
        const tH = Math.max(1, Math.round(h * scale));
        probe.close?.();
        bmp = await createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: tW,
          resizeHeight: tH,
          resizeQuality: 'high',
        });
        const canvas = document.createElement('canvas');
        canvas.width = tW;
        canvas.height = tH;
        canvas.getContext('2d')?.drawImage(bmp, 0, 0);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.8));
        if (blob && blob.type === 'image/webp') return blob;
      } catch {
        // cai para o método clássico abaixo
      } finally {
        bmp?.close?.();
      }
    }
    const meta = await preparePhotoThumbnailAndMeta(file, maxDim);
    return meta.thumbBlob && meta.thumbBlob.type === 'image/webp' ? meta.thumbBlob : null;
  }

  async function sendClientThumbForVaultFile(file, vaultPath, drive) {
    if (!file || !vaultPath || !CLIENT_THUMB_IMAGE_RE.test(file.name || '') || !isPortfolioVaultPath(vaultPath)) return false;
    try {
      const blob = await generateClientThumbWebP(file);
      if (!blob) return false;
      const qs = `path=${encodeURIComponent(vaultPath)}${drive ? `&drive=${encodeURIComponent(drive)}` : ''}`;
      const res = await fetch(`/api/portfolio/client-thumb?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/webp' },
        body: blob,
        credentials: 'same-origin',
      });
      return res.ok;
    } catch {
      return false; // fila do servidor cobre
    }
  }

  // Upload único para o Cofre + miniatura client-side quando for do portfólio
  async function uploadVaultFileWithThumb(file, folder, drive) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const params = [];
    if (folder) params.push(`folder=${encodeURIComponent(folder)}`);
    if (drive) params.push(`drive=${encodeURIComponent(drive)}`);
    const res = await fetch(`/api/vault/upload?${params.join('&')}`, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    const payload = await res.json().catch(() => ({}));
    const savedPath = payload.path || (folder ? `${folder}/${file.name}` : file.name);
    await sendClientThumbForVaultFile(file, savedPath, drive);
    return payload;
  }

  // ==========================================================================
  // AJUSTE 3: FILA DE UPLOAD CONTROLADA (CONCORRÊNCIA = 2 • 1 ARQUIVO / POST)
  // ==========================================================================
  class UploadQueueManager {
    constructor() {
      this.jobs = [];
      this.activeCount = 0;
      this.minimized = false;
    }

    enqueueFiles(files, targetConfig) {
      const valid = [];
      for (const file of Array.from(files || [])) {
        if (file.size > MAX_FILE_BYTES) {
          showToast(`"${file.name}" (${formatBytes(file.size)}) excede o limite de 95 MB do túnel Cloudflare.`, true);
          continue;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;

      valid.forEach((file, idx) => {
        this.jobs.push({
          id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          indexInBatch: idx,
          batchSize: valid.length,
          config: targetConfig,
          status: 'queued', // queued | preparing | uploading | done | error
          progress: 0,
          speedText: '',
          errorMsg: '',
        });
      });

      $('uploadQueueDrawer')?.classList.remove('hidden');
      this.render();
      this.pump();
    }

    pump() {
      while (this.activeCount < MAX_CONCURRENT_UPLOADS) {
        const nextJob = this.jobs.find((j) => j.status === 'queued');
        if (!nextJob) break;
        this.runJob(nextJob);
      }
    }

    async runJob(job) {
      this.activeCount++;
      try {
        const formData = new FormData();
        let endpoint = '';

        if (job.config.zone === 'portfolio') {
          job.status = 'preparing';
          this.render();
          const meta = await preparePhotoThumbnailAndMeta(job.file);
          formData.append('original', job.file, job.file.name);
          if (meta.thumbBlob) {
            formData.append('thumb', meta.thumbBlob, 'thumb.webp');
          }
          formData.append('width', String(meta.width));
          formData.append('height', String(meta.height));
          formData.append('album', job.config.album || 'Destaques');
          formData.append('description', job.config.description || '');
          if (job.config.title && job.batchSize === 1) {
            formData.append('title', job.config.title);
          } else if (job.config.title) {
            formData.append('title', `${job.config.title} #${job.indexInBatch + 1}`);
          }
          formData.append('exif', JSON.stringify(meta.exif || {}));
          endpoint = '/api/portfolio/upload';
        } else if (job.config.zone === 'vault') {
          formData.append('file', job.file, job.file.name);
          endpoint = `/api/vault/upload?folder=${encodeURIComponent(job.config.folder || '')}`;
        } else if (job.config.zone === 'hub') {
          formData.append('file', job.file, job.file.name);
          endpoint = '/api/hub-media/upload';
        }

        job.status = 'uploading';
        this.render();

        await this.sendXhr(endpoint, formData, (pct, mbps) => {
          job.progress = pct;
          job.speedText = mbps > 0 ? `${mbps.toFixed(1)} MB/s` : '';
          this.renderProgressOnly(job);
        }).then((payload) => {
          if (job.config.zone === 'vault') {
            const saved = (payload && payload.path) || (job.config.folder ? `${job.config.folder}/${job.file.name}` : job.file.name);
            return sendClientThumbForVaultFile(job.file, saved, '');
          }
          return null;
        });

        job.status = 'done';
        job.progress = 100;
        job.speedText = 'Concluído';
      } catch (err) {
        job.status = 'error';
        job.errorMsg = err.message || 'Falha no envio';
        showToast(`Erro em "${job.file.name}": ${job.errorMsg}`, true);
      } finally {
        this.activeCount--;
        this.render();
        this.pump();

        if (this.activeCount === 0 && !this.jobs.some((j) => j.status === 'queued')) {
          this.onAllSettled();
        }
      }
    }

    sendXhr(url, formData, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const startedAt = performance.now();
        xhr.open('POST', url, true);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
            const elapsedSec = Math.max(0.1, (performance.now() - startedAt) / 1000);
            const mbps = ev.loaded / (1024 * 1024) / elapsedSec;
            onProgress(pct, mbps);
          }
        };

        xhr.onload = () => {
          let payload = {};
          try {
            payload = JSON.parse(xhr.responseText || '{}');
          } catch {}
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(payload);
          } else {
            reject(new Error(payload.error || `HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Falha de rede durante o upload.'));
        xhr.send(formData);
      });
    }

    onAllSettled() {
      loadPortfolio();
      if (state.isAdmin) {
        if (state.activeView === 'vault') loadVault(state.vaultFolder);
        if (state.activeView === 'hub') {
          loadTelemetry();
          loadHubMedia();
        }
      }
    }

    renderProgressOnly(job) {
      const bar = document.querySelector(`[data-job-bar="${job.id}"]`);
      const st = document.querySelector(`[data-job-status="${job.id}"]`);
      if (bar) bar.style.width = `${job.progress}%`;
      if (st) st.textContent = `${job.progress}% ${job.speedText}`;
      this.updateGlobalHeader();
    }

    updateGlobalHeader() {
      const total = this.jobs.length;
      const done = this.jobs.filter((j) => j.status === 'done').length;
      const avgPct = total
        ? Math.round(this.jobs.reduce((acc, j) => acc + (j.progress || 0), 0) / total)
        : 0;
      $('queueGlobalStats').textContent = `${done} / ${total} (${avgPct}%)`;
      $('queueGlobalBar').style.width = `${avgPct}%`;
    }

    render() {
      this.updateGlobalHeader();
      const list = $('uploadQueueList');
      list.classList.toggle('hidden', this.minimized);
      list.innerHTML = this.jobs
        .slice()
        .reverse()
        .map((j) => {
          const label =
            j.status === 'preparing'
              ? 'Thumb/EXIF...'
              : j.status === 'uploading'
                ? `${j.progress}% ${j.speedText}`
                : j.status === 'done'
                  ? '✓ Salvo no HD'
                  : j.status === 'error'
                    ? '✕ Erro'
                    : 'Na fila';
          return `
            <div class="queue-item">
              <div class="queue-item-top">
                <span class="truncate" style="max-width: 210px;">${escapeHtml(j.file.name)}</span>
                <span class="queue-status" data-job-status="${j.id}">${escapeHtml(label)}</span>
              </div>
              <div class="mini-bar">
                <div class="mini-bar-fill" data-job-bar="${j.id}" style="width: ${j.progress}%"></div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    clearFinished() {
      if (this.activeCount > 0) {
        this.jobs = this.jobs.filter((j) => j.status !== 'done');
        this.render();
      } else {
        this.jobs = [];
        $('uploadQueueDrawer')?.classList.add('hidden');
      }
    }
  }

  const uploadQueue = new UploadQueueManager();

  // ==========================================================================
  // NAVEGAÇÃO ENTRE AMBIENTES & SESSÃO ADMIN
  // ==========================================================================
  function updateMultiColSwitchUI() {
    // Mantido para compatibilidade; seletor de colunas agora usa [data-studio-col]
    // Os elementos multiColStatusDot/multiColStatusText foram removidos do HTML — uso opcional
    const dot = $('multiColStatusDot');
    const txt = $('multiColStatusText');
    if (state.isMultiColMobile) {
      document.body.classList.add('force-multi-col');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (txt) txt.textContent = 'Sim (2 col)';
    } else {
      document.body.classList.remove('force-multi-col');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-neutral-400';
      if (txt) txt.textContent = 'Não (1 col)';
    }
  }

  function updateVaultModeButtons() {
    const isVault = state.vaultMode === 'vault';
    $('btnVaultModeVault')?.classList.toggle('bg-[#5A189A]', isVault);
    $('btnVaultModeVault')?.classList.toggle('text-[#FFB703]', isVault);
    $('btnVaultModeVault')?.classList.toggle('shadow', isVault);
    $('btnVaultModeVault')?.classList.toggle('text-[#E0FBFC]/70', !isVault);

    $('btnVaultModePortfolio')?.classList.toggle('bg-[#5A189A]', !isVault);
    $('btnVaultModePortfolio')?.classList.toggle('text-[#FFB703]', !isVault);
    $('btnVaultModePortfolio')?.classList.toggle('shadow', !isVault);
    $('btnVaultModePortfolio')?.classList.toggle('text-[#E0FBFC]/70', isVault);
  }

  function switchView(viewName) {
    if ((viewName === 'vault' || viewName === 'telemetry') && !state.isAdmin) {
      showToast('Acesso restrito ao Administrador.');
      openModal('modalLogin');
      return;
    }

    state.activeView = viewName;

    $('view-portfolio')?.classList.toggle('hidden', viewName !== 'portfolio');
    $('view-vault')?.classList.toggle('hidden', viewName !== 'vault');
    $('view-telemetry')?.classList.toggle('hidden', viewName !== 'telemetry');

    stopTelemetryPolling();

    if (viewName === 'portfolio') {
      renderPortfolioGrid();
    } else if (viewName === 'vault') {
      loadVaultDrives();
      updateVaultModeButtons();
      loadVaultTree();
    } else if (viewName === 'telemetry') {
      loadTelemetry();
      startTelemetryPolling();
    }
  }

  function applyAdminUiState() {
    document.body.classList.toggle('is-admin', Boolean(state.isAdmin));
    if ($('btnAuthLabel')) {
      $('btnAuthLabel').textContent = state.isAdmin ? 'Admin ▾' : 'Admin';
    }
    if ($('authIconLock')) {
      $('authIconLock').textContent = state.isAdmin ? 'lock_open' : 'lock';
    }
    if ($('adminDropdownUser')) {
      $('adminDropdownUser').textContent = state.isAdmin ? 'Administrador Conectado' : 'Visitante Público';
    }

    // Se não for admin, garante ocultação total de ferramentas de edição
    if (!state.isAdmin) {
      $('portfolioStudioDock')?.classList.add('hidden');
      $('adminDropdownMenu')?.classList.add('hidden');
      $('pillReturnToEdit')?.classList.add('hidden');
      state.isVisualEditMode = false;
      state.isVisitorViewOverride = false;
      if (state.activeView !== 'portfolio') {
        switchView('portfolio');
      }
    } else {
      if (state.isVisualEditMode && !state.isVisitorViewOverride) {
        $('portfolioStudioDock')?.classList.remove('hidden');
      }
    }

    updateMultiColSwitchUI();
    renderPortfolioGrid();
  }

  function setVisitorViewOverride(enable) {
    state.isVisitorViewOverride = Boolean(enable);
    const pill = $('pillReturnToEdit');
    const dock = $('portfolioStudioDock');
    if (state.isVisitorViewOverride) {
      dock?.classList.add('hidden');
      pill?.classList.remove('hidden');
      if ($('labelDropdownStudio')) $('labelDropdownStudio').textContent = 'Editar Visualização (Ativar)';
      showToast('Visualizando exatamente como visitante.');
    } else {
      pill?.classList.add('hidden');
      if (state.isAdmin && state.isVisualEditMode) {
        dock?.classList.remove('hidden');
      }
      if ($('labelDropdownStudio')) $('labelDropdownStudio').textContent = 'Editar Visualização (Ativo)';
      showToast('Modo de edição reativado.');
    }
    renderPortfolioGrid();
  }

  async function checkSession() {
    try {
      const data = await apiJson('/api/auth/me');
      state.isAdmin = Boolean(data.authenticated);
      applyAdminUiState();
    } catch {}
  }

  // ==========================================================================
  // AMBIENTE 1: PORTFÓLIO FOTOGRÁFICO + ESTÚDIO DE DIAGRAMAÇÃO (PIC-TIME STYLE)
  // ==========================================================================
  function getLayoutSettings() {
    if (!state.catalog.settings) state.catalog.settings = {};
    if (!state.catalog.settings.layout) {
      state.catalog.settings.layout = {
        gridMode: 'masonry',
        defaultFit: 'natural',
        gapPx: 18,
        borderRadiusPx: 14,
        columnsDesktop: 4,
        sections: {},
      };
    }
    if (!state.catalog.settings.layout.sections || typeof state.catalog.settings.layout.sections !== 'object') {
      state.catalog.settings.layout.sections = {};
    }
    return state.catalog.settings.layout;
  }

  function updateSliderTrack(slider) {
    if (!slider) return;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const val = Number(slider.value || 0);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--slider-pct', `${pct}%`);
  }

  function applyGlobalLayoutVariables() {
    const layout = getLayoutSettings();
    const gapPx = Number.isFinite(Number(layout.gapPx)) ? Number(layout.gapPx) : 18;
    const radiusPx = Number.isFinite(Number(layout.borderRadiusPx)) ? Number(layout.borderRadiusPx) : 14;

    document.documentElement.style.setProperty('--grid-gap', `${gapPx}px`);
    document.documentElement.style.setProperty('--gallery-gap', `${gapPx}px`);
    document.documentElement.style.setProperty('--card-radius', `${radiusPx}px`);
    document.documentElement.style.setProperty('--frame-radius', `${radiusPx}px`);

    const gapSlider = $('studioGapSlider');
    if (gapSlider) {
      gapSlider.value = String(gapPx);
      updateSliderTrack(gapSlider);
    }
    if ($('studioGapValue')) $('studioGapValue').textContent = `${gapPx}px`;

    const radSlider = $('studioRadiusSlider');
    if (radSlider) {
      radSlider.value = String(radiusPx);
      updateSliderTrack(radSlider);
    }
    if ($('studioRadiusValue')) $('studioRadiusValue').textContent = `${radiusPx}px`;

    if ($('studioSelectedCount')) {
      $('studioSelectedCount').textContent = String(state.selectedStudioItemIds.size);
    }

    document.querySelectorAll('#studioGridModeGroup .studio-seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.gridMode === (layout.gridMode || 'masonry'));
    });

    if ($('studioDirtyIndicator')) {
      $('studioDirtyIndicator')?.classList.toggle('hidden', !state.studioDirty);
    }
  }

  function markStudioDirty() {
    state.studioDirty = true;
    if ($('studioDirtyIndicator')) {
      $('studioDirtyIndicator')?.classList.remove('hidden');
    }
  }

  function enterVisualStudio() {
    if (!state.isAdmin) {
      openModal('modalLogin');
      return;
    }
    getLayoutSettings();
    state.studioSnapshot = JSON.parse(JSON.stringify(state.catalog));
    state.studioDirty = false;
    state.activeFocalCardId = null;
    state.createdAlbums = [];
    state.renamedAlbums = {};
    state.selectedStudioItemIds.clear();
    state.isVisualEditMode = true;

    state.collapsedAlbums.clear();

    $('portfolioStudioDock')?.classList.remove('hidden');
    $('btnSaveVisualStudio')?.classList.remove('hidden');
    $('btnCancelVisualStudio')?.classList.remove('hidden');
    $('btnToggleVisualStudio')?.classList.add('studio-active');
    if ($('labelToggleVisualStudio')) {
      $('labelToggleVisualStudio').textContent = 'Editando Visualização...';
    }

    applyGlobalLayoutVariables();
    renderAlbumPills();
    renderPortfolioGrid();
  }

  function exitVisualStudio(discard = true) {
    if (discard && state.studioSnapshot) {
      state.catalog = JSON.parse(JSON.stringify(state.studioSnapshot));
      showToast('Alterações descartadas. Visualização anterior restaurada.');
    }
    state.isVisualEditMode = false;
    state.studioDirty = false;
    state.activeFocalCardId = null;
    state.studioSnapshot = null;
    state.createdAlbums = [];
    state.renamedAlbums = {};
    state.selectedStudioItemIds.clear();

    $('btnSaveVisualStudio')?.classList.toggle('hidden', !state.isAdmin);
    $('btnCancelVisualStudio')?.classList.add('hidden');
    $('btnToggleVisualStudio')?.classList.remove('studio-active');
    if ($('labelToggleVisualStudio')) {
      $('labelToggleVisualStudio').textContent = 'Editar Visualização';
    }

    applyPortfolioHeader();
    applyGlobalLayoutVariables();
    renderAlbumPills();
    renderPortfolioGrid();
  }

  async function saveVisualStudioLayout() {
    const layout = getLayoutSettings();
    layout.freeViewColsCount = state.freeViewColsCount || 3;
    const albums = state.catalog.albums || [];
    const allItems = state.catalog.items || [];

    // Reatribui order sequencial (0, 1, 2...) dentro de cada álbum conforme posição atual
    const perAlbumCounter = {};
    const payloadItems = allItems.map((it) => {
      const alb = it.album || 'Destaques';
      const ord = perAlbumCounter[alb] || 0;
      perAlbumCounter[alb] = ord + 1;
      it.order = ord;
      return {
        id: it.id,
        album: alb,
        order: ord,
        featured: Boolean(it.featured),
        span: it.span || '1x1',
        fit: it.fit || 'inherit',
        aspectRatioOverride: it.aspectRatioOverride || 'auto',
        focalPoint: it.focalPoint || { x: 50, y: 50 },
      };
    });

    const btnSave = $('btnSaveVisualStudio');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando...';
    }

    try {
      const res = await apiJson('/api/portfolio/layout', {
        method: 'PUT',
        body: JSON.stringify({
          layout,
          albumOrder: albums,
          createdAlbums: state.createdAlbums,
          renamedAlbums: state.renamedAlbums,
          items: payloadItems,
        }),
      });
      if (res.catalog) {
        state.catalog = res.catalog;
      }
      state.studioSnapshot = null;
      exitVisualStudio(false);
      showToast('Visualização, tamanhos e pastas salvos com sucesso!');
    } catch (err) {
      showToast(`Erro ao salvar layout: ${err.message}`, true);
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = '✓ Salvar Visualização';
      }
    }
  }

  function initGridDensitySlider() {
    const slider = $('sliderGridDensity');
    const btnMobileCols2 = $('btnMobileCols2');
    const btnMobileCols1 = $('btnMobileCols1');

    const saved = localStorage.getItem('portfolio_grid_cols');
    const initialCols = saved ? parseInt(saved, 10) : (window.innerWidth < 768 ? 2 : 4);
    applyGridDensity(initialCols, false);

    if (slider) {
      slider.addEventListener('input', (e) => {
        applyGridDensity(e.target.value, true);
      });
    }

    if (btnMobileCols2) {
      btnMobileCols2.addEventListener('click', () => {
        applyGridDensity(2, true);
      });
    }

    if (btnMobileCols1) {
      btnMobileCols1.addEventListener('click', () => {
        applyGridDensity(1, true);
      });
    }

    window.addEventListener('resize', () => {
      requestAnimationFrame(updateMasonrySpans);
    });
  }

  function applyGridDensity(cols, fromUser = false) {
    const clamped = Math.max(1, Math.min(6, parseInt(cols, 10) || 4));
    document.documentElement.style.setProperty('--masonry-cols', clamped);
    localStorage.setItem('portfolio_grid_cols', clamped);
    if ($('sliderGridDensity')) $('sliderGridDensity').value = clamped;
    if ($('densityLabel')) {
      $('densityLabel').textContent = clamped === 1 ? '1 foto/linha' : `${clamped} colunas`;
    }

    // Sincroniza switch de 2 colunas vs única para mobile
    const btnMobileCols2 = $('btnMobileCols2');
    const btnMobileCols1 = $('btnMobileCols1');
    if (btnMobileCols2 && btnMobileCols1) {
      if (clamped === 1) {
        btnMobileCols1.classList.add('active');
        btnMobileCols2.classList.remove('active');
      } else {
        btnMobileCols2.classList.add('active');
        btnMobileCols1.classList.remove('active');
      }
    }

    if (fromUser && state.catalog?.settings?.layout) {
      state.catalog.settings.layout.columnsDesktop = clamped;
      if (state.isVisualEditMode) markStudioDirty();
    }
    requestAnimationFrame(updateMasonrySpans);
  }

  async function loadPortfolio() {
    try {
      const catalog = await apiJson('/api/portfolio');
      state.catalog = catalog;
      const savedCols = localStorage.getItem('portfolio_grid_cols');
      if (!savedCols && catalog?.settings?.layout?.columnsDesktop) {
        applyGridDensity(catalog.settings.layout.columnsDesktop, false);
      }
      if (state.isEmbedMode && state.embedLockedAlbum) {
        const targetNorm = normalizeStr(state.embedLockedAlbum);
        const matched = (state.catalog.albums || []).find((a) => normalizeStr(a) === targetNorm);
        state.selectedAlbum = matched || state.embedLockedAlbum;
        $('albumPills')?.classList.add('hidden');
      }
      applyPortfolioHeader();
      applyGlobalLayoutVariables();
      renderAlbumPills();
      renderActiveTagsBar();
      renderPortfolioGrid();
      renderFeaturedCarousel();
      if (catalog && catalog.isStorageMounted === false) {
        showToast('Aviso: HD externo USB offline. Conecte o disco para fotos em alta resolução.', false);
      }
    } catch (err) {
      showToast(`Erro ao carregar portfólio: ${err.message}`, true);
    } finally {
      $('portfolioSkeleton')?.classList.add('hidden');
    }
  }

  function applyPortfolioHeader() {
    const s = state.catalog.settings || {};
    let title = s.title || 'João Stangorlini';
    if (title === 'JOÃO PAULO STANGORLINI — PORTFOLIO' || title === 'JOÃO PAULO STANGORLINI') {
      title = 'João Stangorlini';
    }
    let sub = s.subtitle || 'Ensaios visuais, registros de rua, ciência em movimento e experimentos ópticos.';
    if (
      sub === 'Fotografia, Ciência & Registro Visual' ||
      sub === 'Comunicador - fotógrafo - desenvolvedor'
    ) {
      sub = 'Ensaios visuais, registros de rua, ciência em movimento e experimentos ópticos.';
    }
    let tag = s.accentTag || 'Comunicador - fotógrafo - desenvolvedor';
    if (tag === 'ARCHIVE & PORTFOLIO' || tag === 'fotografia • física • código') {
      tag = 'Comunicador - fotógrafo - desenvolvedor';
    }

    document.title = `${title} — Portfólio Autoral`;
    if ($('heroTitle')) $('heroTitle').textContent = title;
    if ($('heroSubtitle')) $('heroSubtitle').textContent = sub;
    if ($('heroEyebrow')) $('heroEyebrow').textContent = tag;
    if ($('topBrandTitle')) $('topBrandTitle').textContent = title.split('—')[0].trim();
  }

  function renderAlbumPills() {
    const rawAlbums = state.catalog.albums || [];
    const preferredOrder = [
      'POLÍTICAS',
      'EVENTOS',
      'FESTAS',
      'SHOW DE FISICA',
      'STREET-TRILHAS',
      'USP',
      'BAHIA',
      'CIENTEC',
      'PASSARINHADA',
      'CENTRO HISTORICO',
      'GERAL',
      'PIZZARIA',
      'PARADA-TUZA-PALHACARIA',
      'PASSARO C MINHOCA',
      'PASSEIO C PEROLA',
      'TESTES',
      'EULER',
    ];
    const savedOrder = Array.isArray(state.catalog.settings?.albumOrder) && state.catalog.settings.albumOrder.length > 0
      ? state.catalog.settings.albumOrder
      : preferredOrder;
    const albums = [
      ...savedOrder.filter((a) => rawAlbums.includes(a)),
      ...rawAlbums.filter((a) => !savedOrder.includes(a)),
    ];
    state.catalog.albums = albums;

    const allItems = state.catalog.items || [];
    const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;

    const counts = {};
    let featuredCount = 0;
    for (const it of allItems) {
      if (it.album) {
        counts[it.album] = (counts[it.album] || 0) + 1;
      }
      if (it.featured) {
        featuredCount++;
      }
    }

    const activePillClass = 'active px-4 py-2 rounded-xl bg-[#5A189A] border-2 border-[#FFB703] text-xs sm:text-sm font-bold text-[#E0FBFC] shadow-lg whitespace-nowrap flex items-center gap-2 cursor-pointer transition-all';
    const inactivePillClass = 'px-4 py-2 rounded-xl bg-[#240046] border border-[#5A189A]/50 text-xs sm:text-sm font-medium text-[#E0FBFC]/80 hover:text-[#E0FBFC] hover:border-[#FFB703] transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer';

    const allBtnHtml = `
      <button type="button" class="pill ${state.selectedAlbum === 'ALL' ? activePillClass : inactivePillClass}" data-album="ALL">
        <span class="material-symbols-outlined text-[16px] text-[#FFB703]">collections</span>
        <span>Todas as Obras</span>
        <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#0B1320] text-[#FFB703] font-bold">${allItems.length}</span>
      </button>
    `;

    const featuredBtnHtml = (featuredCount > 0 || state.isAdmin || state.selectedAlbum === '__FEATURED__')
      ? `
        <button type="button" class="pill ${state.selectedAlbum === '__FEATURED__' ? activePillClass : inactivePillClass}" data-album="__FEATURED__">
          <span class="text-sm text-[#FFB703]">⭐</span>
          <span>Destaques</span>
          <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#0B1320] text-[#FFB703] font-bold">${featuredCount}</span>
        </button>
      `
      : '';

    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const albumBtnsHtml = albums
      .filter((a) => (counts[a] || 0) > 0 || isStudio)
      .map((a, idx) => {
        const count = counts[a] || 0;
        const meta = fMetaMap[a] || {};
        const iconName = meta.icon || ALBUM_ICONS[a] || 'folder';
        const customColor = meta.color || null;
        const isFav = Boolean(meta.isFavorite);
        const isActive = state.selectedAlbum === a;
        const pillCls = isActive ? activePillClass : inactivePillClass;
        const styleAttr = customColor ? `style="--folder-accent:${customColor}; border-color:${customColor};"` : '';

        const pillIconSvg = renderFolderIconSvg(iconName, customColor || (isActive ? '#FFB703' : '#E0FBFC'), 18);

        if (!isStudio) {
          return `
            <button type="button" class="pill ${pillCls} ${customColor ? 'folder-pill-custom' : ''}" data-album="${escapeHtml(a)}" ${styleAttr}>
              <span class="inline-flex items-center shrink-0">${pillIconSvg}</span>
              <span>${escapeHtml(a)}</span>
              ${isFav ? '<span title="Pasta favorita">⭐</span>' : ''}
              <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#0B1320] ${isActive ? 'text-[#FFB703] font-bold' : 'text-[#E0FBFC]/75'}">${count}</span>
            </button>
          `;
        }
        return `
          <div class="inline-flex items-center gap-1">
            <button type="button" class="px-1.5 py-1 rounded bg-[#240046] border border-[#5A189A] text-xs text-[#FFB703]" data-pill-move="${escapeHtml(a)}" data-pill-dir="-1" ${idx === 0 ? 'disabled style="opacity:0.25"' : ''} title="Mover categoria para a esquerda">&lt;</button>
            <button type="button" class="pill ${pillCls} ${customColor ? 'folder-pill-custom' : ''}" data-album="${escapeHtml(a)}" ${styleAttr}>
              <span class="inline-flex items-center shrink-0">${pillIconSvg}</span>
              <span>${escapeHtml(a)}</span>
              ${isFav ? '<span title="Pasta favorita">⭐</span>' : ''}
              <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#0B1320] text-[#FFB703] font-bold">${count}</span>
            </button>
            <button type="button" class="px-1.5 py-1 rounded bg-[#240046] border border-[#5A189A] text-xs text-[#FFB703]" data-pill-move="${escapeHtml(a)}" data-pill-dir="1" ${idx >= albums.length - 1 ? 'disabled style="opacity:0.25"' : ''} title="Mover categoria para a direita">&gt;</button>
          </div>
        `;
      })
      .join('');

    if ($('albumPills')) {
      $('albumPills').innerHTML = allBtnHtml + featuredBtnHtml + albumBtnsHtml;
    }

    $('albumPills')?.querySelectorAll('.pill[data-album]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedAlbum = btn.dataset.album;
        state.selectedSubalbum = 'ALL';
        state.visibleCountLimit = 36;
        if (state.selectedAlbum !== 'ALL') {
          // Expande a pasta automaticamente para nunca exibir tela vazia ao filtrar
          state.collapsedAlbums.delete(state.selectedAlbum);
          for (const c of Array.from(state.collapsedAlbums)) {
            if (c.startsWith(`${state.selectedAlbum}::`)) {
              state.collapsedAlbums.delete(c);
            }
          }
          localStorage.setItem('portfolio_collapsed_albums', JSON.stringify(Array.from(state.collapsedAlbums)));
        }
        renderAlbumPills();
        renderSubalbumPills();
        renderPortfolioGrid();
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });

    $('albumPills')?.querySelectorAll('[data-pill-move]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alb = btn.dataset.pillMove;
        const dir = Number(btn.dataset.pillDir);
        const list = state.catalog.albums || [];
        const idx = list.indexOf(alb);
        const swapIdx = idx + dir;
        if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
        const tmp = list[idx];
        list[idx] = list[swapIdx];
        list[swapIdx] = tmp;
        if (!state.catalog.settings) state.catalog.settings = {};
        state.catalog.settings.albumOrder = [...list];
        markStudioDirty();
        renderAlbumPills();
        renderPortfolioGrid();
        showToast(`Ordem alterada: "${alb}" movido.`);
      });
    });

    renderSubalbumPills();

    const optionsHtml = albums
      .map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`)
      .join('');
    if ($('selectPortfolioAlbum')) $('selectPortfolioAlbum').innerHTML = optionsHtml;
    if ($('editPhotoAlbumSelect')) $('editPhotoAlbumSelect').innerHTML = optionsHtml;
  }

  function renderSubalbumPills() {
    const wrap = $('subalbumBarWrap');
    const container = $('subalbumPills');
    const prefixEl = $('subalbumPathPrefix');
    if (!wrap || !container) return;

    wrap.classList.remove('hidden');
    const allItems = state.catalog.items || [];

    // Se estiver em ALL ou __FEATURED__, mostra as subpastas do álbum principal (ex: POLÍTICAS) ou mais populosas
    const targetAlbum =
      state.selectedAlbum === 'ALL' || state.selectedAlbum === '__FEATURED__'
        ? state.catalog.albums?.[0] || 'POLÍTICAS'
        : state.selectedAlbum;
    const albumItems = allItems.filter((it) => it.album === targetAlbum);

    const subCounts = {};
    for (const it of albumItems) {
      if (it.subalbum) {
        subCounts[it.subalbum] = (subCounts[it.subalbum] || 0) + 1;
      }
    }

    const declaredSubs = (state.catalog.subalbums && state.catalog.subalbums[targetAlbum]) || [];
    const allSubs = Array.from(new Set([...declaredSubs, ...Object.keys(subCounts)])).sort(
      (a, b) => (subCounts[b] || 0) - (subCounts[a] || 0)
    );

    if (prefixEl) {
      prefixEl.textContent = state.selectedAlbum === 'ALL' ? `Subpastas (${targetAlbum}):` : 'Subpastas:';
    }

    if (allSubs.length === 0) {
      container.innerHTML = `<span class="text-xs font-mono text-[#E0FBFC]/50">Sem subpastas em ${escapeHtml(targetAlbum)}</span>`;
      return;
    }

    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const pillsHtml = allSubs
      .map((s) => {
        const isActive = state.selectedAlbum === targetAlbum && state.selectedSubalbum === s;
        const count = subCounts[s] || 0;
        const displayLabel = s.replace(/_/g, ' - ');
        const subScope = `${targetAlbum}::${s}`;
        const altScope = `${targetAlbum}/${s}`;
        const fMeta = fMetaMap[subScope] || fMetaMap[altScope] || fMetaMap[s] || {};
        const isPhone = fMeta && fMeta.deviceType === 'phone';
        const isCamera = fMeta && fMeta.deviceType === 'camera';
        const devIcon = isPhone ? '📱' : isCamera ? '📷' : '';
        const customColor = fMeta.color || null;
        const iconName = fMeta.icon || null;
        const isFav = Boolean(fMeta.isFavorite);
        const equipBadge = devIcon
          ? `<span class="ml-1 text-xs" title="${isPhone ? 'Gravado em Celular' : 'Gravado em Câmera'}">${devIcon}</span>`
          : '';
        const iconSpan = iconName ? `<span class="material-symbols-outlined text-[14px]">${iconName}</span>` : '<span class="text-[#FFB703]">/</span>';
        const styleAttr = customColor ? `style="--folder-accent:${customColor}; border-color:${customColor};"` : '';

        return `
          <button type="button" class="subpill px-3 py-1.5 rounded-lg bg-[#0B1320] border ${
            isActive ? 'border-[#FFB703] text-[#E0FBFC] font-bold shadow' : 'border-[#5A189A]/70 text-[#E0FBFC]/80'
          } ${customColor ? 'folder-pill-custom' : ''} hover:border-[#FFB703] text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer" data-subalbum="${escapeHtml(s)}" data-parent-album="${escapeHtml(targetAlbum)}" ${styleAttr}>
            ${iconSpan}<span>${escapeHtml(displayLabel)}</span>${equipBadge}${isFav ? '<span title="Subpasta favorita">⭐</span>' : ''}
            <span class="text-[#FFB703] font-bold">${count}</span>
          </button>
        `;
      })
      .join('');

    container.innerHTML = pillsHtml;

    container.querySelectorAll('.subpill[data-subalbum]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.subalbum;
        const parentAlb = btn.dataset.parentAlbum || targetAlbum;
        if (state.selectedAlbum === parentAlb && state.selectedSubalbum === sub) {
          state.selectedSubalbum = 'ALL';
        } else {
          state.selectedAlbum = parentAlb;
          state.selectedSubalbum = sub;
        }
        state.visibleCountLimit = 36;
        renderAlbumPills();
        renderSubalbumPills();
        renderPortfolioGrid();
      });
    });
  }

  function getCardFitSummaryLabel(item) {
    const ar = item.aspectRatioOverride || 'auto';
    const fit = item.fit || 'inherit';
    if (ar !== 'auto') return `📐 ${ar}`;
    if (fit === 'natural') return '📐 Natural';
    if (fit === 'cover') return '📐 Preencher';
    if (fit === 'contain') return '📐 Inteira';
    return '📐 Natural';
  }

  function cycleCardFitAndRatio(item) {
    const states = [
      { fit: 'natural', ar: 'auto' },
      { fit: 'cover', ar: '4:5' },
      { fit: 'cover', ar: '3:2' },
      { fit: 'cover', ar: '1:1' },
      { fit: 'cover', ar: '16:9' },
      { fit: 'contain', ar: 'auto' },
    ];
    const curFit = item.fit || 'natural';
    const curAr = item.aspectRatioOverride || 'auto';
    const idx = states.findIndex((s) => s.fit === curFit && s.ar === curAr);
    const next = states[(idx + 1) % states.length];
    item.fit = next.fit;
    item.aspectRatioOverride = next.ar;
  }

  function renderPhotoCardHtml(item, globalIndex, indexInAlbum = 0, albumTotal = 1, isInsideTileSection = false) {
    const w = Number(item.width) || 1600;
    const h = Number(item.height) || 1067;
    const layout = getLayoutSettings();
    const gridMode = layout.gridMode || 'masonry';
    let span = ['1x1', '2x1', '1x2', '2x2'].includes(item.span) ? item.span : '1x1';
    const fp = item.focalPoint && typeof item.focalPoint === 'object'
      ? { x: Number(item.focalPoint.x ?? 50), y: Number(item.focalPoint.y ?? 50) }
      : { x: 50, y: 50 };

    let ratioNum = w / h;

    // No modo Mosaico Dinâmico (bento), atribui spans automáticos inteligentes baseados na orientação real EXIF
    if (!isInsideTileSection && gridMode === 'bento' && span === '1x1') {
      if (indexInAlbum % 9 === 0) {
        span = '2x2';
      } else if (ratioNum > 1.25 && indexInAlbum % 3 === 1) {
        span = '2x1';
      } else if (ratioNum < 0.85 && indexInAlbum % 3 === 2) {
        span = '1x2';
      }
    }

    // Garante que o thumbSrc aponte para a miniatura comprimida AVIF e nunca para o original pesado
    let thumbSrc = item.thumbUrl || '';
    if (thumbSrc.startsWith('/portfolio-media/content/')) {
      thumbSrc = thumbSrc.replace('/portfolio-media/content/', '/portfolio-media/thumb/');
    }
    if (!thumbSrc.includes('fmt=')) {
      thumbSrc += (thumbSrc.includes('?') ? '&' : '?') + 'fmt=avif';
    }

    // Resolução de proporção (aspect-ratio) e object-fit
    const itemAr = item.aspectRatioOverride && item.aspectRatioOverride !== 'auto'
      ? item.aspectRatioOverride
      : 'auto';

    const effectiveFit = item.fit && item.fit !== 'inherit' ? item.fit : 'natural';

    let frameAspectCss = `${w} / ${h}`;
    if (itemAr !== 'auto' && itemAr.includes(':')) {
      const [rw, rh] = itemAr.split(':').map(Number);
      if (rw > 0 && rh > 0) {
        ratioNum = rw / rh;
        frameAspectCss = `${rw} / ${rh}`;
      }
    }

    const objectFitVal = effectiveFit === 'contain' ? 'contain' : 'cover';
    const justGrow = Number(ratioNum.toFixed(3));
    const estRowSpan = Math.max(12, Math.round((300 / Math.max(0.35, ratioNum)) / 8));

    const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;
    const isFocalActive = isStudio && state.activeFocalCardId === item.id;
    const isSelectedForMove = isStudio && state.selectedStudioItemIds.has(item.id);

    const draggableAttr = isStudio && !isFocalActive ? 'draggable="true"' : 'draggable="false"';
    const lbTriggerAttr = !isStudio ? `data-open-lb="${globalIndex}"` : '';
    const staggerDelayMs = Math.min(indexInAlbum * 22, 260);

    const studioOverlayHtml = isStudio
      ? `
        <div class="studio-card-top">
          <span class="studio-order-badge" title="Arraste o card para mudar de posição na seção ou pasta">
            ⠿ #${indexInAlbum + 1}
          </span>
          <button
            type="button"
            class="studio-select-chk ${isSelectedForMove ? 'selected' : ''}"
            data-toggle-select-card="${escapeHtml(item.id)}"
            title="Selecionar fotografia para mover em lote para outra pasta/subpasta no HD"
          >
            ${isSelectedForMove ? '☑ Selecionada' : '☐ Selecionar'}
          </button>
        </div>

        <div class="focal-reticle" style="left: ${fp.x}%; top: ${fp.y}%;" title="Ponto Focal (${fp.x}%, ${fp.y}%)"></div>

        <div class="studio-card-bottom">
          <div class="studio-card-left-tools">
            <button type="button" class="studio-tool-btn" data-move-card="${escapeHtml(item.id)}" data-move-dir="-1" ${indexInAlbum === 0 ? 'disabled style="opacity:0.35"' : ''} title="Mover para trás">◀</button>
            <button type="button" class="studio-tool-btn" data-move-card="${escapeHtml(item.id)}" data-move-dir="1" ${indexInAlbum >= albumTotal - 1 ? 'disabled style="opacity:0.35"' : ''} title="Mover para frente">▶</button>
            <button type="button" class="studio-tool-btn" data-cycle-fit="${escapeHtml(item.id)}" title="Alternar proporção desta foto">
              ${escapeHtml(getCardFitSummaryLabel(item))}
            </button>
            <button type="button" class="studio-tool-btn ${isFocalActive ? 'active' : ''}" data-toggle-focal="${escapeHtml(item.id)}" title="Ativar seleção de Ponto Focal (clique ou arraste na foto)">
              🎯 ${isFocalActive ? 'Clique na foto' : 'Foco'}
            </button>
          </div>
          <div class="studio-card-right-tools">
            <button type="button" class="studio-tool-btn" data-studio-lb="${globalIndex}" title="Visualizar em Tela Cheia (Lightbox)">🔍</button>
            <button type="button" class="studio-tool-btn danger" data-delete-photo="${escapeHtml(item.id)}" title="Excluir fotografia do disco">✕</button>
          </div>
        </div>
      `
      : '';

    const shortcutBadgeHtml = item.isShortcut
      ? `<span class="badge-virtual-shortcut" style="position:absolute;top:8px;left:8px;z-index:15;" title="Atalho virtual para ${escapeHtml(item.targetRelativePath || '')}">🔗 Atalho</span>`
      : '';

    const favoriteBadgeHtml = item.isFavorite
      ? `<button type="button" class="badge-favorite" data-toggle-fav-card="${escapeHtml(item.id)}" style="position:absolute;top:8px;right:8px;z-index:15;background:rgba(11,19,32,0.75);border-radius:50%;padding:4px;" title="Remover dos favoritos">⭐</button>`
      : `<button type="button" class="text-white/40 hover:text-[#FFB703]" data-toggle-fav-card="${escapeHtml(item.id)}" style="position:absolute;top:8px;right:8px;z-index:15;background:rgba(11,19,32,0.6);border-radius:50%;padding:4px;" title="Adicionar aos favoritos">☆</button>`;

    const tagsHtml = Array.isArray(item.tags) && item.tags.length > 0
      ? `<div class="flex flex-wrap items-center gap-1" style="position:absolute;bottom:8px;left:8px;z-index:15;max-width:80%;">${item.tags.slice(0, 3).map((t) => `<span class="tag-pill text-[10px]">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    return `
      <article
        class="photo-card span-${span} ${isStudio ? 'studio-card' : ''} ${isFocalActive ? 'focal-mode-active' : ''}"
        data-photo-id="${escapeHtml(item.id)}"
        data-photo-album="${escapeHtml(item.album || 'Destaques')}"
        ${draggableAttr}
        style="--just-grow: ${justGrow}; --row-span: ${estRowSpan}; animation-delay: ${staggerDelayMs}ms;"
      >
        <div
          class="photo-frame"
          ${lbTriggerAttr}
          data-frame-id="${escapeHtml(item.id)}"
          data-lock-ar="${itemAr !== 'auto' || isInsideTileSection ? '1' : '0'}"
          style="aspect-ratio: ${frameAspectCss};"
        >
          ${shortcutBadgeHtml}
          ${favoriteBadgeHtml}
          ${tagsHtml}
          <img
            src="${escapeHtml(thumbSrc)}"
            alt="${escapeHtml(item.title)}"
            loading="lazy"
            decoding="async"
            draggable="false"
            style="object-fit: ${objectFitVal}; object-position: ${fp.x}% ${fp.y}%;"
            onerror="if (!this.dataset.retried) { this.dataset.retried = '1'; this.src = this.src + '&r=' + Date.now(); }"
          />
          ${studioOverlayHtml}
        </div>
      </article>
    `;
  }

  function updateMasonrySpans() {
    const layout = getLayoutSettings();
    if ((layout.gridMode || 'masonry') !== 'masonry') return;

    const gapPx = Number.isFinite(Number(layout.gapPx)) ? Number(layout.gapPx) : 18;
    const rowUnit = 8; // grid-auto-rows: 8px

    document.querySelectorAll('.portfolio-grid-layout.layout-masonry .photo-card').forEach((card) => {
      const frame = card.querySelector('.photo-frame');
      if (!frame) return;
      const h = frame.getBoundingClientRect().height;
      if (h > 10) {
        const spanRows = Math.max(8, Math.ceil((h + gapPx) / rowUnit));
        card.style.setProperty('--row-span', String(spanRows));
      }
    });
  }

  function toggleAlbumSection(albumName) {
    const section = document.querySelector(`[data-album-section="${CSS.escape(albumName)}"]`);
    if (!section) return;

    const isCollapsed = section.classList.toggle('is-collapsed');
    if (isCollapsed) {
      state.collapsedAlbums.add(albumName);
    } else {
      state.collapsedAlbums.delete(albumName);
      requestAnimationFrame(updateMasonrySpans);
    }
    localStorage.setItem('portfolio_collapsed_albums', JSON.stringify(Array.from(state.collapsedAlbums)));
    updateToggleAllBtnLabel();
  }

  function updateToggleAllBtnLabel() {
    const btn = $('btnToggleAllAlbums');
    const label = $('labelToggleAll');
    if (!btn || !label) return;

    const allSections = document.querySelectorAll('.portfolio-album-section');
    if (!allSections.length || state.selectedAlbum !== 'ALL') {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    const anyOpen = Array.from(allSections).some((s) => !s.classList.contains('is-collapsed'));
    label.textContent = anyOpen ? 'Recolher Pastas' : 'Expandir Pastas';
  }

  function movePhotoWithinOrAcrossAlbums(draggedId, targetAlbum, beforePhotoId = null) {
    const items = state.catalog.items || [];
    const fromIdx = items.findIndex((x) => x.id === draggedId);
    if (fromIdx === -1) return;

    const [moved] = items.splice(fromIdx, 1);
    moved.album = targetAlbum;

    if (beforePhotoId) {
      const toIdx = items.findIndex((x) => x.id === beforePhotoId);
      if (toIdx !== -1) {
        items.splice(toIdx, 0, moved);
      } else {
        items.push(moved);
      }
    } else {
      // Insere ao final dos itens daquele álbum
      let lastAlbumIdx = -1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].album === targetAlbum) lastAlbumIdx = i;
      }
      if (lastAlbumIdx !== -1) {
        items.splice(lastAlbumIdx + 1, 0, moved);
      } else {
        items.push(moved);
      }
    }

    // Reindexa order dentro de cada álbum
    const counters = {};
    for (const it of items) {
      const a = it.album || 'Destaques';
      const c = counters[a] || 0;
      it.order = c;
      counters[a] = c + 1;
    }

    markStudioDirty();
    renderAlbumPills();
    renderPortfolioGrid();
  }

  function getThumbUrlSafe(item) {
    let thumbSrc = item.thumbUrl || item.originalUrl || '';
    if (thumbSrc.startsWith('/portfolio-media/content/')) {
      thumbSrc = thumbSrc.replace('/portfolio-media/content/', '/portfolio-media/thumb/');
    }
    if (thumbSrc && !thumbSrc.includes('fmt=')) {
      thumbSrc += (thumbSrc.includes('?') ? '&' : '?') + 'fmt=avif';
    }
    return thumbSrc;
  }

  function renderMatteFrameHtml(item, flatOrdered, extraClasses = 'h-[290px]', imgMaxH = 'max-h-[255px]', splitMeta = null) {
    if (!item) return '';
    const globalIdx = Math.max(0, flatOrdered.indexOf(item));
    const thumbSrc = getThumbUrlSafe(item);
    const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;
    const isSelected = state.selectedStudioItemIds && state.selectedStudioItemIds.has(item.id);
    const isFeatured = Boolean(item.featured);
    const isFav = Boolean(item.isFavorite);
    const selectBtnHtml = isStudio
      ? `<button type="button" class="studio-select-chk ${isSelected ? 'selected' : ''}" data-toggle-select-card="${escapeHtml(item.id)}" style="position:absolute;top:10px;right:10px;z-index:15;">${isSelected ? '☑ Selecionada' : '☐ Selecionar'}</button>`
      : '';
    const featureBtnHtml = isStudio
      ? `<button type="button" class="px-2 py-0.5 rounded-full text-xs font-mono font-bold shadow cursor-pointer transition-all ${
          isFeatured
            ? 'bg-[#FFB703] text-[#0B1320] border border-[#0B1320]'
            : 'bg-[#0B1320]/85 text-[#FFB703] border border-[#FFB703]/60 hover:bg-[#FFB703] hover:text-[#0B1320]'
        }" data-toggle-feature-card="${escapeHtml(item.id)}" style="position:absolute;top:10px;left:10px;z-index:15;" title="${isFeatured ? 'Remover dos Destaques' : 'Marcar como Foto de Destaque'}">${isFeatured ? '⭐ Destaque' : '☆ Destacar'}</button>`
      : isFeatured
        ? `<span class="px-2 py-0.5 rounded-full bg-[#0B1320]/80 border border-[#FFB703]/60 text-[10px] font-mono text-[#FFB703] font-bold pointer-events-none" style="position:absolute;top:8px;left:8px;z-index:10;" title="Fotografia em Destaque">⭐</span>`
        : '';
    // Botão/badge de favorito: Admin edita, visitante vê badge read-only
    const favBtnHtml = state.isAdmin && !state.isVisitorViewOverride
      ? `<button type="button" class="px-2 py-0.5 rounded-full text-xs font-mono font-bold shadow cursor-pointer transition-all ${
          isFav ? 'bg-[#FFB703] text-[#0B1320]' : 'bg-[#0B1320]/80 text-[#FFB703] border border-[#FFB703]/60 hover:bg-[#FFB703] hover:text-[#0B1320]'
        }" data-toggle-fav-card="${escapeHtml(item.id)}" style="position:absolute;bottom:10px;left:10px;z-index:15;" title="${isFav ? 'Remover dos Favoritos' : 'Favoritar ⭐'}">${isFav ? '⭐' : '☆'}</button>`
      : isFav
        ? `<span class="px-2 py-0.5 rounded-full bg-[#0B1320]/80 border border-[#FFB703]/60 text-[10px] font-mono text-[#FFB703] font-bold pointer-events-none" style="position:absolute;bottom:8px;left:8px;z-index:10;" title="Fotografia Favorita">⭐</span>`
        : '';
    const splitBtnHtml = (isStudio && splitMeta && splitMeta.canSplit)
      ? `<button type="button" class="photo-split-btn absolute bottom-2 left-2 z-20" data-wm-split-sec="${splitMeta.secIdx}" data-wm-split-idx="${splitMeta.itemIdx}" data-wm-scope="${escapeHtml(splitMeta.scopeKey)}" title="Dividir seção logo após esta foto"><span>✂</span><span>Dividir aqui</span></button>`
      : '';
    return `
      <div class="photo-matte-frame rounded-[14px] ${extraClasses} relative group" data-open-lb="${globalIdx}" data-photo-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title || item.album || 'Fotografia')}">
        ${featureBtnHtml}
        ${selectBtnHtml}
        ${splitBtnHtml}
        ${favBtnHtml}
        <img
          src="${escapeHtml(thumbSrc)}"
          alt="${escapeHtml(item.title || item.album || 'Fotografia')}"
          class="${imgMaxH} max-w-full w-auto object-contain rounded-md"
          loading="lazy"
          decoding="async"
          onerror="if (!this.dataset.retried) { this.dataset.retried = '1'; this.src = this.src + '&r=' + Date.now(); }"
        />
      </div>
    `;
  }

  async function toggleItemFeatured(itemId) {
    if (!state.isAdmin) {
      showToast('Apenas o Administrador pode destacar fotos.');
      return;
    }
    const item = (state.catalog.items || []).find((x) => x.id === itemId);
    if (!item) return;
    const nextVal = !item.featured;
    item.featured = nextVal;
    try {
      await apiJson('/api/portfolio/items/feature', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, featured: nextVal }),
      });
      if (state.studioSnapshot) {
        const snapIt = (state.studioSnapshot.items || []).find((x) => x.id === itemId);
        if (snapIt) snapIt.featured = nextVal;
      }
      renderAlbumPills();
      renderPortfolioGrid();
      if (state.lightboxIndex >= 0) {
        renderLightboxFeatureButton();
      }
      showToast(nextVal ? '⭐ Fotografia adicionada aos Destaques!' : 'Removida dos Destaques.');
    } catch (err) {
      item.featured = !nextVal;
      showToast(`Erro ao atualizar destaque: ${err.message}`, true);
    }
  }

  function ensureDefaultSectionsForScope(items, scopeKey, layout) {
    if (!layout.sections || typeof layout.sections !== 'object') {
      layout.sections = {};
    }
    if (!Array.isArray(layout.sections[scopeKey]) || layout.sections[scopeKey].length === 0) {
      if (items.length >= 12) {
        layout.sections[scopeKey] = [
          { id: `${scopeKey}_s1`, preset: '1g-2d' },
          { id: `${scopeKey}_s2`, preset: 'mosaic-6' },
          { id: `${scopeKey}_s3`, preset: 'carousel' },
        ];
      } else if (items.length >= 6) {
        layout.sections[scopeKey] = [
          { id: `${scopeKey}_s1`, preset: '1g-2d' },
          { id: `${scopeKey}_s2`, preset: 'mosaic-6' },
        ];
      } else if (items.length >= 3) {
        layout.sections[scopeKey] = [
          { id: `${scopeKey}_s1`, preset: '1g-2d' },
        ];
      } else {
        layout.sections[scopeKey] = [
          { id: `${scopeKey}_s1`, preset: '2-split' },
        ];
      }
    }
    return layout.sections[scopeKey];
  }

  function pickItemsForPreset(pool, usedSet, presetId, slots, explicitItemIds = null) {
    if (Array.isArray(explicitItemIds) && explicitItemIds.length > 0) {
      const picked = [];
      for (const id of explicitItemIds) {
        if (usedSet.has(id)) continue;
        const it = pool.find((x) => x.id === id);
        if (it) {
          usedSet.add(it.id);
          picked.push(it);
        }
      }
      if (picked.length > 0) return picked;
    }

    const picked = [];
    const takeMatching = (predicate) => {
      for (const it of pool) {
        if (usedSet.has(it.id)) continue;
        if (predicate(it)) {
          usedSet.add(it.id);
          picked.push(it);
          return true;
        }
      }
      return false;
    };

    const isPortrait = (it) => (Number(it.height) || 0) > (Number(it.width) || 0);
    const isLandscape = (it) => (Number(it.width) || 0) >= (Number(it.height) || 0);

    if (presetId === '1g-2d') {
      if (!takeMatching(isPortrait)) takeMatching(() => true);
      if (!takeMatching(isLandscape)) takeMatching(() => true);
      if (!takeMatching(isLandscape)) takeMatching(() => true);
      return picked;
    }

    if (presetId === '2e-1g') {
      if (!takeMatching(isLandscape)) takeMatching(() => true);
      if (!takeMatching(isLandscape)) takeMatching(() => true);
      if (!takeMatching(isPortrait)) takeMatching(() => true);
      return picked;
    }

    if (presetId === 'carousel') {
      for (let i = 0; i < slots; i++) {
        if (!takeMatching(isLandscape)) {
          if (!takeMatching(() => true)) break;
        }
      }
      return picked;
    }

    for (let i = 0; i < slots; i++) {
      if (!takeMatching(() => true)) break;
    }
    return picked;
  }

  function buildScopedGalleryWithTiles(items, scopeKey, flatOrdered, gridModeClass, albumName, subalbumName = '') {
    state._scopedItems = state._scopedItems || {};
    state._scopedItems[scopeKey] = items;

    const layout = getLayoutSettings();
    const sectionConfigs = ensureDefaultSectionsForScope(items, scopeKey, layout);
    const usedIds = new Set();
    const sectionBlocksHtml = [];
    const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;

    sectionConfigs.forEach((sec, secIdx) => {
      const presetDef = WM_TILE_PRESETS.find((p) => p.id === sec.preset) || WM_TILE_PRESETS[2];
      const slots = presetDef.slots || 3;
      const secItems = pickItemsForPreset(items, usedIds, presetDef.id, slots, sec.itemIds);

      if (secItems.length === 0) return;

      const secDomId = `sec_${escapeHtml(scopeKey.replace(/[^a-zA-Z0-9]/g, '_'))}_${secIdx}`;

      // Barra Snap Layouts no cabeçalho (Exclusiva para o Admin no modo Editar Visualização!)
      const snapSwitcherHtml = isStudio
        ? `
          <div class="snap-layout-bar" title="Layout da Seção">
            ${WM_TILE_PRESETS.map((p) => {
              const active = p.id === presetDef.id;
              return `
                <button
                  type="button"
                  data-wm-change-preset="${escapeHtml(p.id)}"
                  data-wm-scope="${escapeHtml(scopeKey)}"
                  data-wm-sec-idx="${secIdx}"
                  title="${escapeHtml(p.title || p.label)}"
                  class="snap-btn ${active ? 'active' : ''}"
                >${p.svgIcon || p.short}</button>
              `;
            }).join('')}
          </div>
        `
        : '';

      const mergeBtnHtml = (secIdx > 0 && isStudio)
        ? `
          <button
            type="button"
            data-wm-merge-sec="${secIdx}"
            data-wm-scope="${escapeHtml(scopeKey)}"
            class="px-2.5 py-1 text-xs font-mono text-[#FFB703] bg-[#240046] hover:bg-[#5A189A] border border-[#FFB703]/50 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow"
            title="Remover quebra e unir com a seção anterior"
          >
            <span>⤺</span>
            <span class="hidden sm:inline">Unir com seção acima</span>
          </button>
        `
        : '';

      const rightBadgeHtml = `
        <div class="flex items-center gap-2">
          ${mergeBtnHtml}
          ${snapSwitcherHtml}
          ${
            presetDef.id === 'carousel'
              ? `<div class="hidden md:flex items-center gap-1.5 text-xs font-mono text-[#FFB703]"><span class="w-2 h-2 rounded-full bg-[#FFB703]"></span><span>Deslize para o lado</span></div>`
              : `<span class="hidden md:inline-block text-xs font-mono text-[#E0FBFC]/70 bg-[#0B1320] px-2 py-0.5 rounded border border-[#5A189A]/40">${secItems.length} obras</span>`
          }
        </div>
      `;

      const sm = (idx) => ({
        canSplit: isStudio && idx < secItems.length - 1,
        secIdx,
        itemIdx: idx,
        scopeKey,
      });

      let bodyHtml = '';

      if (presetDef.id === '1-full') {
        bodyHtml = `
          <div class="grid grid-cols-1 snap-single-col" style="gap: var(--gallery-gap, 18px);">
            ${renderMatteFrameHtml(secItems[0], flatOrdered, 'h-[560px]', 'max-h-[515px]', sm(0))}
          </div>
        `;
      } else if (presetDef.id === '2-split') {
        bodyHtml = `
          <div class="grid grid-cols-1 md:grid-cols-2" style="gap: var(--gallery-gap, 18px);">
            ${secItems.map((it, idx) => renderMatteFrameHtml(it, flatOrdered, 'h-[400px]', 'max-h-[360px]', sm(idx))).join('')}
          </div>
        `;
      } else if (presetDef.id === '2-asym') {
        bodyHtml = `
          <div class="grid grid-cols-1 md:grid-cols-12" style="gap: var(--gallery-gap, 18px);">
            <div class="md:col-span-8">
              ${renderMatteFrameHtml(secItems[0], flatOrdered, 'h-[440px]', 'max-h-[400px]', sm(0))}
            </div>
            <div class="md:col-span-4">
              ${secItems[1] ? renderMatteFrameHtml(secItems[1], flatOrdered, 'h-[440px]', 'max-h-[400px]', sm(1)) : ''}
            </div>
          </div>
        `;
      } else if (presetDef.id === '3-cols') {
        bodyHtml = `
          <div class="grid grid-cols-1 md:grid-cols-3" style="gap: var(--gallery-gap, 18px);">
            ${secItems.map((it, idx) => renderMatteFrameHtml(it, flatOrdered, 'h-[360px]', 'max-h-[320px]', sm(idx))).join('')}
          </div>
        `;
      } else if (presetDef.id === '1g-2d') {
        const leftItem = secItems[0];
        const rightTop = secItems[1];
        const rightBottom = secItems[2];
        bodyHtml = `
          <div class="grid grid-cols-1 md:grid-cols-2" style="gap: var(--gallery-gap, 18px);">
            ${renderMatteFrameHtml(leftItem, flatOrdered, 'h-[580px]', 'max-h-[530px]', sm(0))}
            <div class="flex flex-col h-[580px]" style="gap: var(--gallery-gap, 18px);">
              ${rightTop ? renderMatteFrameHtml(rightTop, flatOrdered, 'flex-1', 'max-h-[245px]', sm(1)) : ''}
              ${rightBottom ? renderMatteFrameHtml(rightBottom, flatOrdered, 'flex-1', 'max-h-[245px]', sm(2)) : ''}
            </div>
          </div>
        `;
      } else if (presetDef.id === '2e-1g') {
        const leftTop = secItems[0];
        const leftBottom = secItems[1];
        const rightItem = secItems[2];
        bodyHtml = `
          <div class="grid grid-cols-1 md:grid-cols-2" style="gap: var(--gallery-gap, 18px);">
            <div class="flex flex-col h-[580px]" style="gap: var(--gallery-gap, 18px);">
              ${leftTop ? renderMatteFrameHtml(leftTop, flatOrdered, 'flex-1', 'max-h-[245px]', sm(0)) : ''}
              ${leftBottom ? renderMatteFrameHtml(leftBottom, flatOrdered, 'flex-1', 'max-h-[245px]', sm(1)) : ''}
            </div>
            ${rightItem ? renderMatteFrameHtml(rightItem, flatOrdered, 'h-[580px]', 'max-h-[530px]', sm(2)) : ''}
          </div>
        `;
      } else if (presetDef.id === 'grid-4') {
        bodyHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2" style="gap: var(--gallery-gap, 18px);">
            ${secItems.map((it, idx) => renderMatteFrameHtml(it, flatOrdered, 'h-[340px]', 'max-h-[300px]', sm(idx))).join('')}
          </div>
        `;
      } else if (presetDef.id === 'carousel') {
        bodyHtml = `
          <div class="relative group">
            <button type="button" data-sec-carousel-prev="${secDomId}" class="absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-[#FFB703] hover:bg-[#e0a200] text-[#0B1320] flex items-center justify-center font-black shadow-2xl transition-transform active:scale-95 border-none cursor-pointer" title="Anterior">
              <span class="text-xl">◀</span>
            </button>
            <button type="button" data-sec-carousel-next="${secDomId}" class="absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-[#FFB703] hover:bg-[#e0a200] text-[#0B1320] flex items-center justify-center font-black shadow-2xl transition-transform active:scale-95 border-none cursor-pointer" title="Próximo">
              <span class="text-xl">▶</span>
            </button>
            <div id="${secDomId}" class="carousel-container flex overflow-x-auto py-2" style="gap: var(--gallery-gap, 18px);">
              ${secItems
                .map((it, cIdx) =>
                  renderMatteFrameHtml(
                    it,
                    flatOrdered,
                    `w-[31%] min-w-[290px] shrink-0 h-[220px] ${cIdx === 3 ? 'opacity-90' : ''}`,
                    'max-h-[185px]',
                    sm(cIdx)
                  )
                )
                .join('')}
            </div>
            <div class="flex items-center justify-center gap-2 mt-4">
              <span class="w-6 h-2 rounded-full bg-[#FFB703]"></span>
              <span class="w-2 h-2 rounded-full bg-[#5A189A]"></span>
              <span class="w-2 h-2 rounded-full bg-[#5A189A]/50"></span>
              <span class="w-2 h-2 rounded-full bg-[#5A189A]/50"></span>
            </div>
          </div>
        `;
      } else {
        // mosaic-6 (3x2 grid)
        bodyHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style="gap: var(--gallery-gap, 18px);">
            ${secItems.map((it, idx) => renderMatteFrameHtml(it, flatOrdered, 'h-[285px]', 'max-h-[245px]', sm(idx))).join('')}
          </div>
        `;
      }

      sectionBlocksHtml.push(`
        <section class="space-y-4" data-wm-section="${escapeHtml(scopeKey)}-${secIdx}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[#FFB703] text-[20px]">${escapeHtml(presetDef.icon)}</span>
              <h2 class="font-syne text-xl font-bold text-[#E0FBFC]">Seção ${secIdx + 1} — ${escapeHtml(presetDef.label)}</h2>
            </div>
            ${rightBadgeHtml}
          </div>
          ${bodyHtml}
        </section>
      `);
    });

    const remainingItems = items.filter((it) => !usedIds.has(it.id));
    const limit = state.visibleCountLimit || 36;
    const visibleRemaining = remainingItems.slice(0, limit);
    const hasMore = remainingItems.length > limit;

    const remainingGridHtml =
      visibleRemaining.length > 0
        ? `
          <section class="space-y-4 pt-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[#FFB703] text-[20px]">photo_library</span>
                <h2 class="font-syne text-xl font-bold text-[#E0FBFC]">Acervo Completo — ${escapeHtml(albumName === 'ALL' ? 'Todas as Obras' : albumName)}${subalbumName ? ` / ${escapeHtml(subalbumName)}` : ''}</h2>
              </div>
              <span class="text-xs font-mono text-[#E0FBFC]/70">Exibindo ${usedIds.size + visibleRemaining.length} de ${items.length} obras</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style="gap: var(--gallery-gap, 18px);">
              ${visibleRemaining.map((it) => renderMatteFrameHtml(it, flatOrdered, 'h-[285px]', 'max-h-[245px]')).join('')}
            </div>
            ${
              hasMore
                ? `
                  <div class="flex justify-center pt-4">
                    <button type="button" id="btnLoadMorePhotos" class="px-6 py-3 rounded-xl bg-[#240046] hover:bg-[#5A189A] border border-[#FFB703] text-sm font-bold text-[#FFB703] hover:text-[#E0FBFC] shadow-lg transition-all cursor-pointer">
                      Carregar mais fotografias (+${Math.min(48, remainingItems.length - limit)} de ${remainingItems.length - limit} restantes)
                    </button>
                  </div>
                `
                : ''
            }
          </section>
        `
        : '';

    return `<div class="space-y-12">${sectionBlocksHtml.join('')}${remainingGridHtml}</div>`;
  }

  async function promptCreateFolderOrSubfolder(defaultParentAlbum = '') {
    const defaultHint = defaultParentAlbum && defaultParentAlbum !== 'ALL' ? `${defaultParentAlbum}/` : '';
    const rawInput = prompt(
      'Criar nova Pasta ou Subpasta física no HD:\n• Para pasta principal: digite ex: ENSAIOS\n• Para subpasta: digite ex: POLÍTICAS/ATO_ CENTRO',
      defaultHint
    );
    if (!rawInput || !rawInput.trim()) return;
    const clean = rawInput.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;

    let parentAlbum = '';
    let name = clean;
    if (clean.includes('/')) {
      const parts = clean.split('/').map((s) => s.trim()).filter(Boolean);
      parentAlbum = parts[0] || '';
      name = parts.slice(1).join('_');
    }

    try {
      const res = await apiJson('/api/portfolio/folder/create', {
        method: 'POST',
        body: JSON.stringify({ parentAlbum, name }),
      });
      if (res.catalog) {
        state.catalog = res.catalog;
        if (state.studioSnapshot) {
          state.studioSnapshot.albums = [...(res.catalog.albums || [])];
          state.studioSnapshot.subalbums = JSON.parse(JSON.stringify(res.catalog.subalbums || {}));
        }
      }
      if (parentAlbum) {
        state.selectedAlbum = res.album || parentAlbum;
        state.selectedSubalbum = res.subalbum || name;
        showToast(`Subpasta "/${state.selectedAlbum}/${state.selectedSubalbum}" criada no HD!`);
      } else {
        const createdAlb = res.album || name;
        if (!state.catalog.albums.includes(createdAlb)) state.catalog.albums.push(createdAlb);
        state.selectedAlbum = createdAlb;
        state.selectedSubalbum = 'ALL';
        showToast(`Pasta principal "${createdAlb}" criada no HD!`);
      }
      renderAlbumPills();
      renderSubalbumPills();
      renderPortfolioGrid();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function promptRenameCurrentFolder(targetAlbum = '', targetSubalbum = '') {
    let album = targetAlbum || (state.selectedAlbum !== 'ALL' ? state.selectedAlbum : '');
    let subalbum = targetSubalbum && targetSubalbum !== 'ALL' ? targetSubalbum : '';

    if (!album) {
      const chosen = prompt(
        `Qual pasta deseja renomear no HD?\nPastas atuais: ${(state.catalog.albums || []).join(', ')}`
      );
      if (!chosen || !chosen.trim()) return;
      const parts = chosen.trim().replace(/^\/+|\/+$/g, '').split('/');
      album = parts[0].trim();
      subalbum = parts[1] ? parts[1].trim() : '';
    }

    const currentLabel = subalbum ? `${album}/${subalbum}` : album;
    const currentBase = subalbum || album;
    const rawNew = prompt(`Novo nome para "${currentLabel}" no HD externo:`, currentBase);
    if (!rawNew || !rawNew.trim() || rawNew.trim() === currentBase) return;
    const newName = rawNew.trim();

    try {
      const res = await apiJson('/api/portfolio/folder/rename', {
        method: 'POST',
        body: JSON.stringify({ album, subalbum, newName }),
      });
      if (res.catalog) {
        state.catalog = res.catalog;
        if (state.studioSnapshot) {
          state.studioSnapshot = JSON.parse(JSON.stringify(res.catalog));
        }
      }
      if (subalbum) {
        if (state.selectedAlbum === album && state.selectedSubalbum === subalbum) {
          state.selectedSubalbum = res.newName || newName;
        }
        showToast(`Subpasta renomeada para "/${album}/${res.newName || newName}" no HD!`);
      } else {
        if (state.selectedAlbum === album) {
          state.selectedAlbum = res.newName || newName;
        }
        showToast(`Pasta renomeada para "${res.newName || newName}" no HD!`);
      }
      renderAlbumPills();
      renderSubalbumPills();
      renderPortfolioGrid();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function promptMoveSelectedItems() {
    const ids = Array.from(state.selectedStudioItemIds);
    if (ids.length === 0) {
      showToast('Selecione 1 ou mais fotos clicando em "☐ Selecionar" no canto superior de cada foto.', true);
      return;
    }

    const defaultDest =
      state.selectedAlbum !== 'ALL'
        ? state.selectedSubalbum && state.selectedSubalbum !== 'ALL'
          ? `${state.selectedAlbum}/${state.selectedSubalbum}`
          : state.selectedAlbum
        : (state.catalog.albums || [])[0] || 'Destaques';

    const rawDest = prompt(
      `Mover ${ids.length} foto(s) selecionada(s) para qual Pasta ou Subpasta no HD?\n• Exemplo pasta raiz: EVENTOS\n• Exemplo subpasta: POLÍTICAS/ATO\n\nPastas existentes: ${(state.catalog.albums || []).join(', ')}`,
      defaultDest
    );
    if (!rawDest || !rawDest.trim()) return;

    const clean = rawDest.trim().replace(/^\/+|\/+$/g, '');
    const parts = clean.split('/').map((s) => s.trim()).filter(Boolean);
    const targetAlbum = parts[0] || '';
    const targetSubalbum = parts.slice(1).join('_') || '';
    if (!targetAlbum) return;

    try {
      const res = await apiJson('/api/portfolio/items/move', {
        method: 'POST',
        body: JSON.stringify({ itemIds: ids, targetAlbum, targetSubalbum }),
      });
      if (res.catalog) {
        state.catalog = res.catalog;
        if (state.studioSnapshot) {
          state.studioSnapshot = JSON.parse(JSON.stringify(res.catalog));
        }
      }
      state.selectedStudioItemIds.clear();
      applyGlobalLayoutVariables();
      renderAlbumPills();
      renderSubalbumPills();
      renderPortfolioGrid();
      showToast(
        `${res.movedCount || ids.length} foto(s) movida(s) para "${targetSubalbum ? `${targetAlbum}/${targetSubalbum}` : targetAlbum}" no HD!`
      );
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function buildFreeModeGalleryHtml(items, flatOrdered, direction = 'vertical', columns = 'multi') {
    if (!items || items.length === 0) {
      return `<div class="py-12 text-center text-xs font-mono text-[#E0FBFC]/60">Nenhuma fotografia neste filtro.</div>`;
    }

    if (direction === 'carousel' || direction === 'horizontal') {
      const idx = Math.max(0, Math.min(items.length - 1, state.freeCarouselIndex || 0));
      const activeItem = items[idx] || items[0];
      const activeGlobalIdx = Math.max(0, flatOrdered.indexOf(activeItem));
      const activeSrc = activeItem.originalUrl || getThumbUrlSafe(activeItem);
      const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;
      const isFeatured = Boolean(activeItem.featured);

      const featureBtnHtml = isStudio
        ? `<button type="button" class="px-2.5 py-1 rounded-full text-xs font-mono font-bold shadow cursor-pointer transition-all ${
            isFeatured
              ? 'bg-[#FFB703] text-[#0B1320]'
              : 'bg-[#0B1320]/85 text-[#FFB703] border border-[#FFB703]/60'
          }" data-toggle-feature-card="${escapeHtml(activeItem.id)}" style="position:absolute;top:12px;left:12px;z-index:25;">${isFeatured ? '⭐ Destaque' : '☆ Destacar'}</button>`
        : '';

      const filmstripHtml = items
        .slice(0, 120)
        .map((it, i) => {
          const isCur = i === idx;
          const tSrc = getThumbUrlSafe(it);
          return `
            <button
              type="button"
              data-free-carousel-idx="${i}"
              class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden bg-[#240046] border ${
                isCur ? 'border-[#FFB703] ring-2 ring-[#FFB703]' : 'border-[#5A189A]/60 opacity-65 hover:opacity-100'
              } transition-all cursor-pointer p-0.5"
              title="${escapeHtml(it.title || it.album || '')}"
            >
              <img src="${escapeHtml(tSrc)}" alt="Thumb ${i + 1}" class="w-full h-full object-cover rounded-lg" loading="lazy" />
            </button>
          `;
        })
        .join('');

      return `
        <div class="space-y-4">
          <div class="relative w-full rounded-2xl bg-[#0B1320]/70 border border-[#5A189A]/60 overflow-hidden flex flex-col items-center justify-center p-3 sm:p-5 min-h-[360px] sm:min-h-[520px] max-h-[75vh]">
            ${featureBtnHtml}
            <button type="button" id="btnFreeCarouselPrev" class="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FFB703] hover:bg-[#e0a200] text-[#0B1320] flex items-center justify-center font-black shadow-2xl transition-transform active:scale-95 cursor-pointer" title="Foto Anterior">◀</button>
            <button type="button" id="btnFreeCarouselNext" class="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FFB703] hover:bg-[#e0a200] text-[#0B1320] flex items-center justify-center font-black shadow-2xl transition-transform active:scale-95 cursor-pointer" title="Próxima Foto">▶</button>
            <div class="max-w-full max-h-[64vh] flex items-center justify-center cursor-pointer" data-open-lb="${activeGlobalIdx}">
              <img src="${escapeHtml(activeSrc)}" alt="${escapeHtml(activeItem.title || activeItem.album || 'Fotografia')}" class="max-w-full max-h-[62vh] w-auto h-auto object-contain rounded-xl shadow-2xl" />
            </div>
            <div class="mt-3 w-full max-w-2xl flex items-center justify-between text-xs font-mono text-[#E0FBFC]/90 bg-[#240046]/85 px-3.5 py-2 rounded-xl border border-[#5A189A]/50">
              <span class="truncate font-semibold">${escapeHtml(activeItem.title || activeItem.album || 'Fotografia')}</span>
              <span class="text-[#FFB703] font-bold shrink-0 ml-2">${idx + 1} / ${items.length}</span>
            </div>
          </div>
          <div class="w-full overflow-x-auto scrollbar-none py-1">
            <div class="flex items-center gap-2" id="freeCarouselFilmstrip">${filmstripHtml}</div>
          </div>
        </div>
      `;
    }

    const limit = state.visibleCountLimit || 48;
    const visibleItems = items.slice(0, limit);
    const hasMore = items.length > limit;

    const colNum = parseInt(state.freeViewColsCount || columns, 10) || (columns === 'single' ? 1 : 4);
    let gridCls = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    let cardH = 'h-[295px]';
    let imgH = 'max-h-[255px]';

    if (colNum === 1) {
      gridCls = 'grid grid-cols-1 max-w-4xl mx-auto snap-single-col';
      cardH = 'min-h-[340px] sm:h-[580px]';
      imgH = 'max-h-[535px]';
    } else if (colNum === 2) {
      gridCls = 'grid grid-cols-2';
      cardH = 'h-[250px] sm:h-[360px]';
      imgH = 'max-h-[210px] sm:max-h-[320px]';
    } else if (colNum === 3) {
      gridCls = 'grid grid-cols-2 sm:grid-cols-3';
      cardH = 'h-[220px] sm:h-[310px]';
      imgH = 'max-h-[185px] sm:max-h-[270px]';
    } else if (colNum === 4) {
      gridCls = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
      cardH = 'h-[200px] sm:h-[275px]';
      imgH = 'max-h-[165px] sm:max-h-[235px]';
    } else if (colNum >= 5) {
      gridCls = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';
      cardH = 'h-[180px] sm:h-[240px]';
      imgH = 'max-h-[150px] sm:max-h-[200px]';
    }

    const loadMoreHtml = hasMore
      ? `
        <div class="flex justify-center pt-4">
          <button type="button" id="btnLoadMorePhotos" class="px-6 py-3 rounded-xl bg-[#240046] hover:bg-[#5A189A] border border-[#FFB703] text-sm font-bold text-[#FFB703] hover:text-[#E0FBFC] shadow-lg transition-all cursor-pointer">
            Carregar mais fotografias (+${Math.min(48, items.length - limit)} de ${items.length - limit} restantes)
          </button>
        </div>
      `
      : '';

    return `
      <div class="space-y-6">
        <div class="${gridCls}" style="gap: var(--gallery-gap, 18px);">
          ${visibleItems.map((it) => renderMatteFrameHtml(it, flatOrdered, cardH, imgH)).join('')}
        </div>
        ${loadMoreHtml}
      </div>
    `;
  }

  function renderPortfolioGrid() {
    const allItems = state.catalog.items || [];
    const albums = state.catalog.albums || [];
    const grid = $('portfolioGrid');
    const empty = $('portfolioEmpty');
    const layout = getLayoutSettings();
    const gridModeClass = `portfolio-grid-layout layout-${layout.gridMode || 'masonry'}`;

    applyGlobalLayoutVariables();

    if ($('studioGapValue')) $('studioGapValue').textContent = `${layout.gapPx || 18}px`;
    if ($('studioRadiusValue')) $('studioRadiusValue').textContent = `${layout.borderRadiusPx ?? 14}px`;

    if (allItems.length === 0) {
      state.filteredPortfolio = [];
      if ($('portfolioCounter')) $('portfolioCounter').textContent = '0 obras';
      grid?.classList.add('hidden');
      empty?.classList.remove('hidden');
      return;
    }

    empty?.classList.add('hidden');
    grid?.classList.remove('hidden');

    // Filtra itens de acordo com o álbum e subpasta selecionados
    let scopedItems = [];
    let scopeKey = 'ALL';
    let displayAlbumName = 'ALL';

    if (state.selectedAlbum === '__FEATURED__') {
      scopedItems = allItems.filter((it) => Boolean(it.featured));
      scopeKey = '__FEATURED__';
      displayAlbumName = '⭐ Destaques';
    } else if (state.selectedAlbum === 'ALL') {
      // No acervo geral, prioriza fotos marcadas como Destaque no topo e depois segue a ordem dos álbuns
      const featuredItems = allItems.filter((it) => Boolean(it.featured));
      const nonFeaturedSet = new Set(featuredItems.map((it) => it.id));
      scopedItems.push(...featuredItems);
      for (const alb of albums) {
        const albItems = allItems.filter((it) => it.album === alb && !nonFeaturedSet.has(it.id));
        scopedItems.push(...albItems);
      }
      const orphans = allItems.filter((it) => (!it.album || !albums.includes(it.album)) && !nonFeaturedSet.has(it.id));
      scopedItems.push(...orphans);
      scopeKey = 'ALL';
      displayAlbumName = 'ALL';
    } else {
      const rawAlbItems = allItems.filter((it) => it.album === state.selectedAlbum);
      if (state.selectedSubalbum && state.selectedSubalbum !== 'ALL') {
        scopedItems = rawAlbItems.filter((it) => it.subalbum === state.selectedSubalbum);
        scopeKey = `${state.selectedAlbum}::${state.selectedSubalbum}`;
      } else {
        // Prioriza destaques do álbum no topo
        scopedItems = [
          ...rawAlbItems.filter((it) => Boolean(it.featured)),
          ...rawAlbItems.filter((it) => !it.featured),
        ];
        scopeKey = state.selectedAlbum;
      }
      displayAlbumName = state.selectedAlbum;
    }

    // Aplicação da Ordenação definida para o Álbum (customOrder se existir, senão data mais recente)
    let processedItems = [...scopedItems];
    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const curFolderMeta = fMetaMap[scopeKey] || {};
    if (Array.isArray(curFolderMeta.customOrder) && curFolderMeta.customOrder.length > 0) {
      const orderMap = new Map(curFolderMeta.customOrder.map((id, idx) => [id, idx]));
      processedItems.sort((a, b) => {
        const ordA = orderMap.has(a.id) ? orderMap.get(a.id) : 99999;
        const ordB = orderMap.has(b.id) ? orderMap.get(b.id) : 99999;
        return ordA - ordB;
      });
    }

    scopedItems = processedItems;

    state.filteredPortfolio = scopedItems;
    if ($('portfolioCounter')) {
      $('portfolioCounter').textContent = `${scopedItems.length} obras`;
    }

    if (scopedItems.length === 0 && state.selectedAlbum === '__FEATURED__') {
      grid.innerHTML = `
        <div class="py-12 px-4 text-center bg-[#240046]/50 border border-[#5A189A]/50 rounded-2xl space-y-2">
          <div class="text-2xl">⭐</div>
          <h3 class="font-syne text-base font-bold text-[#E0FBFC]">Nenhuma foto marcada como Destaque ainda</h3>
          <p class="text-xs text-[#E0FBFC]/75 max-w-md mx-auto">No modo Admin (Editar Visualização ou dentro do Lightbox), clique em <strong>"☆ Destacar"</strong> nas suas melhores fotos para exibi-las aqui e no topo do portfólio.</p>
        </div>
      `;
      return;
    }

    const effectiveDisplayMode = state.isEmbedMode ? 'free' : (state.portfolioDisplayMode || 'sections');
    const effectiveFreeDir = state.isEmbedMode
      ? (state.embedFixedLayout === 'horizontal' ? 'carousel' : 'vertical')
      : (state.freeViewDirection || 'vertical');
    const effectiveFreeCols = state.freeViewColumns || 'multi';

    if (effectiveDisplayMode === 'free') {
      grid.innerHTML = buildFreeModeGalleryHtml(scopedItems, scopedItems, effectiveFreeDir, effectiveFreeCols);
    } else if (state.subfolderViewMode === 'subfolders' && state.selectedSubalbum === 'ALL' && state.selectedAlbum !== '__FEATURED__') {
      const groups = new Map();
      if (state.selectedAlbum === 'ALL') {
        for (const alb of albums) {
          const albItems = scopedItems.filter((it) => it.album === alb);
          if (albItems.length > 0) groups.set(alb, albItems);
        }
      } else {
        for (const it of scopedItems) {
          const sub = it.subalbum || 'Raiz da Pasta';
          if (!groups.has(sub)) groups.set(sub, []);
          groups.get(sub).push(it);
        }
      }

      const blocks = [];
      const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
      for (const [grpName, grpItems] of groups.entries()) {
        const grpScope = state.selectedAlbum === 'ALL' ? grpName : `${state.selectedAlbum}::${grpName}`;
        const isCollapsed = state.selectedAlbum === 'ALL'
          ? (state.collapsedAlbums.has(grpScope) || state.collapsedAlbums.has(grpName))
          : false;
        const fMeta = fMetaMap[grpScope] || fMetaMap[grpName] || {};
        const isPhone = fMeta.deviceType === 'phone';
        const isCamera = fMeta.deviceType === 'camera';
        const devIcon = isPhone ? '📱' : isCamera ? '📷' : '';
        const devLabel = isPhone ? 'Celular' : isCamera ? 'Câmera' : '';
        const isStudio = state.isVisualEditMode && state.isAdmin && !state.isVisitorViewOverride;

        blocks.push(`
          <div class="portfolio-album-section space-y-6 pt-4 border-t border-[#5A189A]/30 first:border-t-0 first:pt-0 ${isCollapsed ? 'is-collapsed' : ''}" data-album-section="${escapeHtml(grpScope)}">
            <div class="flex flex-wrap items-center justify-between gap-2 bg-[#240046]/60 px-4 py-2.5 rounded-xl border border-[#5A189A]/50">
              <div class="flex items-center gap-2.5 min-w-0">
                <button type="button" class="btn-toggle-folder-collapse flex items-center gap-1.5 text-xs font-mono text-[#FFB703] hover:text-[#E0FBFC] bg-[#0B1320] px-2.5 py-1 rounded-lg border border-[#5A189A]/60 cursor-pointer transition-all" data-collapse-scope="${escapeHtml(grpScope)}">
                  <span class="collapse-chevron">${isCollapsed ? '▶' : '▼'}</span>
                  <span>${isCollapsed ? 'Expandir' : 'Recolher'}</span>
                </button>
                <span class="material-symbols-outlined text-[#FFB703] text-[18px]">folder_open</span>
                <span class="font-syne font-bold text-base text-[#E0FBFC] truncate">/${escapeHtml(grpName)}</span>
                ${
                  devIcon
                    ? `
                      <span class="text-xs px-2 py-0.5 rounded-full bg-[#0B1320] border border-[#5A189A] text-[#FFB703] flex items-center gap-1 shrink-0" title="Dispositivo da pasta: ${devLabel}">
                        <span>${devIcon}</span>
                        <span class="hidden sm:inline font-mono text-[10px]">${devLabel}</span>
                      </span>
                    `
                    : ''
                }
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button type="button" class="btn-download-folder-zip flex items-center gap-1.5 text-xs font-mono text-[#FFB703] hover:text-[#E0FBFC] bg-[#0B1320] px-2.5 py-1 rounded-lg border border-[#5A189A]/60 cursor-pointer transition-all hover:border-[#FFB703]" data-download-folder="${escapeHtml(grpScope)}" title="Baixar fotos desta pasta em arquivo .ZIP">
                  <span class="material-symbols-outlined text-[15px] text-[#FFB703]">folder_zip</span>
                  <span class="hidden sm:inline">Baixar .ZIP</span>
                  <span class="sm:hidden">.ZIP</span>
                </button>
                ${
                  isStudio
                    ? `
                      <button type="button" class="px-2.5 py-1 rounded-lg bg-[#0B1320] border border-[#5A189A] hover:border-[#FFB703] text-xs font-mono text-[#E0FBFC] flex items-center gap-1 cursor-pointer transition-colors" data-quick-dev-scope="${escapeHtml(grpScope)}" title="Definir dispositivo (📱 Celular / 📷 Câmera)">
                        <span>${devIcon || '📱/📷'}</span> <span class="hidden sm:inline">${devLabel || 'Dispositivo'}</span>
                      </button>
                      <button type="button" class="px-2.5 py-1 rounded-lg bg-[#0B1320] border border-[#5A189A] hover:border-[#FFB703] text-xs font-mono text-[#E0FBFC] flex items-center gap-1 cursor-pointer transition-colors" data-move-folder-scope="${escapeHtml(grpScope)}" data-folder-name="${escapeHtml(grpName)}" title="Mover pasta inteira para outro destino">
                        <span class="material-symbols-outlined text-[15px] text-[#FFB703]">drive_file_move</span>
                        <span class="hidden sm:inline">Mover Pasta</span>
                      </button>
                    `
                    : ''
                }
                <span class="font-mono text-xs text-[#FFB703] font-bold">${grpItems.length} obras</span>
              </div>
            </div>
            <div class="album-section-body ${isCollapsed ? 'hidden' : ''}">
              ${buildScopedGalleryWithTiles(grpItems, grpScope, scopedItems, gridModeClass, displayAlbumName, grpName)}
            </div>
          </div>
        `);
      }
      grid.innerHTML = `<div class="space-y-12">${blocks.join('')}</div>`;
    } else {
      // Modo 'full' (Ver Álbum Completo): fluxo editorial unificado em Seções (1 grande + 2, mosaico 6, Carrossel, etc.)
      grid.innerHTML = buildScopedGalleryWithTiles(
        scopedItems,
        scopeKey,
        scopedItems,
        gridModeClass,
        displayAlbumName,
        state.selectedSubalbum !== 'ALL' ? state.selectedSubalbum : ''
      );
    }

    // Bind dos botões individuais de recolher/expandir pasta
    grid.querySelectorAll('[data-collapse-scope]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sc = btn.dataset.collapseScope;
        if (!sc) return;
        if (state.collapsedAlbums.has(sc)) {
          state.collapsedAlbums.delete(sc);
        } else {
          state.collapsedAlbums.add(sc);
        }
        localStorage.setItem('portfolio_collapsed_albums', JSON.stringify(Array.from(state.collapsedAlbums)));
        renderPortfolioGrid();
        updateToggleAllBtnLabel();
      });
    });

    // Bind do botão de baixar pasta individual como .ZIP
    grid.querySelectorAll('[data-download-folder]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sc = btn.dataset.downloadFolder;
        if (!sc) return;
        triggerFolderZipDownload(sc);
      });
    });

    // Bind do botão rápido de alternar dispositivo da pasta (📱 Celular / 📷 Câmera)
    grid.querySelectorAll('[data-quick-dev-scope]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sc = btn.dataset.quickDevScope;
        if (!sc) return;
        openFolderEquipmentModal(sc);
      });
    });

    // Bind do botão de mover pasta inteira no HD
    grid.querySelectorAll('[data-move-folder-scope]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folderName = btn.dataset.folderName;
        const albums = (state.catalog.albums || []).filter((a) => a !== 'ALL');
        const targetAlb = prompt(
          `Mover a pasta "${folderName}" para qual álbum principal?\nOpções disponíveis: ${albums.join(', ')}`,
          albums[0] || ''
        );
        if (!targetAlb) return;
        try {
          const res = await apiJson('/api/portfolio/folder/move', {
            method: 'POST',
            body: JSON.stringify({
              srcPath: state.selectedAlbum !== 'ALL' ? `${state.selectedAlbum}/${folderName}` : folderName,
              destParent: targetAlb,
              newFolderName: folderName,
            }),
          });
          if (res.catalog) {
            state.catalog = res.catalog;
          }
          showToast(`Pasta "${folderName}" movida com sucesso para "${targetAlb}"!`);
          renderAlbumPills();
          renderSubalbumPills();
          renderPortfolioGrid();
        } catch (err) {
          showToast(`Erro ao mover pasta: ${err.message}`, true);
        }
      });
    });

    // Bind dos controles do Carrossel de Visualização Livre / Embed Horizontal
    $('btnFreeCarouselPrev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!scopedItems.length) return;
      state.freeCarouselIndex = ((state.freeCarouselIndex || 0) - 1 + scopedItems.length) % scopedItems.length;
      renderPortfolioGrid();
    });
    $('btnFreeCarouselNext')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!scopedItems.length) return;
      state.freeCarouselIndex = ((state.freeCarouselIndex || 0) + 1) % scopedItems.length;
      renderPortfolioGrid();
    });
    grid.querySelectorAll('[data-free-carousel-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.freeCarouselIndex = Number(btn.dataset.freeCarouselIdx) || 0;
        renderPortfolioGrid();
      });
    });

    // Bind do botão Carregar mais fotografias
    $('btnLoadMorePhotos')?.addEventListener('click', () => {
      state.visibleCountLimit = (state.visibleCountLimit || 36) + 48;
      renderPortfolioGrid();
    });

    // Bind das setas de Carrossel Netflix de cada seção
    grid.querySelectorAll('[data-sec-carousel-prev]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = $(btn.dataset.secCarouselPrev);
        if (track) track.scrollBy({ left: -Math.max(320, track.clientWidth * 0.75), behavior: 'smooth' });
      });
    });
    grid.querySelectorAll('[data-sec-carousel-next]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = $(btn.dataset.secCarouselNext);
        if (track) track.scrollBy({ left: Math.max(320, track.clientWidth * 0.75), behavior: 'smooth' });
      });
    });

    // Bind de troca de preset no topo de cada seção (funciona imediatamente!)
    grid.querySelectorAll('[data-wm-change-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmSecIdx);
        const preset = btn.dataset.wmChangePreset;
        if (!scope || !Array.isArray(layout.sections[scope]) || !layout.sections[scope][secIdx]) return;
        layout.sections[scope][secIdx].preset = preset;
        // Atualiza destaque visual na barra Editar Visualização
        document.querySelectorAll('[data-dock-preset]').forEach((b) => {
          const isMatch = b.dataset.dockPreset === preset;
          if (b.dataset.dockPreset !== 'carousel') {
            b.className = isMatch
              ? 'px-2.5 py-1 rounded bg-[#5A189A] border border-[#FFB703] text-xs font-mono text-[#E0FBFC] font-bold shadow transition-all'
              : 'px-2.5 py-1 rounded text-xs font-mono text-[#E0FBFC]/75 hover:text-[#E0FBFC] hover:bg-[#5A189A]/40 transition-all';
          }
        });
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    // Bind de divisão de seção entre fotos (Split)
    grid.querySelectorAll('[data-wm-split-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmSplitSec);
        const itemIdx = Number(btn.dataset.wmSplitIdx);
        splitSection(scope, secIdx, itemIdx);
      });
    });

    // Bind de união de seção com a acima (Merge)
    grid.querySelectorAll('[data-wm-merge-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmMergeSec);
        mergeSectionWithAbove(scope, secIdx);
      });
    });

    // Bind de abertura do Lightbox ao clicar em qualquer moldura
    grid.querySelectorAll('[data-open-lb]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (
          e.target.closest('[data-toggle-select-card]') ||
          e.target.closest('[data-toggle-feature-card]') ||
          e.target.closest('[data-toggle-fav-card]') ||
          e.target.closest('[data-wm-split-sec]')
        ) {
          return;
        }
        openLightbox(Number(el.dataset.openLb));
      });
    });

    // Bind de destacar foto (Estrela ⭐)
    grid.querySelectorAll('[data-toggle-feature-card]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggleFeatureCard;
        if (id) toggleItemFeatured(id);
      });
    });

    // Bind de favoritar foto (⭐ Favorito) — apenas Admin persiste; visitante não vê o botão
    grid.querySelectorAll('[data-toggle-fav-card]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.isAdmin) return;
        const itemId = btn.dataset.toggleFavCard;
        const item = (state.catalog.items || []).find((x) => x.id === itemId);
        if (!item) return;
        const nextFav = !item.isFavorite;
        item.isFavorite = nextFav;
        try {
          await apiJson('/api/portfolio/items/meta', {
            method: 'PATCH',
            body: JSON.stringify({ itemIds: [itemId], isFavorite: nextFav }),
          });
          showToast(nextFav ? '⭐ Foto adicionada aos favoritos!' : 'Removida dos favoritos');
          renderPortfolioGrid();
          // Sincroniza reflexo no Cofre se painel estiver aberto
          if (state.vaultData) renderVaultFolderRightPane();
        } catch (err) {
          item.isFavorite = !nextFav;
          showToast(`Erro ao favoritar: ${err.message}`, true);
          renderPortfolioGrid();
        }
      });
    });

    // Bind de seleção de card para mover (Suporta Shift + Click para seleção em lote e Ctrl/Cmd + Click)
    let lastClickedStudioIdx = -1;
    const cardSelectButtons = Array.from(grid.querySelectorAll('[data-toggle-select-card]'));

    cardSelectButtons.forEach((btn, bIdx) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggleSelectCard;
        if (!id) return;

        if (e.shiftKey && lastClickedStudioIdx !== -1 && lastClickedStudioIdx !== bIdx) {
          const start = Math.min(lastClickedStudioIdx, bIdx);
          const end = Math.max(lastClickedStudioIdx, bIdx);
          const shouldSelect = !state.selectedStudioItemIds.has(id);
          for (let i = start; i <= end; i++) {
            const curId = cardSelectButtons[i]?.dataset?.toggleSelectCard;
            if (curId) {
              if (shouldSelect) state.selectedStudioItemIds.add(curId);
              else state.selectedStudioItemIds.delete(curId);
            }
          }
        } else {
          if (state.selectedStudioItemIds.has(id)) {
            state.selectedStudioItemIds.delete(id);
          } else {
            state.selectedStudioItemIds.add(id);
          }
        }

        lastClickedStudioIdx = bIdx;
        if ($('studioSelectedCount')) $('studioSelectedCount').textContent = String(state.selectedStudioItemIds.size);
        renderPortfolioGrid();
      });
    });
  }

  function splitSection(scopeKey, secIdx, itemIdx) {
    const layout = getLayoutSettings();
    if (!layout.sections || !Array.isArray(layout.sections[scopeKey])) return;
    const secList = layout.sections[scopeKey];
    if (secIdx < 0 || secIdx >= secList.length) return;

    const currentSec = secList[secIdx];
    const allItems = (state._scopedItems && state._scopedItems[scopeKey]) || state.filteredPortfolio || [];
    const usedIds = new Set();
    for (let i = 0; i < secIdx; i++) {
      const pDef = WM_TILE_PRESETS.find((p) => p.id === secList[i].preset) || WM_TILE_PRESETS[2];
      pickItemsForPreset(allItems, usedIds, pDef.id, pDef.slots, secList[i].itemIds);
    }
    const currentPresetDef = WM_TILE_PRESETS.find((p) => p.id === currentSec.preset) || WM_TILE_PRESETS[2];
    const currentSecItems = pickItemsForPreset(allItems, usedIds, currentPresetDef.id, currentPresetDef.slots, currentSec.itemIds);

    if (itemIdx < 0 || itemIdx >= currentSecItems.length - 1) {
      showToast('Selecione uma foto intermediária para dividir a seção.', true);
      return;
    }

    const firstHalfItems = currentSecItems.slice(0, itemIdx + 1);
    const secondHalfItems = currentSecItems.slice(itemIdx + 1);

    currentSec.itemIds = firstHalfItems.map((it) => it.id);

    let nextPreset = '2-split';
    if (secondHalfItems.length === 1) nextPreset = '1-full';
    else if (secondHalfItems.length === 3) nextPreset = '1g-2d';
    else if (secondHalfItems.length >= 4) nextPreset = 'grid-4';

    const newSec = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      preset: nextPreset,
      itemIds: secondHalfItems.map((it) => it.id),
    };

    secList.splice(secIdx + 1, 0, newSec);
    markStudioDirty();
    renderPortfolioGrid();
    showToast(`Seção dividida! Nova seção criada com ${secondHalfItems.length} foto(s).`);
  }

  function mergeSectionWithAbove(scopeKey, secIdx) {
    const layout = getLayoutSettings();
    if (!layout.sections || !Array.isArray(layout.sections[scopeKey])) return;
    const secList = layout.sections[scopeKey];
    if (secIdx <= 0 || secIdx >= secList.length) return;

    const prevSec = secList[secIdx - 1];
    const currentSec = secList[secIdx];

    const allItems = (state._scopedItems && state._scopedItems[scopeKey]) || state.filteredPortfolio || [];
    const usedIds = new Set();
    for (let i = 0; i < secIdx - 1; i++) {
      const pDef = WM_TILE_PRESETS.find((p) => p.id === secList[i].preset) || WM_TILE_PRESETS[2];
      pickItemsForPreset(allItems, usedIds, pDef.id, pDef.slots, secList[i].itemIds);
    }
    const prevPDef = WM_TILE_PRESETS.find((p) => p.id === prevSec.preset) || WM_TILE_PRESETS[2];
    const prevItems = pickItemsForPreset(allItems, usedIds, prevPDef.id, prevPDef.slots, prevSec.itemIds);
    const currPDef = WM_TILE_PRESETS.find((p) => p.id === currentSec.preset) || WM_TILE_PRESETS[2];
    const currItems = pickItemsForPreset(allItems, usedIds, currPDef.id, currPDef.slots, currentSec.itemIds);

    prevSec.itemIds = [...prevItems.map((x) => x.id), ...currItems.map((x) => x.id)];

    secList.splice(secIdx, 1);
    markStudioDirty();
    renderPortfolioGrid();
    showToast('Seções unidas com sucesso!');
  }

  function bindStudioGridInteractions(grid) {
    const items = state.catalog.items || [];
    const layout = getLayoutSettings();
    if (!layout.sections || typeof layout.sections !== 'object') {
      layout.sections = {};
    }

    // 1b. Controles de Seções em Tiles (Window Manager Tiling Presets)
    grid.querySelectorAll('[data-wm-add-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const preset = btn.dataset.wmAddPreset;
        if (!scope || !preset) return;
        if (!Array.isArray(layout.sections[scope])) {
          layout.sections[scope] = [];
        }
        layout.sections[scope].push({
          id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          preset,
        });
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    grid.querySelectorAll('[data-wm-change-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmSecIdx);
        const preset = btn.dataset.wmChangePreset;
        if (!scope || !Array.isArray(layout.sections[scope]) || !layout.sections[scope][secIdx]) return;
        layout.sections[scope][secIdx].preset = preset;
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    grid.querySelectorAll('[data-wm-split-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmSplitSec);
        const itemIdx = Number(btn.dataset.wmSplitIdx);
        splitSection(scope, secIdx, itemIdx);
      });
    });

    grid.querySelectorAll('[data-wm-merge-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmMergeSec);
        mergeSectionWithAbove(scope, secIdx);
      });
    });

    grid.querySelectorAll('[data-wm-move-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmMoveSec);
        const dir = Number(btn.dataset.wmDir);
        const list = layout.sections[scope];
        if (!Array.isArray(list)) return;
        const targetIdx = secIdx + dir;
        if (targetIdx < 0 || targetIdx >= list.length) return;
        const tmp = list[secIdx];
        list[secIdx] = list[targetIdx];
        list[targetIdx] = tmp;
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    grid.querySelectorAll('[data-wm-del-sec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const scope = btn.dataset.wmScope;
        const secIdx = Number(btn.dataset.wmDelSec);
        if (!scope || !Array.isArray(layout.sections[scope])) return;
        layout.sections[scope].splice(secIdx, 1);
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    // 2. Botões de Mover Foto (◀ / ▶) dentro da pasta/seção
    grid.querySelectorAll('[data-move-card]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.moveCard;
        const dir = Number(btn.dataset.moveDir);
        const item = items.find((x) => x.id === id);
        if (!item) return;

        const sameAlbum = items.filter((x) => x.album === item.album && (x.subalbum || '') === (item.subalbum || ''));
        const idxInAlb = sameAlbum.indexOf(item);
        const targetNeighbor = sameAlbum[idxInAlb + dir];
        if (!targetNeighbor) return;

        const idxA = items.indexOf(item);
        const idxB = items.indexOf(targetNeighbor);
        items[idxA] = targetNeighbor;
        items[idxB] = item;

        const allInParent = items.filter((x) => x.album === item.album);
        allInParent.forEach((x, i) => {
          x.order = i;
        });
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    // 3. Alternar Encaixe / Proporção Individual do Card
    grid.querySelectorAll('[data-cycle-fit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = items.find((x) => x.id === btn.dataset.cycleFit);
        if (!item) return;
        cycleCardFitAndRatio(item);
        markStudioDirty();
        renderPortfolioGrid();
      });
    });

    // 4. Ativar/Desativar Modo Ponto Focal (Diretriz 5)
    grid.querySelectorAll('[data-toggle-focal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggleFocal;
        state.activeFocalCardId = state.activeFocalCardId === id ? null : id;
        renderPortfolioGrid();
      });
    });

    // 5. Clique ou Arraste para posicionar o Alvo Dourado de Ponto Focal (x%, y%)
    if (state.activeFocalCardId) {
      const activeFrame = grid.querySelector(`[data-frame-id="${CSS.escape(state.activeFocalCardId)}"]`);
      const activeItem = items.find((x) => x.id === state.activeFocalCardId);
      if (activeFrame && activeItem) {
        let isDraggingFocal = false;
        const updateFocalFromEvent = (ev) => {
          const rect = activeFrame.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 100)));
          const y = Math.max(0, Math.min(100, Math.round(((ev.clientY - rect.top) / rect.height) * 100)));
          activeItem.focalPoint = { x, y };
          const img = activeFrame.querySelector('img');
          const reticle = activeFrame.querySelector('.focal-reticle');
          if (img) img.style.objectPosition = `${x}% ${y}%`;
          if (reticle) {
            reticle.style.left = `${x}%`;
            reticle.style.top = `${y}%`;
          }
          markStudioDirty();
        };

        activeFrame.addEventListener('pointerdown', (ev) => {
          if (ev.target.closest('.studio-card-top') || ev.target.closest('.studio-card-bottom')) return;
          ev.preventDefault();
          ev.stopPropagation();
          isDraggingFocal = true;
          activeFrame.setPointerCapture?.(ev.pointerId);
          updateFocalFromEvent(ev);
        });

        activeFrame.addEventListener('pointermove', (ev) => {
          if (!isDraggingFocal) return;
          updateFocalFromEvent(ev);
        });

        activeFrame.addEventListener('pointerup', () => {
          isDraggingFocal = false;
        });
      }
    }

    // 6. Editar Título/Álbum ou Excluir Foto
    grid.querySelectorAll('[data-edit-photo]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = items.find((x) => x.id === btn.dataset.editPhoto);
        if (!item) return;
        $('editPhotoId').value = item.id;
        $('editPhotoTitle').value = item.title || '';
        $('editPhotoAlbumSelect').value = item.album || 'Destaques';
        $('editPhotoDesc').value = item.description || '';
        openModal('modalEditPhoto');
      });
    });

    grid.querySelectorAll('[data-delete-photo]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = items.find((x) => x.id === btn.dataset.deletePhoto);
        if (!item) return;

        // Se for atalho virtual, confirmação específica
        const confirmMsg = item.isShortcut
          ? `Remover atalho virtual de "${item.title}"? O arquivo físico original será preservado.`
          : `Remover "${item.title}" do portfólio?`;
        if (!confirm(confirmMsg)) return;

        try {
          if (item.isShortcut) {
            await apiJson('/api/portfolio/shortcuts', {
              method: 'DELETE',
              body: JSON.stringify({ shortcutId: item.id }),
            });
            state.catalog.items = items.filter((x) => x.id !== item.id);
            renderAlbumPills();
            renderPortfolioGrid();
            showToast('Atalho virtual removido.');
            return;
          }

          if (String(item.id).startsWith('mock_')) {
            state.catalog.items = items.filter((x) => x.id !== item.id);
            markStudioDirty();
            renderAlbumPills();
            renderPortfolioGrid();
            showToast('Foto removida da visualização.');
          } else {
            await apiJson(`/api/portfolio/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            state.catalog.items = items.filter((x) => x.id !== item.id);
            if (state.studioSnapshot) {
              state.studioSnapshot.items = (state.studioSnapshot.items || []).filter((x) => x.id !== item.id);
            }
            renderAlbumPills();
            renderPortfolioGrid();
            showToast('Fotografia excluída do disco.');
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    // 7. Reordenar Pastas (↑ / ↓), Criar Subpasta e Renomear Pasta Física no HD
    grid.querySelectorAll('[data-move-album]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alb = btn.dataset.moveAlbum;
        const dir = Number(btn.dataset.albumDir);
        const albums = state.catalog.albums || [];
        const idx = albums.indexOf(alb);
        const swapIdx = idx + dir;
        if (idx === -1 || swapIdx < 0 || swapIdx >= albums.length) return;
        const tmp = albums[idx];
        albums[idx] = albums[swapIdx];
        albums[swapIdx] = tmp;
        markStudioDirty();
        renderAlbumPills();
        renderPortfolioGrid();
      });
    });

    grid.querySelectorAll('[data-create-subalbum]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptCreateFolderOrSubfolder(btn.dataset.createSubalbum);
      });
    });

    grid.querySelectorAll('[data-rename-album]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptRenameCurrentFolder(btn.dataset.renameAlbum, '');
      });
    });

    // 8. HTML5 Drag & Drop de Cards (Reordenar dentro do álbum ou mover entre pastas)
    grid.querySelectorAll('.photo-card[draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        state.draggedItemId = card.dataset.photoId;
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.dataset.photoId);
        }
      });

      card.addEventListener('dragend', () => {
        state.draggedItemId = null;
        card.classList.remove('dragging');
        grid.querySelectorAll('.drag-over-card, .drag-over-album').forEach((el) => {
          el.classList.remove('drag-over-card', 'drag-over-album');
        });
      });

      card.addEventListener('dragover', (e) => {
        if (!state.draggedItemId || state.draggedItemId === card.dataset.photoId) return;
        e.preventDefault();
        card.classList.add('drag-over-card');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-card');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over-card');
        const draggedId = state.draggedItemId || e.dataTransfer?.getData('text/plain');
        if (!draggedId || draggedId === card.dataset.photoId) return;
        const targetAlbum = card.dataset.photoAlbum || 'Destaques';
        movePhotoWithinOrAcrossAlbums(draggedId, targetAlbum, card.dataset.photoId);
      });
    });

    // Drop sobre cabeçalho de pasta ou dropzone de pasta vazia (Diretriz 2)
    grid.querySelectorAll('[data-drop-album]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        if (!state.draggedItemId) return;
        e.preventDefault();
        zone.classList.add('drag-over-album');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over-album');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over-album');
        const draggedId = state.draggedItemId || e.dataTransfer?.getData('text/plain');
        const targetAlbum = zone.dataset.dropAlbum;
        if (!draggedId || !targetAlbum) return;
        movePhotoWithinOrAcrossAlbums(draggedId, targetAlbum, null);
        showToast(`Foto movida para a pasta "${targetAlbum}".`);
      });
    });
  }

  // ==========================================================================
  // CINEMA LIGHTBOX 60FPS: PRELOAD INTELIGENTE, SWAP PROGRESSIVO E ZOOM ATÉ 25X
  // ==========================================================================
  let currentHiResImage = null;
  let activePreloadImages = [];
  let hiResDebounceTimer = null;

  function cancelActivePreloads() {
    for (const p of activePreloadImages) {
      p.onload = null;
      p.onerror = null;
      p.src = '';
    }
    activePreloadImages = [];
  }

  function scheduleNeighborPreload(currentIndex) {
    cancelActivePreloads();
    const items = state.filteredPortfolio;
    if (!items || items.length <= 1) return;

    const nextIdx = (currentIndex + 1) % items.length;
    const prevIdx = (currentIndex - 1 + items.length) % items.length;

    const p1 = new Image();
    p1.src = items[nextIdx].originalUrl;
    activePreloadImages.push(p1);

    if (prevIdx !== nextIdx) {
      const p2 = new Image();
      p2.src = items[prevIdx].originalUrl;
      activePreloadImages.push(p2);
    }
  }

  function openLightbox(index) {
    if (index < 0 || index >= state.filteredPortfolio.length) return;
    state.lightboxIndex = index;
    resetLightboxTransform();
    $('cinemaLightbox')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderLightboxSlide();
  }

  function closeLightbox() {
    $('cinemaLightbox')?.classList.add('hidden');
    document.body.style.overflow = '';
    state.lightboxIndex = -1;
    if (hiResDebounceTimer) {
      clearTimeout(hiResDebounceTimer);
      hiResDebounceTimer = null;
    }
    if (currentHiResImage) {
      currentHiResImage.onload = null;
      currentHiResImage.onerror = null;
      currentHiResImage.src = '';
      currentHiResImage = null;
    }
    cancelActivePreloads();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function resetLightboxTransform() {
    state.lbZoom = 1.0;
    state.lbPanX = 0;
    state.lbPanY = 0;
    applyLightboxTransform();
  }

  function applyLightboxTransform() {
    const img = $('lbImage');
    if (!img) return;
    img.style.transformOrigin = 'center center';
    img.style.transform = `translate3d(${state.lbPanX}px, ${state.lbPanY}px, 0) scale(${state.lbZoom})`;
    if ($('lbZoomLabel')) {
      $('lbZoomLabel').textContent = `${state.lbZoom.toFixed(1)}×`;
    }
    const stage = $('lbStage');
    if (stage) {
      stage.classList.toggle('is-zoomed', state.lbZoom > 1.0);
    }
  }

  // Matemática exata do zoom focado no ponto invariante do cursor (0.5× até 25.0×)
  function adjustLightboxZoomAtPoint(targetZoom, clientX, clientY) {
    const oldZoom = state.lbZoom;
    const newZoom = Math.min(25.0, Math.max(0.5, Number(targetZoom.toFixed(2))));
    if (newZoom === oldZoom) return;

    const stage = $('lbStage');
    const rect = stage
      ? stage.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const rectCenterX = rect.left + rect.width / 2;
    const rectCenterY = rect.top + rect.height / 2;

    const x = clientX !== undefined ? clientX : rectCenterX;
    const y = clientY !== undefined ? clientY : rectCenterY;

    const dx = x - rectCenterX;
    const dy = y - rectCenterY;

    if (newZoom <= 1.0) {
      state.lbZoom = newZoom;
      state.lbPanX = 0;
      state.lbPanY = 0;
    } else {
      state.lbPanX = dx - (dx - state.lbPanX) * (newZoom / oldZoom);
      state.lbPanY = dy - (dy - state.lbPanY) * (newZoom / oldZoom);
      state.lbZoom = newZoom;
    }

    applyLightboxTransform();
  }

  function renderLightboxFavButton() {
    const btn = $('lbBtnFavorite');
    if (!btn) return;
    const item = state.filteredPortfolio[state.lightboxIndex];
    // Ocultar para visitantes não-admin
    if (!state.isAdmin || state.isVisitorViewOverride || !item) {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    const isFav = Boolean(item.isFavorite);
    const icon = $('lbFavIcon');
    const label = $('lbFavLabel');
    if (icon) icon.textContent = isFav ? '⭐' : '☆';
    if (label) label.textContent = isFav ? 'Favoritado' : 'Favorito';
    btn.className = isFav
      ? 'px-2.5 py-1.5 rounded-xl bg-[#FFB703] border border-[#FFB703] text-[#0B1320] text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow'
      : 'px-2.5 py-1.5 rounded-xl bg-[#240046]/90 hover:bg-[#5A189A] border border-[#5A189A] text-[#E0FBFC] hover:text-[#FFB703] text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1';
  }

  function renderLightboxFeatureButton() {
    const btn = $('lbBtnFeature');
    if (!btn) return;
    const item = state.filteredPortfolio[state.lightboxIndex];
    if (!state.isAdmin || !item) {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    const isFeat = Boolean(item.featured);
    if ($('lbFeatureIcon')) $('lbFeatureIcon').textContent = isFeat ? '⭐' : '☆';
    if ($('lbFeatureLabel')) $('lbFeatureLabel').textContent = isFeat ? 'Destaque' : 'Destacar';
    btn.className = isFeat
      ? 'px-2.5 py-1.5 rounded-xl bg-[#FFB703] border border-[#FFB703] text-[#0B1320] text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow'
      : 'px-2.5 py-1.5 rounded-xl bg-[#240046]/90 hover:bg-[#5A189A] border border-[#5A189A] text-[#E0FBFC] hover:text-[#FFB703] text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1';
  }

  function renderLightboxSlide() {
    const item = state.filteredPortfolio[state.lightboxIndex];
    if (!item) return;

    // Cancela requisições e debounces anteriores em andamento
    if (hiResDebounceTimer) {
      clearTimeout(hiResDebounceTimer);
      hiResDebounceTimer = null;
    }
    if (currentHiResImage) {
      currentHiResImage.onload = null;
      currentHiResImage.onerror = null;
      currentHiResImage.src = '';
      currentHiResImage = null;
    }
    cancelActivePreloads();

    // Atualiza HUD de metadados
    // Garante que originalUrl e thumbUrl de atalhos virtuais apontem sempre para o arquivo real
    let effectiveOriginalUrl = item.originalUrl;
    let effectiveThumbUrl = item.thumbUrl;

    if (item.isShortcut && item.targetRelativePath) {
      const encodedTargetRel = item.targetRelativePath.split('/').map(encodeURIComponent).join('/');
      effectiveOriginalUrl = `/portfolio-media/content/${encodedTargetRel}`;
      effectiveThumbUrl = `/portfolio-media/thumb/${encodedTargetRel}`;
    }

    $('lbAlbum').textContent = item.album;
    $('lbTitle').textContent = item.title;
    if ($('lbCounter')) {
      $('lbCounter').textContent = `${state.lightboxIndex + 1} / ${state.filteredPortfolio.length}`;
    }
    $('lbDescription').textContent = item.description || '';
    $('lbDescription')?.classList.toggle('hidden', !item.description);
    $('lbBtnOriginal').href = effectiveOriginalUrl;
    renderLightboxFeatureButton();
    renderLightboxFavButton();

    // 1. Exibe miniatura instantânea AVIF na tela
    const lbImg = $('lbImage');
    const thumbAvif = effectiveThumbUrl && !effectiveThumbUrl.includes('fmt=')
      ? effectiveThumbUrl + (effectiveThumbUrl.includes('?') ? '&' : '?') + 'fmt=avif'
      : effectiveThumbUrl;
    lbImg.src = thumbAvif;
    lbImg.alt = item.title;

    // 2. Exibe indicador discreto de carregamento da foto de alta resolução
    const badge = $('lbHiResIndicator');
    if (badge) badge.classList.remove('hidden');

    // 3. Carrega o original de alta resolução com debounce de 120ms (evita múltiplos fetches em navegação rápida)
    const targetId = item.id;
    state.activeHiResLoadId = targetId;

    hiResDebounceTimer = setTimeout(() => {
      const hiRes = new Image();
      currentHiResImage = hiRes;

      hiRes.onload = () => {
        const current = state.filteredPortfolio[state.lightboxIndex];
        // Garante que o usuário ainda está na mesma foto
        if (current && current.id === targetId && state.activeHiResLoadId === targetId) {
          lbImg.src = effectiveOriginalUrl;
          if (badge) badge.classList.add('hidden');
          // Só inicia preload das fotos vizinhas APÓS o original atual terminar de carregar
          scheduleNeighborPreload(state.lightboxIndex);
        }
      };

      hiRes.onerror = () => {
        if (badge) badge.classList.add('hidden');
      };

      hiRes.src = effectiveOriginalUrl;
    }, 120);

    const chips = [];
    if (item.width && item.height) chips.push(`${item.width}×${item.height}px`);
    if (item.sizeBytes) chips.push(formatBytes(item.sizeBytes));
    const ex = item.exif || {};
    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const itemScope = item.subalbum ? `${item.album}/${item.subalbum}` : item.album;
    const fMeta = fMetaMap[itemScope] || fMetaMap[item.subalbum] || fMetaMap[item.album] || {};

    const cameraModel = ex.model || ex.camera || (ex.make ? `${ex.make} ${ex.model || ''}`.trim() : null) || fMeta.model;
    const isPhone = fMeta.deviceType === 'phone' || (ex.make && /apple|samsung|google|xiaomi|motorola/i.test(ex.make));
    const devIcon = isPhone ? '📱' : '📷';
    const devLabel = isPhone ? 'Celular' : 'Câmera';
    if (cameraModel) {
      chips.push(`${devIcon} ${cameraModel}`);
    } else {
      chips.push(`${devIcon} Registrado em ${devLabel}`);
    }
    if (ex.lens) chips.push(ex.lens);
    if (ex.focal || ex.focalLength) chips.push(ex.focal || ex.focalLength);
    const aperture = ex.aperture || fMeta.aperture;
    if (aperture) chips.push(aperture);
    const shutter = ex.shutter || fMeta.shutter;
    if (shutter) chips.push(shutter);
    const iso = ex.iso || fMeta.iso;
    if (iso) chips.push(iso);

    $('lbExifChips').innerHTML = chips
      .map((c) => `<span class="exif-chip">${escapeHtml(c)}</span>`)
      .join('');
  }

  function stepLightbox(delta) {
    const len = state.filteredPortfolio.length;
    if (!len) return;
    state.lightboxIndex = (state.lightboxIndex + delta + len) % len;
    resetLightboxTransform();
    renderLightboxSlide();
  }

  // ==========================================================================
  // AMBIENTE 2: COFRE PESSOAL (VS CODE EXPLORER NA RAIZ DO HD STORAGE_DIR & MULTI-DRIVE)
  // ==========================================================================
  function getFileMaterialIcon(kind) {
    switch (kind) {
      case 'image': return 'image';
      case 'video': return 'movie';
      case 'audio': return 'music_note';
      case 'pdf': return 'picture_as_pdf';
      case 'text': return 'description';
      case 'code': return 'code';
      default: return 'draft';
    }
  }

  async function loadVaultDrives() {
    try {
      const res = await apiJson('/api/vault/drives');
      state.vaultDrives = res.drives || [];
      renderVaultDriveBar();
    } catch {}
  }

  function renderVaultDriveBar() {
    const bar = $('vaultDriveBar');
    if (!bar) return;
    const drives = state.vaultDrives || [];
    if (drives.length <= 1) {
      bar.innerHTML = '';
      return;
    }
    bar.innerHTML = drives
      .map((d) => {
        const isActive = (state.vaultActiveDrive || 'primary') === d.id;
        const freeGb = d.freeBytes ? `${(d.freeBytes / 1e9).toFixed(1)} GB livres` : 'Online';
        return `
          <button type="button" class="drive-chip ${isActive ? 'active' : ''}" data-drive-id="${escapeHtml(d.id)}">
            <span>💾</span>
            <span>${escapeHtml(d.name)}</span>
            <span class="text-[10px] opacity-75">(${freeGb})</span>
          </button>
        `;
      })
      .join('');

    bar.querySelectorAll('[data-drive-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.vaultActiveDrive = btn.dataset.driveId;
        state.vaultFolder = '';
        renderVaultDriveBar();
        loadVaultTree('');
      });
    });
  }

  async function loadVaultTree(folder = null) {
    if (folder !== null) state.vaultFolder = folder;
    try {
      const driveParam = state.vaultActiveDrive ? `&drive=${encodeURIComponent(state.vaultActiveDrive)}` : '';
      const modeParam = `&mode=${encodeURIComponent(state.vaultMode || 'vault')}`;
      const [treeRes, listRes] = await Promise.all([
        apiJson(`/api/vault/tree?${driveParam.replace(/^&/, '')}${modeParam}`).catch(() => ({ tree: [] })),
        apiJson(`/api/vault/list?folder=${encodeURIComponent(state.vaultFolder || '')}${driveParam}${modeParam}`).catch(() => ({ folders: [], files: [], breadcrumbs: [] })),
      ]);

      state.vaultTreeData = treeRes;
      state.vaultData = listRes;
      state.vaultFolder = listRes.currentFolder || '';
      if (!state.vaultFilesByFolder) state.vaultFilesByFolder = {};
      state.vaultFilesByFolder[state.vaultFolder] = listRes.files || [];

      if (listRes.isLocked) {
        showToast('Pasta protegida por PIN. Desbloqueie para visualizar.', true);
        openFolderPinModal(state.vaultFolder, true);
      }

      renderVaultBreadcrumbs();
      renderVaultTree();

      // Mantém seleção se o arquivo ainda existir na pasta; caso contrário mostra o conteúdo da pasta no painel direito
      if (state.vaultSelectedFile) {
        const allKnownFiles = [
          ...(listRes.files || []),
          ...Object.values(state.vaultFilesByFolder).flat(),
        ];
        const stillExists = allKnownFiles.find((f) => f.path === state.vaultSelectedFile.path);
        if (stillExists) {
          selectVaultFile(stillExists);
        } else {
          state.vaultSelectedFile = null;
          renderVaultFolderRightPane();
        }
      } else {
        renderVaultFolderRightPane();
      }
    } catch (err) {
      showToast(`Erro ao carregar arquivos do HD: ${err.message}`, true);
    }
  }

  function renderVaultBreadcrumbs() {
    const el = $('vaultBreadcrumbs');
    if (!el) return;
    const rootName = (state.vaultTreeData && state.vaultTreeData.rootName) || 'HD Externo';
    const crumbs = [
      { name: rootName, path: '' },
      ...(state.vaultData?.breadcrumbs?.slice(1) || []),
    ];

    el.innerHTML = crumbs
      .map(
        (c, idx) => `
        ${idx > 0 ? '<span class="text-[#FFB703]/50">/</span>' : ''}
        <button
          type="button"
          class="px-2 py-0.5 rounded-md hover:bg-[#5A189A]/50 text-[#E0FBFC] hover:text-[#FFB703] transition-colors truncate max-w-[160px]"
          data-vault-crumb="${escapeHtml(c.path)}"
        >${escapeHtml(c.name)}</button>
      `
      )
      .join('');

    el.querySelectorAll('[data-vault-crumb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetPath = btn.dataset.vaultCrumb;
        state.vaultSelectedFile = null;
        state.vaultExpandedPaths.add(targetPath);
        loadVaultTree(targetPath);
      });
    });
  }

  function renderVaultTreeNode(node, depth = 0) {
    const isExpanded = state.vaultExpandedPaths.has(node.path);
    const isCurrent = state.vaultFolder === node.path;
    const paddingLeft = depth * 16 + 6;

    // Lê metadados da pasta (cor, ícone, favorito, pin, portfolio)
    const scopeKey = normalizeFolderScopeKey(node.path);
    const fMeta = state.catalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
    const isLocked = Boolean(node.isLocked || fMeta.isLocked);
    const isUnlocked = Boolean(node.isUnlocked);
    const inPortfolio = Boolean(node.inPortfolio !== false && fMeta.inPortfolio !== false);

    let iconKey = fMeta.icon || (isExpanded ? 'folder_open' : 'folder');
    if (isLocked && !isUnlocked) iconKey = 'lock';

    const folderColor = fMeta.color || '#FFB703';
    const isFolderFav = Boolean(fMeta.isFavorite);
    const iconSvg = renderFolderIconSvg(iconKey, folderColor, 16);

    let html = `
      <div
        class="vscode-tree-item ${isCurrent ? 'active' : ''}"
        style="padding-left: ${paddingLeft}px;"
        data-tree-folder="${escapeHtml(node.path)}"
      >
        ${depth > 0 ? `<div class="vscode-tree-guide" style="left: ${paddingLeft - 8}px;"></div>` : ''}
        <span class="vscode-chevron ${isExpanded ? 'open' : ''}">▶</span>
        <span class="inline-flex items-center justify-center ml-1 mr-1.5 shrink-0" style="color:${escapeHtml(folderColor)}">${iconSvg}</span>
        <span class="truncate" style="${fMeta.color ? `color:${escapeHtml(fMeta.color)};font-weight:600;` : ''}">${escapeHtml(node.name)}</span>
        ${isLocked ? `<span class="text-[10px] shrink-0 ml-1" title="${isUnlocked ? 'Pasta desbloqueada por PIN' : 'Pasta bloqueada por PIN'}">${isUnlocked ? '🔓' : '🔒'}</span>` : ''}
        ${inPortfolio ? '<span class="text-[9px] shrink-0 ml-1 text-[#FFB703]" title="Exibida no Portfólio">🖼️</span>' : ''}
        ${isFolderFav ? '<span class="text-[10px] shrink-0 ml-1" title="Pasta Favorita">⭐</span>' : ''}
      </div>
    `;

    if (isExpanded) {
      if (Array.isArray(node.children) && node.children.length > 0) {
        for (const child of node.children) {
          html += renderVaultTreeNode(child, depth + 1);
        }
      }
      const folderFiles = state.vaultFilesByFolder?.[node.path];
      if (Array.isArray(folderFiles) && folderFiles.length > 0) {
        const q = ($('vaultSearchInput')?.value || '').trim().toLowerCase();
        const files = folderFiles.filter((f) => !q || f.name.toLowerCase().includes(q));
        for (const file of files) {
          const filePad = (depth + 1) * 16 + 6;
          const isFileActive = state.vaultSelectedFile && state.vaultSelectedFile.path === file.path;
          const fileIcon = getFileMaterialIcon(file.kind);
          html += `
            <div
              class="vscode-tree-item ${isFileActive ? 'active' : ''}"
              style="padding-left: ${filePad}px;"
              data-tree-file="${escapeHtml(file.path)}"
            >
              <div class="vscode-tree-guide" style="left: ${filePad - 8}px;"></div>
              <span class="w-3.5 inline-block"></span>
              <span class="material-symbols-outlined text-[15px] text-[#FFB703]/80 ml-1 mr-1.5">${fileIcon}</span>
              <span class="truncate">${escapeHtml(file.name)}</span>
            </div>
          `;
        }
      }
    }
    return html;
  }

  function renderVaultTree() {
    const container = $('vaultTreeContent');
    if (!container) return;

    const tree = state.vaultTreeData?.tree || [];
    const rootName = state.vaultTreeData?.rootName || 'stangorlini';
    const isUserRoot = rootName.toLowerCase() === 'stangorlini';
    const rootIcon = isUserRoot ? 'account_circle' : 'dns';
    const rootLabel = isUserRoot ? 'stangorlini' : `${rootName} (Raiz)`;

    let treeHtml = `
      <div
        class="vscode-tree-item ${state.vaultFolder === '' ? 'active' : ''} font-semibold"
        style="padding-left: 6px;"
        data-tree-folder=""
      >
        <span class="vscode-chevron ${state.vaultExpandedPaths.has('') ? 'open' : ''}">▶</span>
        <span class="material-symbols-outlined text-[16px] text-[#FFB703] ml-1 mr-1.5">${rootIcon}</span>
        <span class="truncate">${escapeHtml(rootLabel)}</span>
      </div>
    `;

    if (state.vaultExpandedPaths.has('')) {
      for (const node of tree) {
        treeHtml += renderVaultTreeNode(node, 1);
      }
      const rootFiles = state.vaultFilesByFolder?.[''];
      if (Array.isArray(rootFiles) && rootFiles.length > 0) {
        const q = ($('vaultSearchInput')?.value || '').trim().toLowerCase();
        const files = rootFiles.filter((f) => !q || f.name.toLowerCase().includes(q));
        for (const file of files) {
          const isFileActive = state.vaultSelectedFile && state.vaultSelectedFile.path === file.path;
          const fileIcon = getFileMaterialIcon(file.kind);
          treeHtml += `
            <div
              class="vscode-tree-item ${isFileActive ? 'active' : ''}"
              style="padding-left: 22px;"
              data-tree-file="${escapeHtml(file.path)}"
            >
              <div class="vscode-tree-guide" style="left: 14px;"></div>
              <span class="w-3.5 inline-block"></span>
              <span class="material-symbols-outlined text-[15px] text-[#FFB703]/80 ml-1 mr-1.5">${fileIcon}</span>
              <span class="truncate">${escapeHtml(file.name)}</span>
            </div>
          `;
        }
      }
    }

    container.innerHTML = treeHtml;

    container.querySelectorAll('[data-tree-folder]').forEach((el) => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const fPath = el.dataset.treeFolder;
        const fName = fPath.split('/').pop() || fPath;
        openVaultContextMenu(e.clientX, e.clientY, {
          type: 'folder',
          path: fPath,
          name: fName,
        });
      });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const fPath = el.dataset.treeFolder;
        const clickedChevron = Boolean(e.target.closest('.vscode-chevron'));
        const isAlreadyCurrent = state.vaultFolder === fPath;
        const isCurrentlyExpanded = state.vaultExpandedPaths.has(fPath);

        if (isCurrentlyExpanded && (clickedChevron || isAlreadyCurrent)) {
          state.vaultExpandedPaths.delete(fPath);
          if (!isAlreadyCurrent) {
            renderVaultTree();
            return;
          }
          state.vaultSelectedFile = null;
          renderVaultTree();
          renderVaultFolderRightPane();
          return;
        }

        if (fPath === '__trash__') {
          if (typeof loadVaultTrash === 'function') loadVaultTrash();
          return;
        }

        if (fPath === 'vault') {
          checkVaultPinAndOpen('vault');
          return;
        }

        state.vaultExpandedPaths.add(fPath);
        state.vaultSelectedFile = null;
        loadVaultTree(fPath);
      });
    });

    container.querySelectorAll('[data-tree-file]').forEach((el) => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const fPath = el.dataset.treeFile;
        const allKnownFiles = [
          ...(state.vaultData?.files || []),
          ...Object.values(state.vaultFilesByFolder || {}).flat(),
        ];
        const file = allKnownFiles.find((f) => f.path === fPath);
        if (file) {
          openVaultContextMenu(e.clientX, e.clientY, {
            type: 'file',
            path: file.path,
            name: file.name,
            isFavorite: file.isFavorite,
            tags: file.tags,
            isShortcut: file.isShortcut,
            targetId: file.targetId,
          });
        }
      });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const fPath = el.dataset.treeFile;
        const allKnownFiles = [
          ...(state.vaultData?.files || []),
          ...Object.values(state.vaultFilesByFolder || {}).flat(),
        ];
        const file = allKnownFiles.find((f) => f.path === fPath);
        if (file) selectVaultFile(file);
      });
    });
  }

  function renderVaultFolderRightPane() {
    const deskPlaceholder = $('vaultDetailPlaceholder');
    const deskContent = $('vaultDetailContent');
    if (!deskPlaceholder || !deskContent) return;

    // Sincroniza tags ativas na barra horizontal do cofre
    renderVaultActiveTags();

    const rawFolders = state.vaultData?.folders || [];
    const rawFiles = state.vaultData?.files || [];
    const q = (state.vaultSearchQuery || $('vaultAdvSearchInput')?.value || $('vaultSearchInput')?.value || '').trim().toLowerCase();

    // Filtro de pastas
    const folders = rawFolders.filter((f) => !q || f.name.toLowerCase().includes(q));

    // Filtro de arquivos por busca, favoritos e tags
    let files = rawFiles.filter((f) => {
      if (q) {
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesExt = f.name.toLowerCase().endsWith(q.startsWith('.') ? q : `.${q}`);
        const matchesTags = Array.isArray(f.tags) && f.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesExt && !matchesTags) return false;
      }
      if (state.vaultFavoritesOnly && !f.isFavorite) return false;
      if (state.vaultSelectedTags && state.vaultSelectedTags.size > 0) {
        const itemTags = (f.tags || []).map((t) => t.toLowerCase());
        const hasAllTags = Array.from(state.vaultSelectedTags).every((tag) => itemTags.includes(tag.toLowerCase()));
        if (!hasAllTags) return false;
      }
      return true;
    });

    // Ordenação dos arquivos no Cofre
    const sortMode = state.vaultSearchSort || 'date_desc';
    files.sort((a, b) => {
      if (sortMode === 'name_asc') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      if (sortMode === 'name_desc') return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
      if (sortMode === 'size_desc') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      if (sortMode === 'date_asc') return new Date(a.modifiedAt || 0) - new Date(b.modifiedAt || 0);
      // Padrão: date_desc
      return new Date(b.modifiedAt || 0) - new Date(a.modifiedAt || 0);
    });

    // Atualiza botões de ação rápida em lote no Vault
    const hasSelected = Boolean(state.vaultSelectedFiles && state.vaultSelectedFiles.size > 0);
    if ($('btnVaultQuickFav')) $('btnVaultQuickFav').disabled = !hasSelected;
    if ($('btnVaultQuickTags')) $('btnVaultQuickTags').disabled = !hasSelected;
    if ($('btnVaultQuickShortcut')) $('btnVaultQuickShortcut').disabled = !hasSelected;
    const currentScopeKey = normalizeFolderScopeKey(state.vaultFolder);
    const currentMeta = state.catalog?.settings?.layout?.folderMeta?.[currentScopeKey] || {};
    const currentFolderLabel = state.vaultFolder
      ? (state.vaultFolder.split('/').pop() || state.vaultFolder)
      : (state.vaultMode === 'portfolio' ? 'Pastas do Portfólio' : 'Meu Cofre (stangorlini)');
    const currentIconKey = state.vaultFolder ? (currentMeta.icon || 'folder_open') : (state.vaultMode === 'portfolio' ? 'photo_camera' : 'folder');
    const currentColor = currentMeta.color || '#FFB703';
    const currentIconSvg = renderFolderIconSvg(currentIconKey, currentColor, 26);
    const isCurrentInPort = Boolean(currentMeta.inPortfolio === true || state.vaultMode === 'portfolio');

    deskPlaceholder.classList.add('hidden');
    deskContent.classList.remove('hidden');

    const foldersHtml = folders.length > 0
      ? `
        <div class="space-y-2">
          <div class="text-[11px] font-mono uppercase tracking-wider text-[#FFB703] font-bold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[15px]">folder</span>
            <span>Subpastas (${folders.length})</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${folders
              .map(
                (sub) => {
                  const scopeKey = normalizeFolderScopeKey(sub.path);
                  const subMeta = state.catalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
                  const isLocked = Boolean(sub.isLocked || subMeta.isLocked);
                  const isUnlocked = Boolean(sub.isUnlocked);
                  const inPort = Boolean(sub.inPortfolio === true || subMeta.inPortfolio === true || state.vaultMode === 'portfolio');
                  let iconKey = subMeta.icon || 'folder';
                  if (isLocked && !isUnlocked) iconKey = 'lock';

                  const subColor = escapeHtml(subMeta.color || '#FFB703');
                  const subFav = Boolean(subMeta.isFavorite);
                  const iconSvg = renderFolderIconSvg(iconKey, subColor, 28);

                  return `
                  <button
                    type="button"
                    data-right-pane-folder="${escapeHtml(sub.path)}"
                    class="p-3 rounded-xl bg-[#0B1320]/95 hover:bg-[#5A189A]/50 border text-left flex items-center gap-3 transition-all cursor-pointer group shadow-sm"
                    style="border-color: ${subMeta.color ? subColor : 'rgba(90,24,154,0.7)'};"
                  >
                    <div class="group-hover:scale-110 transition-transform shrink-0">
                      ${iconSvg}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold truncate flex items-center gap-1" style="${subMeta.color ? `color:${subColor};` : 'color:#E0FBFC;'}">
                        <span>${escapeHtml(sub.name)}</span>
                        ${isLocked ? `<span class="text-[10px]" title="${isUnlocked ? 'Pasta desbloqueada por PIN' : 'Pasta protegida por PIN'}">${isUnlocked ? '🔓' : '🔒'}</span>` : ''}
                        ${inPort ? '<span class="text-[10px] text-[#FFB703]" title="Exibida no Portfólio">🖼️</span>' : ''}
                        ${subFav ? '<span class="text-[10px]" title="Pasta Favorita">⭐</span>' : ''}
                      </div>
                      <div class="text-[10px] font-mono text-[#E0FBFC]/55 truncate">${escapeHtml(sub.path)}</div>
                    </div>
                  </button>
                `;
                }
              )
              .join('')}
          </div>
        </div>
      `
      : '';

    const filesHtml = files.length > 0
      ? `
        <div class="space-y-2 pt-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-[11px] font-mono uppercase tracking-wider text-[#FFB703] font-bold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px]">photo_library</span>
              <span>Arquivos e Fotografias (${files.length})</span>
            </div>
            ${
              state.vaultSelectedFiles && state.vaultSelectedFiles.size > 0
                ? `
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono font-bold text-[#FFB703]">${state.vaultSelectedFiles.size} selecionado(s)</span>
                    <button type="button" id="btnVaultBatchMove" class="px-2.5 py-1 rounded-lg bg-[#FFB703] text-[#0B1320] font-bold text-xs flex items-center gap-1 hover:bg-[#e0a200] transition cursor-pointer">
                      <span class="material-symbols-outlined text-[14px]">drive_file_move</span>
                      <span>Mover</span>
                    </button>
                    <button type="button" id="btnVaultBatchDelete" class="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-300 font-bold text-xs flex items-center gap-1 hover:bg-rose-900 transition cursor-pointer">
                      <span class="material-symbols-outlined text-[14px]">delete</span>
                      <span>Excluir</span>
                    </button>
                    <button type="button" id="btnVaultBatchClear" class="px-2 py-1 rounded-lg bg-[#0B1320] text-[#E0FBFC]/80 text-xs hover:text-[#FFB703] transition cursor-pointer" title="Limpar Seleção">✕</button>
                  </div>
                `
                : `
                  <span class="text-[10px] font-mono text-[#E0FBFC]/50 hidden sm:inline">Dica: use Shift ou Ctrl para selecionar vários arquivos</span>
                `
            }
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[520px] overflow-y-auto pr-1" id="vaultFilesGridContainer">
            ${files
              .map((f) => {
                const isImg = f.kind === 'image';
                const thumb = isImg ? (f.thumbUrl || f.streamUrl) : '';
                const isSelected = state.vaultSelectedFiles && state.vaultSelectedFiles.has(f.path);
                return `
                  <div
                    data-right-pane-file="${escapeHtml(f.path)}"
                    class="relative rounded-xl bg-[#0B1320]/90 hover:bg-[#5A189A]/40 border ${
                      isSelected ? 'border-[#FFB703] ring-2 ring-[#FFB703] bg-[#5A189A]/30' : 'border-[#5A189A]/60'
                    } hover:border-[#FFB703] p-2 flex flex-col gap-1.5 transition-all cursor-pointer group shadow-sm select-none"
                  >
                    <div class="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded flex items-center justify-center text-xs ${
                      isSelected
                        ? 'bg-[#FFB703] text-[#0B1320] font-bold shadow'
                        : 'bg-[#0B1320]/80 text-transparent border border-[#5A189A]/60 group-hover:text-[#E0FBFC]/40'
                    }">
                      ✓
                    </div>
                    <div class="w-full h-28 rounded-lg bg-[#150826] flex items-center justify-center overflow-hidden border border-[#5A189A]/30">
                      ${
                        isImg
                          ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(f.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />`
                          : `<span class="material-symbols-outlined text-3xl text-[#FFB703]">${getFileMaterialIcon(f.kind)}</span>`
                      }
                    </div>
                    <div class="flex items-center justify-between gap-1">
                      <div class="text-[11px] font-semibold text-[#E0FBFC] truncate" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                      ${f.isFavorite ? '<span class="text-xs text-[#FFB703] shrink-0" title="Item Favorito">⭐</span>' : ''}
                    </div>
                    ${
                      f.isShortcut
                        ? '<div class="text-[9px] font-mono font-bold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/30 self-start">🔗 Atalho Virtual</div>'
                        : ''
                    }
                    ${
                      Array.isArray(f.tags) && f.tags.length > 0
                        ? `<div class="flex flex-wrap gap-1 max-h-8 overflow-hidden">${f.tags.slice(0, 2).map((t) => `<span class="tag-pill text-[9px] py-0 px-1">${escapeHtml(t)}</span>`).join('')}${f.tags.length > 2 ? `<span class="text-[9px] text-[#E0FBFC]/50">+${f.tags.length - 2}</span>` : ''}</div>`
                        : ''
                    }
                    <div class="text-[10px] font-mono text-[#E0FBFC]/55 flex items-center justify-between mt-auto">
                      <span>${formatBytes(f.sizeBytes)}</span>
                      <span class="uppercase text-[#FFB703]">${escapeHtml(f.kind)}</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `
      : '';

    const emptyHtml = folders.length === 0 && files.length === 0
      ? `
        <div class="py-12 text-center space-y-2">
          <span class="material-symbols-outlined text-4xl text-[#FFB703]/60">folder_open</span>
          <p class="text-sm font-medium text-[#E0FBFC]/80">Esta pasta está vazia no momento.</p>
          <p class="text-xs font-mono text-[#E0FBFC]/50">Use os botões "+ Pasta" ou "↑ Upload" acima para adicionar arquivos.</p>
        </div>
      `
      : '';

    deskContent.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#5A189A]/50">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="shrink-0">
              ${currentIconSvg}
            </div>
            <div class="min-w-0">
              <h4 class="font-syne text-sm sm:text-base font-bold truncate flex items-center gap-1.5" style="color:${escapeHtml(currentColor)};">
                <span>${escapeHtml(currentFolderLabel)}</span>
                ${isCurrentInPort ? '<span class="text-[10px] text-[#FFB703] border border-[#FFB703]/50 px-1.5 py-0.5 rounded-full" title="Esta pasta está ativa no Portfólio público">🖼️ Portfólio</span>' : ''}
                ${currentMeta.isFavorite ? '<span class="text-xs" title="Pasta Favorita">⭐</span>' : ''}
              </h4>
              <p class="text-[11px] font-mono text-[#E0FBFC]/60">${folders.length} subpasta(s) • ${files.length} arquivo(s)</p>
            </div>
          </div>
          ${
            state.vaultFolder
              ? `
                <button
                  type="button"
                  id="btnVaultUpFolder"
                  class="px-3 py-1.5 rounded-xl bg-[#0B1320] hover:bg-[#5A189A] border border-[#5A189A] text-xs font-mono text-[#E0FBFC] hover:text-[#FFB703] flex items-center gap-1 cursor-pointer transition-all"
                >
                  <span class="material-symbols-outlined text-[15px]">arrow_upward</span>
                  <span>Subir Nível</span>
                </button>
              `
              : ''
          }
        </div>
        ${foldersHtml}
        ${filesHtml}
        ${emptyHtml}
      </div>
    `;

    deskContent.querySelector('#btnVaultUpFolder')?.addEventListener('click', () => {
      const parts = (state.vaultFolder || '').split('/').filter(Boolean);
      parts.pop();
      const parentPath = parts.join('/');
      state.vaultSelectedFile = null;
      state.vaultExpandedPaths.add(parentPath);
      loadVaultTree(parentPath);
    });

    deskContent.querySelectorAll('[data-right-pane-folder]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetFolder = btn.dataset.rightPaneFolder;
        if (targetFolder === '__trash__') {
          if (typeof loadVaultTrash === 'function') loadVaultTrash();
          return;
        }
        if (targetFolder === 'vault') {
          checkVaultPinAndOpen('vault');
          return;
        }
        state.vaultSelectedFile = null;
        state.vaultExpandedPaths.add(targetFolder);
        loadVaultTree(targetFolder);
      });
    });

    // Menu de contexto com botão direito nas pastas do painel direito
    deskContent.querySelectorAll('[data-right-pane-folder]').forEach((btn) => {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const fPath = btn.dataset.rightPaneFolder;
        const fName = fPath.split('/').pop() || fPath;
        openVaultContextMenu(e.clientX, e.clientY, {
          type: 'folder',
          path: fPath,
          name: fName,
        });
      });
    });

    const fileCards = Array.from(deskContent.querySelectorAll('[data-right-pane-file]'));
    fileCards.forEach((card, cIdx) => {
      // Menu de contexto com botão direito nos arquivos do painel direito
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const targetPath = card.dataset.rightPaneFile;
        const targetFile = files.find((f) => f.path === targetPath);
        if (!targetFile) return;

        if (!state.vaultSelectedFiles.has(targetPath)) {
          state.vaultSelectedFiles.clear();
          state.vaultSelectedFiles.add(targetPath);
          renderVaultFolderRightPane();
        }

        openVaultContextMenu(e.clientX, e.clientY, {
          type: 'file',
          path: targetFile.path,
          name: targetFile.name,
          isFavorite: targetFile.isFavorite,
          tags: targetFile.tags,
          isShortcut: targetFile.isShortcut,
          targetId: targetFile.targetId,
        });
      });

      card.addEventListener('click', (e) => {
        const targetPath = card.dataset.rightPaneFile;
        const targetFile = files.find((f) => f.path === targetPath);
        if (!targetFile) return;

        if (e.shiftKey && state.lastVaultClickIdx !== -1 && state.lastVaultClickIdx !== cIdx) {
          const start = Math.min(state.lastVaultClickIdx, cIdx);
          const end = Math.max(state.lastVaultClickIdx, cIdx);
          const shouldSelect = !state.vaultSelectedFiles.has(targetPath);
          for (let i = start; i <= end; i++) {
            const p = files[i]?.path;
            if (p) {
              if (shouldSelect) state.vaultSelectedFiles.add(p);
              else state.vaultSelectedFiles.delete(p);
            }
          }
        } else if (e.ctrlKey || e.metaKey) {
          if (state.vaultSelectedFiles.has(targetPath)) {
            state.vaultSelectedFiles.delete(targetPath);
          } else {
            state.vaultSelectedFiles.add(targetPath);
          }
        } else {
          // Clique simples
          state.vaultSelectedFiles.clear();
          state.vaultSelectedFiles.add(targetPath);
          selectVaultFile(targetFile);
        }

        state.lastVaultClickIdx = cIdx;
        renderVaultFolderRightPane();
      });
    });

    deskContent.querySelector('#btnVaultBatchClear')?.addEventListener('click', () => {
      state.vaultSelectedFiles.clear();
      renderVaultFolderRightPane();
    });

    deskContent.querySelector('#btnVaultBatchMove')?.addEventListener('click', async () => {
      const paths = Array.from(state.vaultSelectedFiles);
      if (!paths.length) return;
      const dest = prompt(
        `Mover ${paths.length} arquivo(s) selecionado(s) para qual pasta no HD?\n(Ex: portfolio/POLÍTICAS ou vault):`,
        state.vaultFolder || ''
      );
      if (dest === null) return;
      let moved = 0;
      for (const p of paths) {
        try {
          await apiJson('/api/vault/move', {
            method: 'POST',
            body: JSON.stringify({ srcPath: p, destFolder: dest, drive: state.vaultActiveDrive }),
          });
          moved++;
        } catch (err) {
          console.warn('Erro ao mover arquivo em lote:', p, err.message);
        }
      }
      state.vaultSelectedFiles.clear();
      showToast(`${moved} arquivo(s) movido(s) com sucesso para "${dest}"!`);
      loadVaultTree(dest);
      loadPortfolio();
    });

    deskContent.querySelector('#btnVaultBatchDelete')?.addEventListener('click', async () => {
      const paths = Array.from(state.vaultSelectedFiles);
      if (!paths.length) return;
      if (!confirm(`Excluir permanentemente ${paths.length} arquivo(s) selecionado(s) do disco rígido?`)) return;
      let deleted = 0;
      for (const p of paths) {
        try {
          await apiJson('/api/vault/entry', {
            method: 'DELETE',
            body: JSON.stringify({ path: p, drive: state.vaultActiveDrive }),
          });
          deleted++;
        } catch (err) {
          console.warn('Erro ao excluir arquivo em lote:', p, err.message);
        }
      }
      state.vaultSelectedFiles.clear();
      showToast(`${deleted} arquivo(s) excluído(s) com sucesso!`);
      loadVaultTree(state.vaultFolder);
      loadPortfolio();
    });
  }

  function selectVaultFile(file) {
    state.vaultSelectedFile = file;

    // Atualiza classes ativas na árvore
    document.querySelectorAll('[data-tree-file]').forEach((el) => {
      if (el.dataset.treeFile === file.path) el.classList.add('active');
      else el.classList.remove('active');
    });

    const isImage = file.kind === 'image';
    const isVideo = file.kind === 'video';

    let previewHtml = '';
    if (isImage) {
      previewHtml = `
        <div class="relative w-full h-[360px] bg-[#0B1320] rounded-xl flex items-center justify-center p-2 border border-[#5A189A]/50 overflow-hidden">
          <img src="${escapeHtml(file.thumbUrl || file.streamUrl)}" alt="${escapeHtml(file.name)}" class="max-h-full max-w-full object-contain rounded drop-shadow" />
        </div>
      `;
    } else if (isVideo) {
      previewHtml = `
        <div class="relative w-full bg-[#0B1320] rounded-xl flex items-center justify-center p-2 border border-[#5A189A]/50">
          <video src="${escapeHtml(file.streamUrl)}" controls class="max-h-[360px] w-full rounded"></video>
        </div>
      `;
    } else {
      previewHtml = `
        <div class="w-full h-44 bg-[#0B1320] rounded-xl flex flex-col items-center justify-center gap-2 border border-[#5A189A]/50">
          <span class="material-symbols-outlined text-5xl text-[#FFB703]">${getFileMaterialIcon(file.kind)}</span>
          <span class="text-xs font-mono uppercase text-[#E0FBFC]/70">${escapeHtml(file.kind)}</span>
        </div>
      `;
    }

    const isCuratedPrivate = file.curation?.visibility === 'private';
    const curationBadge = isCuratedPrivate
      ? `<span class="px-2 py-0.5 rounded-full badge-curated-private text-[10px] font-mono font-bold flex items-center gap-1"><span>🔒</span> Privado</span>`
      : `<span class="px-2 py-0.5 rounded-full badge-curated-public text-[10px] font-mono font-bold flex items-center gap-1"><span>🌟</span> No Acervo</span>`;

    const detailHtml = `
      ${previewHtml}
      <div class="space-y-2 pt-2">
        <div class="flex items-center justify-between">
          <h4 class="font-syne text-base font-bold text-[#E0FBFC] truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h4>
          <div class="flex items-center gap-1.5 shrink-0">
            ${curationBadge}
            <span class="px-2 py-0.5 rounded-full bg-[#5A189A] text-[10px] font-mono font-bold text-[#FFB703] uppercase">${escapeHtml(file.kind)}</span>
          </div>
        </div>
        <div class="flex items-center gap-4 text-xs font-mono text-[#E0FBFC]/70">
          <span>Tamanho: ${formatBytes(file.sizeBytes)}</span>
          <span>Modificado: ${new Date(file.modifiedAt).toLocaleDateString('pt-BR')} ${new Date(file.modifiedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="text-[11px] font-mono text-[#E0FBFC]/50 truncate">Caminho: ${escapeHtml(file.path)}</div>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-[#5A189A]/40">
        <button type="button" class="px-3 py-1.5 bg-[#FFB703] hover:bg-[#e0a200] text-[#0B1320] font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer" data-act-preview="${escapeHtml(file.path)}">
          <span class="material-symbols-outlined text-[16px]">visibility</span>
          <span>Visualizar</span>
        </button>
        <button type="button" class="px-3 py-1.5 ${isCuratedPrivate ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-[#0B1320] text-amber-300 hover:text-white border border-amber-400'} font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow" data-act-curate="${escapeHtml(file.path)}" data-cur-state="${isCuratedPrivate ? 'public' : 'private'}">
          <span>${isCuratedPrivate ? '🌟 Publicar no Acervo' : '🔒 Manter Privado'}</span>
        </button>
        <a href="${escapeHtml(file.downloadUrl)}" download class="px-3 py-1.5 bg-[#240046] hover:bg-[#5A189A] border border-[#5A189A] text-[#E0FBFC] font-semibold text-xs rounded-xl flex items-center gap-1 no-underline">
          <span class="material-symbols-outlined text-[16px]">download</span>
          <span>Baixar</span>
        </a>
        <button type="button" class="px-3 py-1.5 bg-[#240046] hover:bg-[#5A189A] border border-[#5A189A] text-[#E0FBFC] text-xs rounded-xl flex items-center gap-1 cursor-pointer" data-act-rename="${escapeHtml(file.path)}" data-cur-name="${escapeHtml(file.name)}">
          <span class="material-symbols-outlined text-[16px]">edit</span>
          <span>Renomear</span>
        </button>
        <button type="button" class="px-3 py-1.5 bg-[#240046] hover:bg-[#5A189A] border border-[#5A189A] text-[#E0FBFC] text-xs rounded-xl flex items-center gap-1 cursor-pointer" data-act-move="${escapeHtml(file.path)}">
          <span class="material-symbols-outlined text-[16px]">drive_file_move</span>
          <span>Mover</span>
        </button>
        <button type="button" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-xs rounded-xl flex items-center gap-1 cursor-pointer" data-act-delete="${escapeHtml(file.path)}">
          <span class="material-symbols-outlined text-[16px]">delete</span>
          <span>Excluir</span>
        </button>
      </div>
    `;

    // Painel Desktop
    const deskPlaceholder = $('vaultDetailPlaceholder');
    const deskContent = $('vaultDetailContent');
    if (deskPlaceholder && deskContent) {
      deskPlaceholder.classList.add('hidden');
      deskContent.classList.remove('hidden');
      deskContent.innerHTML = detailHtml;
      bindVaultActionButtons(deskContent, file);
    }

    // Bottom Sheet Mobile (< 768px)
    if (window.innerWidth < 768) {
      const drawer = $('vaultMobileDrawer');
      const drawerTitle = $('vaultDrawerTitle');
      const drawerBody = $('vaultDrawerBody');
      if (drawer && drawerBody) {
        if (drawerTitle) drawerTitle.textContent = file.name;
        drawerBody.innerHTML = detailHtml;
        bindVaultActionButtons(drawerBody, file);
        drawer.classList.add('open');
      }
    }
  }

  function clearVaultSelection() {
    state.vaultSelectedFile = null;
    $('vaultMobileDrawer')?.classList.remove('open');
    renderVaultFolderRightPane();
  }

  function bindVaultActionButtons(container, file) {
    container.querySelector('[data-act-preview]')?.addEventListener('click', () => {
      openUniversalPreview(file.name, file.kind, file.streamUrl, file.downloadUrl);
    });

    container.querySelector('[data-act-curate]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const targetPath = btn.dataset.actCurate;
      const newState = btn.dataset.curState;
      try {
        const res = await apiJson('/api/vault/curate', {
          method: 'POST',
          body: {
            path: targetPath,
            visibility: newState,
            album: state.selectedAlbum !== 'ALL' ? state.selectedAlbum : 'DESTAQUES',
            subalbum: state.selectedSubalbum !== 'ALL' ? state.selectedSubalbum : null,
          },
        });
        if (res.success) {
          showToast(newState === 'public' ? 'Item publicado no acervo!' : 'Item marcado como privado.');
          loadVaultTree(state.vaultFolder);
        }
      } catch (err) {
        showToast(`Erro ao curar item: ${err.message}`, true);
      }
    });

    container.querySelector('[data-act-rename]')?.addEventListener('click', () => {
      promptRenameVaultItem(file.path, file.name);
    });

    container.querySelector('[data-act-move]')?.addEventListener('click', () => {
      promptMoveVaultItem(file.path);
    });

    container.querySelector('[data-act-delete]')?.addEventListener('click', () => {
      promptDeleteVaultItem(file.path);
    });
  }

  async function promptCreateVaultFolder() {
    const parent = state.vaultFolder || '';
    const folderName = prompt(`Criar nova pasta dentro de "${parent || 'HD Externo'}":`);
    if (!folderName) return;
    try {
      await apiJson('/api/vault/folder', {
        method: 'POST',
        body: JSON.stringify({ parentFolder: parent, name: folderName, drive: state.vaultActiveDrive }),
      });
      showToast('Pasta criada com sucesso no HD.');
      state.vaultExpandedPaths.add(parent);
      loadVaultTree(parent);
    } catch (err) {
      showToast(`Erro ao criar pasta: ${err.message}`, true);
    }
  }

  async function promptRenameVaultItem(srcPath, currentName) {
    const newName = prompt('Novo nome para o item no HD:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await apiJson('/api/vault/rename', {
        method: 'POST',
        body: JSON.stringify({ path: srcPath, newName, drive: state.vaultActiveDrive }),
      });
      showToast('Item renomeado com sucesso.');
      loadVaultTree(state.vaultFolder);
      loadPortfolio();
    } catch (err) {
      showToast(`Erro ao renomear: ${err.message}`, true);
    }
  }

  async function promptMoveVaultItem(srcPath) {
    const dest = prompt('Mover para qual pasta no HD? (Ex: portfolio/POLÍTICAS ou vault):', state.vaultFolder || '');
    if (dest === null) return;
    try {
      await apiJson('/api/vault/move', {
        method: 'POST',
        body: JSON.stringify({ srcPath, destFolder: dest, drive: state.vaultActiveDrive }),
      });
      showToast('Item movido com sucesso no HD.');
      loadVaultTree(state.vaultFolder);
      loadPortfolio();
    } catch (err) {
      showToast(`Erro ao mover: ${err.message}`, true);
    }
  }

  async function promptDeleteVaultItem(srcPath) {
    if (!confirm(`Excluir permanentemente "${srcPath}" do disco rígido?`)) return;
    try {
      await apiJson('/api/vault/entry', {
        method: 'DELETE',
        body: JSON.stringify({ path: srcPath, drive: state.vaultActiveDrive }),
      });
      showToast('Item excluído permanentemente.');
      clearVaultSelection();
      loadVaultTree(state.vaultFolder);
      loadPortfolio();
    } catch (err) {
      showToast(`Erro ao excluir: ${err.message}`, true);
    }
  }

  // MOTOR ZIP CLIENT-SIDE (fflate Ultraleve • 0% Carga CPU no Fire Stick)
  async function handleZipUpload(file) {
    if (!file || !window.fflate) {
      showToast('Motor ZIP fflate não carregado.', true);
      return;
    }
    const modal = $('vaultZipProgressModal');
    const bar = $('zipProgressBar');
    const percentEl = $('zipProgressPercent');
    const titleEl = $('zipProgressTitle');
    const subEl = $('zipProgressSubtitle');

    modal?.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'Descompactando .ZIP no Navegador...';
    if (subEl) subEl.textContent = `Lendo ${file.name}...`;
    if (bar) bar.style.width = '10%';
    if (percentEl) percentEl.textContent = '10%';

    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);

      if (subEl) subEl.textContent = 'Extraindo arquivos e filtrando lixo de sistema...';
      if (bar) bar.style.width = '30%';
      if (percentEl) percentEl.textContent = '30%';

      window.fflate.unzip(u8, async (err, unzipped) => {
        if (err) {
          modal?.classList.add('hidden');
          showToast(`Erro ao processar ZIP: ${err.message}`, true);
          return;
        }

        const entries = Object.keys(unzipped);
        // Refinamento 2: Ignora entradas de diretório e lixo de SO (__MACOSX, .DS_Store, Thumbs.db, desktop.ini, ._*)
        const validFiles = entries.filter((name) => {
          if (name.endsWith('/')) return false;
          if (name.includes('__MACOSX') || name.includes('.DS_Store') || name.includes('Thumbs.db') || name.includes('desktop.ini')) return false;
          const base = name.split('/').pop();
          if (base.startsWith('._')) return false;
          return true;
        });

        if (validFiles.length === 0) {
          modal?.classList.add('hidden');
          showToast('Nenhum arquivo válido encontrado no ZIP.', true);
          return;
        }

        if (titleEl) titleEl.textContent = 'Enviando arquivos limpos ao Fire Stick...';
        let uploaded = 0;

        for (const fileName of validFiles) {
          const fileData = unzipped[fileName];
          const cleanBase = fileName.split('/').pop();
          const zipFile = new File([fileData], cleanBase);

          try {
            await uploadVaultFileWithThumb(zipFile, state.vaultFolder || '', state.vaultActiveDrive || '');
          } catch {}

          uploaded++;
          const pct = Math.round(30 + (uploaded / validFiles.length) * 70);
          if (bar) bar.style.width = `${pct}%`;
          if (percentEl) percentEl.textContent = `${pct}%`;
          if (subEl) subEl.textContent = `${uploaded} de ${validFiles.length} arquivos enviados`;
        }

        modal?.classList.add('hidden');
        showToast(`${uploaded} arquivos extraídos e enviados com sucesso!`);
        loadVaultTree(state.vaultFolder);
        loadPortfolio();
      });
    } catch (err) {
      modal?.classList.add('hidden');
      showToast(`Falha ao ler ZIP: ${err.message}`, true);
    }
  }

  function triggerFolderZipDownload(folderScope, customName = null) {
    const rawFolder = folderScope ? folderScope.replace('::', '/') : '';
    const cleanFolder = rawFolder.startsWith('portfolio') ? rawFolder : (rawFolder ? `portfolio/${rawFolder}` : 'portfolio');
    const driveParam = state.vaultActiveDrive ? `&drive=${encodeURIComponent(state.vaultActiveDrive)}` : '';
    const displayName = customName || (cleanFolder ? cleanFolder.split('/').pop() : 'acervo');

    showToast(`Iniciando download de "${displayName}.zip"...`);
    const downloadUrl = `/api/vault/download-zip?folder=${encodeURIComponent(cleanFolder)}${driveParam}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', `${displayName}.zip`);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1200);
  }

  function handleDownloadFolderZip() {
    const currentFolder = state.vaultFolder || '';
    const driveParam = state.vaultActiveDrive ? `&drive=${encodeURIComponent(state.vaultActiveDrive)}` : '';
    const folderName = currentFolder ? currentFolder.split('/').pop() : 'armazenamento_raiz';

    showToast(`Iniciando download do pacote .ZIP (${folderName})...`);
    const downloadUrl = `/api/vault/download-zip?folder=${encodeURIComponent(currentFolder)}${driveParam}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', `${folderName}.zip`);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1200);
  }

  async function handleFolderUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    const modal = $('vaultZipProgressModal');
    const bar = $('zipProgressBar');
    const percentEl = $('zipProgressPercent');
    const titleEl = $('zipProgressTitle');
    const subEl = $('zipProgressSubtitle');

    modal?.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'Enviando Pasta ao Fire Stick...';
    if (bar) bar.style.width = '5%';

    let uploaded = 0;
    const total = fileList.length;

    for (let i = 0; i < total; i++) {
      const file = fileList[i];
      const relPath = file.webkitRelativePath || file.name;
      if (relPath.includes('__MACOSX') || relPath.includes('.DS_Store') || relPath.includes('Thumbs.db')) continue;

      const subDir = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : '';
      const destFolder = state.vaultFolder ? (subDir ? `${state.vaultFolder}/${subDir}` : state.vaultFolder) : subDir;

      try {
        await uploadVaultFileWithThumb(file, destFolder, state.vaultActiveDrive || '');
      } catch {}

      uploaded++;
      const pct = Math.round((uploaded / total) * 100);
      if (bar) bar.style.width = `${pct}%`;
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (subEl) subEl.textContent = `${uploaded} de ${total} arquivos enviados`;
    }

    modal?.classList.add('hidden');
    showToast(`Upload de ${uploaded} arquivo(s) concluído com sucesso!`);
    loadVaultTree(state.vaultFolder);
    loadPortfolio();
  }

  // ==========================================================================
  // SPRINT 1 (V9.0): CONTROLES DO COFRE (MENU DE CONTEXTO, TAGS, BUSCA E SINCRONIZAÇÃO)
  // ==========================================================================
  let activeVaultContextMenuTarget = null;
  let activeVaultTagPaths = [];

  function openVaultContextMenu(clientX, clientY, targetInfo) {
    const menu = $('vaultContextMenu');
    if (!menu) return;

    activeVaultContextMenuTarget = targetInfo;
    const titleEl = $('vaultCtxTargetName');
    if (titleEl) titleEl.textContent = targetInfo.name || 'Item';

    const isFolder = targetInfo.type === 'folder';
    const folderVisualBtn = $('btnCtxFolderVisual');
    if (folderVisualBtn) folderVisualBtn.classList.toggle('hidden', !isFolder);

    const togglePortBtn = $('btnCtxTogglePortfolio');
    if (togglePortBtn) togglePortBtn.classList.toggle('hidden', !isFolder);
    const pinFolderBtn = $('btnCtxFolderPin');
    if (pinFolderBtn) pinFolderBtn.classList.toggle('hidden', !isFolder);
    const folderDiv = $('divCtxFolderDivider');
    if (folderDiv) folderDiv.classList.toggle('hidden', !isFolder);

    if (isFolder) {
      const scopeKey = normalizeFolderScopeKey(targetInfo.path);
      const fMeta = state.catalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
      const inPort = fMeta.inPortfolio !== false;
      if ($('lblCtxTogglePortfolio')) {
        $('lblCtxTogglePortfolio').textContent = inPort ? 'Remover do Portfólio' : 'Exibir no Portfólio (🖼️)';
      }
      if ($('lblCtxFolderPin')) {
        $('lblCtxFolderPin').textContent = fMeta.isLocked ? 'Alterar / Remover PIN' : 'Bloquear com PIN (🔒)';
      }
    }

    const lblFav = $('lblCtxToggleFav');
    if (lblFav) {
      lblFav.textContent = targetInfo.isFavorite ? 'Remover dos Favoritos' : 'Favoritar (⭐)';
    }

    const shortcutBtn = $('btnCtxCreateShortcut');
    if (shortcutBtn) {
      shortcutBtn.classList.toggle('hidden', isFolder);
    }

    // Posiciona o menu na tela evitando overflow
    menu.classList.remove('hidden');
    const menuW = 210;
    const menuH = 260;
    const posX = clientX + menuW > window.innerWidth ? window.innerWidth - menuW - 10 : clientX;
    const posY = clientY + menuH > window.innerHeight ? window.innerHeight - menuH - 10 : clientY;
    menu.style.left = `${Math.max(10, posX)}px`;
    menu.style.top = `${Math.max(10, posY)}px`;
  }

  function closeVaultContextMenu() {
    const menu = $('vaultContextMenu');
    if (menu) menu.classList.add('hidden');
    activeVaultContextMenuTarget = null;
  }

  function renderVaultActiveTags() {
    const container = $('vaultTagPillsList');
    if (!container) return;

    const allFiles = [
      ...(state.vaultData?.files || []),
      ...Object.values(state.vaultFilesByFolder || {}).flat(),
    ];
    const tagsCount = new Map();
    for (const f of allFiles) {
      if (Array.isArray(f.tags)) {
        for (const t of f.tags) {
          const norm = t.toLowerCase();
          tagsCount.set(norm, (tagsCount.get(norm) || 0) + 1);
        }
      }
    }

    if (tagsCount.size === 0) {
      container.innerHTML = '<span class="text-[10px] font-mono text-[#E0FBFC]/40">Nenhuma tag cadastrada.</span>';
      return;
    }

    const sorted = Array.from(tagsCount.entries()).sort((a, b) => b[1] - a[1]);
    container.innerHTML = sorted
      .slice(0, 15)
      .map(([t, count]) => {
        const isSel = state.vaultSelectedTags && state.vaultSelectedTags.has(t);
        return `<button type="button" class="tag-pill ${isSel ? 'active' : ''} text-[10px] py-0.5 px-2" data-vault-tag-filter="${escapeHtml(t)}">${escapeHtml(t)} <span class="opacity-60 text-[9px] font-bold">(${count})</span></button>`;
      })
      .join('');

    container.querySelectorAll('[data-vault-tag-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.vaultTagFilter;
        if (!state.vaultSelectedTags) state.vaultSelectedTags = new Set();
        if (state.vaultSelectedTags.has(tag)) {
          state.vaultSelectedTags.delete(tag);
        } else {
          state.vaultSelectedTags.add(tag);
        }
        renderVaultFolderRightPane();
      });
    });
  }

  function openVaultTagsModal(paths = []) {
    activeVaultTagPaths = paths;
    if ($('inputVaultTags')) {
      // Pré-carrega tags do primeiro item selecionado se houver
      const firstFile = (state.vaultData?.files || []).find((f) => f.path === paths[0]);
      $('inputVaultTags').value = Array.isArray(firstFile?.tags) ? firstFile.tags.join(', ') : '';
    }
    openModal('vaultTagsModal');
  }

  async function saveVaultTagsModal() {
    if (!activeVaultTagPaths.length) {
      closeModal('vaultTagsModal');
      return;
    }
    const raw = $('inputVaultTags')?.value || '';
    const tags = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    try {
      await apiJson('/api/vault/meta', {
        method: 'POST',
        body: JSON.stringify({ paths: activeVaultTagPaths, tags }),
      });
      closeModal('vaultTagsModal');
      showToast('Tags atualizadas com sucesso! 🏷️');
      await loadVaultTree(state.vaultFolder);
      loadPortfolio();
    } catch (err) {
      showToast(`Erro ao salvar tags: ${err.message}`, true);
    }
  }

    // METADADOS DA PASTA (📱 CELULAR OU 📷 CÂMERA)
  let activeFolderMetaScope = null;
  let activeFolderDevType = null;
  let activeFolderColor = null;
  let activeFolderIcon = null;
  let activeFolderIsFavorite = false;
  let activeShortcutTargetItemId = null;


  // ==========================================================================
  // SPRINT 2 (V10.0): GESTÃO DO COFRE PIN, LIXEIRA E DEDUPLICADOR
  // ==========================================================================
  let activePinFolderScope = null;
  let activePinIsUnlocking = false;

  function openFolderPinModal(scopeKey, isUnlocking = false) {
    activePinFolderScope = normalizeFolderScopeKey(scopeKey);
    activePinIsUnlocking = Boolean(isUnlocking);

    const fMeta = state.catalog?.settings?.layout?.folderMeta?.[activePinFolderScope] || {};
    const isAlreadyLocked = Boolean(fMeta.isLocked);

    if ($('vaultPinModalTitle')) {
      $('vaultPinModalTitle').innerHTML = isUnlocking
        ? '<span>🔓</span> <span>Desbloquear Pasta com PIN</span>'
        : (isAlreadyLocked ? '<span>🔒</span> <span>Alterar PIN da Pasta</span>' : '<span>🔒</span> <span>Proteger Pasta com PIN</span>');
    }
    if ($('vaultPinModalDesc')) {
      $('vaultPinModalDesc').textContent = isUnlocking
        ? `Digite o PIN para acessar o conteúdo de "${activePinFolderScope}":`
        : `Defina um PIN numérico (4 a 8 dígitos) para isolar "${activePinFolderScope}":`;
    }
    if ($('inputVaultPin')) {
      $('inputVaultPin').value = '';
    }
    if ($('btnRemoveFolderPin')) {
      $('btnRemoveFolderPin').classList.toggle('hidden', isUnlocking || !isAlreadyLocked);
    }
    openModal('vaultPinModal');
    setTimeout(() => $('inputVaultPin')?.focus(), 150);
  }

  async function submitFolderPin() {
    const pin = $('inputVaultPin')?.value.trim();
    if (!pin || pin.length < 4 || pin.length > 8) {
      showToast('O PIN deve conter entre 4 e 8 dígitos.', true);
      return;
    }

    try {
      if (activePinIsUnlocking) {
        const res = await apiJson('/api/vault/pin/unlock', {
          method: 'POST',
          body: JSON.stringify({ scopeKey: activePinFolderScope, pin }),
        });
        if (res.success) {
          closeModal('vaultPinModal');
          showToast('Pasta desbloqueada com sucesso! 🔓');
          await loadVaultTree(activePinFolderScope);
        }
      } else {
        const res = await apiJson('/api/vault/pin/set', {
          method: 'POST',
          body: JSON.stringify({ scopeKey: activePinFolderScope, pin }),
        });
        if (res.success) {
          if (!state.catalog.settings.layout) state.catalog.settings.layout = {};
          if (!state.catalog.settings.layout.folderMeta) state.catalog.settings.layout.folderMeta = {};
          if (!state.catalog.settings.layout.folderMeta[activePinFolderScope]) {
            state.catalog.settings.layout.folderMeta[activePinFolderScope] = {};
          }
          state.catalog.settings.layout.folderMeta[activePinFolderScope].isLocked = true;
          closeModal('vaultPinModal');
          showToast('Pasta protegida por PIN com sucesso! 🔒');
          await loadVaultTree(state.vaultFolder);
        }
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function removeFolderPin() {
    if (!activePinFolderScope) return;
    if (!confirm(`Remover proteção por PIN da pasta "${activePinFolderScope}"?`)) return;
    try {
      const res = await apiJson('/api/vault/pin/set', {
        method: 'POST',
        body: JSON.stringify({ scopeKey: activePinFolderScope, pin: null }),
      });
      if (res.success) {
        if (state.catalog?.settings?.layout?.folderMeta?.[activePinFolderScope]) {
          state.catalog.settings.layout.folderMeta[activePinFolderScope].isLocked = false;
        }
        closeModal('vaultPinModal');
        showToast('Proteção por PIN removida.');
        await loadVaultTree(state.vaultFolder);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // --- LIXEIRA CENTRALIZADA (15 DIAS) ---
  async function openTrashModal() {
    openModal('vaultTrashModal');
    await loadTrashList();
  }

  async function loadTrashList() {
    const container = $('vaultTrashListContainer');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-6 text-xs text-[#E0FBFC]/50">Carregando itens da lixeira...</div>';

    try {
      const res = await apiJson('/api/trash/list');
      const items = res.items || [];
      if ($('vaultTrashCount')) {
        $('vaultTrashCount').textContent = `${items.length} item(ns) na lixeira`;
      }

      if (items.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-xs text-[#E0FBFC]/50">A lixeira está vazia.</div>';
        return;
      }

      container.innerHTML = items
        .map(
          (it) => `
          <div class="p-2.5 rounded-xl bg-[#0B1320] border border-[#5A189A]/50 flex items-center justify-between gap-3 text-xs">
            <div class="min-w-0 flex-1">
              <div class="font-bold text-[#E0FBFC] truncate">${escapeHtml(it.originalBaseName)}</div>
              <div class="text-[10px] font-mono text-[#E0FBFC]/50 truncate">Local original: ${escapeHtml(it.originalRelPath)}</div>
              <div class="text-[10px] font-mono text-[#FFB703]">Expira em: ${it.remainingDays} dia(s) (${(it.sizeBytes / 1024 / 1024).toFixed(2)} MB)</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" class="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 font-bold text-xs cursor-pointer" data-trash-restore="${escapeHtml(it.id)}">
                Restaurar
              </button>
              <button type="button" class="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/50 text-rose-300 text-xs cursor-pointer" data-trash-purge="${escapeHtml(it.id)}" title="Excluir Definitivamente">
                ✕
              </button>
            </div>
          </div>
        `
        )
        .join('');

      container.querySelectorAll('[data-trash-restore]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.trashRestore;
          try {
            await apiJson('/api/trash/restore', {
              method: 'POST',
              body: JSON.stringify({ id }),
            });
            showToast('Item restaurado com sucesso! ♻️');
            await loadTrashList();
            await loadVaultTree(state.vaultFolder);
            loadPortfolio();
          } catch (err) {
            showToast(`Erro ao restaurar: ${err.message}`, true);
          }
        });
      });

      container.querySelectorAll('[data-trash-purge]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.trashPurge;
          if (!confirm('Excluir este item definitivamente agora?')) return;
          try {
            await apiJson('/api/trash/purge', {
              method: 'DELETE',
              body: JSON.stringify({ id }),
            });
            showToast('Item purgado permanentemente.');
            await loadTrashList();
          } catch (err) {
            showToast(`Erro ao purgar: ${err.message}`, true);
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="text-center py-6 text-xs text-rose-400">Erro: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function handleEmptyTrash() {
    if (!confirm('Tem certeza de que deseja esvaziar permanentemente todos os itens da lixeira?')) return;
    try {
      const res = await apiJson('/api/trash/empty', { method: 'DELETE' });
      showToast(`${res.count || 0} item(ns) excluído(s) permanentemente.`);
      await loadTrashList();
    } catch (err) {
      showToast(`Erro ao esvaziar lixeira: ${err.message}`, true);
    }
  }

  // --- DEDUPLICADOR (CAÇADOR DE CÓPIAS) ---
  async function openDeduplicatorModal() {
    openModal('vaultDeduplicatorModal');
  }

  async function runDeduplicationScan() {
    const container = $('dedupResultsContainer');
    const statsEl = $('dedupStatsText');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-8 text-xs text-[#FFB703] flex items-center justify-center gap-2"><span class="animate-spin">⏳</span> <span>Calculando hashes SHA-256 no HD... Isso pode levar alguns segundos.</span></div>';

    try {
      const res = await apiJson('/api/duplicates');
      const groups = res.groups || [];
      const totalWastedMB = (res.totalWastedBytes / (1024 * 1024)).toFixed(2);

      if (statsEl) {
        statsEl.innerHTML = `<span class="text-[#FFB703] font-bold">${res.totalDuplicateFiles} arquivo(s) duplicado(s)</span> encontrados • <span class="text-rose-400 font-bold">${totalWastedMB} MB</span> desperdiçados no HD.`;
      }

      if (groups.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-xs text-emerald-400">Parabéns! Nenhuma cópia duplicada foi encontrada no HD.</div>';
        return;
      }

      container.innerHTML = groups
        .map(
          (g, gIdx) => `
          <div class="p-3 rounded-xl bg-[#0B1320] border border-[#5A189A]/50 space-y-2 text-xs">
            <div class="flex items-center justify-between border-b border-[#5A189A]/30 pb-1.5">
              <span class="font-bold text-[#FFB703]">Grupo #${gIdx + 1} (${(g.sizeBytes / 1024 / 1024).toFixed(2)} MB cada)</span>
              <span class="text-[10px] font-mono text-rose-300">Espaço desperdiçado: ${(g.wastedBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div class="space-y-1">
              <div class="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                <span>⭐ Original:</span>
                <span class="truncate">${escapeHtml(g.original.relPath)}</span>
              </div>
              ${g.copies
                .map(
                  (c) => `
                  <div class="flex items-center justify-between gap-2 pl-4 text-[10px] font-mono text-[#E0FBFC]/70">
                    <span class="truncate">📄 Cópia: ${escapeHtml(c.relPath)}</span>
                    <button type="button" class="px-2 py-0.5 rounded bg-[#3B82F6]/60 hover:bg-[#3B82F6] border border-[#3B82F6] text-white shrink-0 cursor-pointer" data-dedup-convert="${escapeHtml(c.relPath)}" data-dedup-orig="${escapeHtml(g.original.relPath)}">
                      Substituir por Atalho
                    </button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        `
        )
        .join('');

      container.querySelectorAll('[data-dedup-convert]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const copyRelPath = btn.dataset.dedupConvert;
          const origRelPath = btn.dataset.dedupOrig;

          // Encontra o item original no catálogo
          const origMatch = (state.catalog.items || []).find(
            (it) => it.relativePath === origRelPath || it.originalFile === origRelPath.split('/').pop()
          );

          if (!origMatch) {
            showToast('O arquivo original precisa estar catalogado no portfólio para criar atalho.', true);
            return;
          }

          const album = origMatch.album || 'Destaques';
          const subalbum = origMatch.subalbum || null;

          try {
            await apiJson('/api/duplicates/convert-shortcut', {
              method: 'POST',
              body: JSON.stringify({
                copyRelPath,
                targetItemId: origMatch.id,
                album,
                subalbum,
              }),
            });
            showToast('Cópia convertida em Atalho Virtual! Espaço liberado no HD. 🔗');
            btn.disabled = true;
            btn.textContent = '✓ Convertido em Atalho';
            btn.className = 'px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 text-[10px]';
            loadPortfolio();
          } catch (err) {
            showToast(`Erro ao converter: ${err.message}`, true);
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="text-center py-8 text-xs text-rose-400">Erro na varredura: ${escapeHtml(err.message)}</div>`;
    }
  }

  // --- PORTFÓLIO OPCIONAL ---
  async function toggleFolderPortfolioInclusion(scopeKey) {
    const cleanScope = normalizeFolderScopeKey(scopeKey);
    const fMeta = state.catalog?.settings?.layout?.folderMeta?.[cleanScope] || {};
    const nextInclusion = fMeta.inPortfolio === false ? true : false;

    try {
      const res = await apiJson('/api/portfolio/folder-inclusion', {
        method: 'POST',
        body: JSON.stringify({ scopeKey: cleanScope, inPortfolio: nextInclusion }),
      });
      if (res.success) {
        if (!state.catalog.settings.layout) state.catalog.settings.layout = {};
        state.catalog.settings.layout.folderMeta = res.folderMeta;
        showToast(nextInclusion ? 'Pasta adicionada ao Portfólio! 🖼️' : 'Pasta removida do Portfólio.');
        renderVaultTree();
        renderVaultFolderRightPane();
        loadPortfolio();
      }
    } catch (err) {
      showToast(`Erro ao alternar inclusão: ${err.message}`, true);
    }
  }

  function openFolderVisualModal(scopeKey = null) {
    const targetScope = scopeKey || (state.selectedSubalbum && state.selectedSubalbum !== 'ALL' ? `${state.selectedAlbum}::${state.selectedSubalbum}` : state.selectedAlbum);
    activeFolderMetaScope = targetScope;
    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const cur = fMetaMap[targetScope] || fMetaMap[targetScope.replace('::', '/')] || {};

    activeFolderColor = cur.color || null;
    activeFolderIcon = cur.icon || null;
    activeFolderIsFavorite = Boolean(cur.isFavorite);

    if ($('inputFolderTags')) {
      $('inputFolderTags').value = Array.isArray(cur.tags) ? cur.tags.join(', ') : '';
    }
    if ($('chkFolderFavorite')) {
      $('chkFolderFavorite').checked = activeFolderIsFavorite;
    }

    updateFolderVisualPickersUI();
    openModal('folderVisualModal');
  }

  function updateFolderVisualPickersUI() {
    document.querySelectorAll('.color-dot-choice').forEach((dot) => {
      dot.classList.toggle('selected', dot.dataset.color === activeFolderColor);
    });
    document.querySelectorAll('.icon-choice-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.icon === activeFolderIcon);
    });
  }

  async function saveFolderVisual() {
    if (!activeFolderMetaScope) return;
    const rawTags = $('inputFolderTags')?.value || '';
    const tags = rawTags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    const isFav = Boolean($('chkFolderFavorite')?.checked);

    try {
      const res = await apiJson('/api/portfolio/folder-meta', {
        method: 'POST',
        body: JSON.stringify({
          scopeKey: activeFolderMetaScope,
          color: activeFolderColor || null,
          icon: activeFolderIcon || null,
          isFavorite: isFav,
          tags,
        }),
      });
      if (res.success) {
        if (!state.catalog.settings.layout) state.catalog.settings.layout = {};
        state.catalog.settings.layout.folderMeta = res.folderMeta;
        closeModal('folderVisualModal');
        showToast('Visual da pasta personalizado com sucesso! 🎨');
        renderVaultTree();
        renderVaultFolderRightPane();
        renderAlbumPills();
        renderSubalbumPills();
        renderActiveTagsBar();
        renderPortfolioGrid();
      }
    } catch (err) {
      showToast(`Erro ao salvar personalização: ${err.message}`, true);
    }
  }

  function openCreateShortcutModal(itemId) {
    activeShortcutTargetItemId = itemId;
    const albums = (state.catalog.albums || []).filter((a) => a !== 'ALL');
    const select = $('selectShortcutTargetAlbum');
    if (select) {
      select.innerHTML = albums.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    }
    if ($('inputShortcutTargetSubalbum')) {
      $('inputShortcutTargetSubalbum').value = '';
    }
    openModal('createShortcutModal');
  }

  async function confirmCreateShortcut() {
    if (!activeShortcutTargetItemId) return;
    const targetAlbum = $('selectShortcutTargetAlbum')?.value;
    const targetSub = $('inputShortcutTargetSubalbum')?.value?.trim() || null;
    if (!targetAlbum) {
      showToast('Selecione o álbum de destino.', true);
      return;
    }

    try {
      const res = await apiJson('/api/portfolio/shortcuts', {
        method: 'POST',
        body: JSON.stringify({
          targetItemId: activeShortcutTargetItemId,
          targetAlbum,
          targetSubalbum: targetSub,
        }),
      });
      if (res.success && res.shortcut) {
        state.catalog.items.push(res.shortcut);
        closeModal('createShortcutModal');
        showToast('Atalho virtual criado com sucesso! (Zero bytes no HD) 🔗');
        renderAlbumPills();
        renderPortfolioGrid();
      }
    } catch (err) {
      showToast(`Erro ao criar atalho virtual: ${err.message}`, true);
    }
  }

  // Renderizador de tags ativas no topo para filtro instantâneo
  function renderActiveTagsBar() {
    const container = $('tagPillsList');
    if (!container) return;

    const allItems = state.catalog.items || [];
    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const tagsCount = new Map();

    for (const it of allItems) {
      if (Array.isArray(it.tags)) {
        for (const t of it.tags) {
          const norm = t.toLowerCase();
          tagsCount.set(norm, (tagsCount.get(norm) || 0) + 1);
        }
      }
    }
    for (const meta of Object.values(fMetaMap)) {
      if (Array.isArray(meta?.tags)) {
        for (const t of meta.tags) {
          const norm = t.toLowerCase();
          tagsCount.set(norm, (tagsCount.get(norm) || 0) + 1);
        }
      }
    }

    if (tagsCount.size === 0) {
      container.innerHTML = '<span class="text-[11px] font-mono text-[#E0FBFC]/40">Nenhuma etiqueta cadastrada ainda.</span>';
      return;
    }

    const sortedTags = Array.from(tagsCount.entries()).sort((a, b) => b[1] - a[1]);
    container.innerHTML = sortedTags
      .slice(0, 15)
      .map(([t, count]) => {
        const isSel = state.selectedTags && state.selectedTags.has(t);
        return `<button type="button" class="tag-pill ${isSel ? 'active' : ''}" data-tag-filter="${escapeHtml(t)}">${escapeHtml(t)} <span class="opacity-60 text-[9px] font-bold">(${count})</span></button>`;
      })
      .join('');

    container.querySelectorAll('[data-tag-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tagFilter;
        if (!state.selectedTags) state.selectedTags = new Set();
        if (state.selectedTags.has(t)) {
          state.selectedTags.delete(t);
        } else {
          state.selectedTags.add(t);
        }
        renderActiveTagsBar();
        renderPortfolioGrid();
      });
    });
  }

  function openFolderEquipmentModal(scopeKey = null) {
    const targetScope = scopeKey || (state.selectedSubalbum && state.selectedSubalbum !== 'ALL' ? `${state.selectedAlbum}/${state.selectedSubalbum}` : state.selectedAlbum);
    activeFolderMetaScope = targetScope;
    const fMetaMap = state.catalog.settings?.layout?.folderMeta || {};
    const cur = fMetaMap[targetScope] || {};

    activeFolderDevType = cur.deviceType || null;
    updateFolderDevTypeButtons();
    openModal('folderEquipmentModal');
  }

  function updateFolderDevTypeButtons() {
    document.querySelectorAll('.folder-dev-btn').forEach((btn) => {
      const isSel = btn.dataset.dev === activeFolderDevType;
      btn.className = `folder-dev-btn p-3 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
        isSel
          ? 'active bg-[#5A189A] border-2 border-[#FFB703] text-white shadow-lg scale-105'
          : 'bg-[#0B1320] border border-[#5A189A] text-[#E0FBFC]/70 hover:text-[#E0FBFC]'
      }`;
    });
  }

  async function saveFolderEquipment() {
    if (!activeFolderMetaScope) return;
    try {
      const res = await apiJson('/api/portfolio/folder-meta', {
        method: 'POST',
        body: JSON.stringify({
          scopeKey: activeFolderMetaScope,
          deviceType: activeFolderDevType || null,
          model: activeFolderDevType ? (activeFolderDevType === 'phone' ? 'Celular' : 'Câmera') : '',
          shutter: '',
          aperture: '',
          iso: '',
        }),
      });
      if (res.success) {
        if (!state.catalog.settings.layout) state.catalog.settings.layout = {};
        state.catalog.settings.layout.folderMeta = res.folderMeta;
        closeModal('folderEquipmentModal');
        const msg = !activeFolderDevType
          ? 'Marcação de dispositivo desmarcada.'
          : activeFolderDevType === 'phone'
          ? 'Pasta marcada como gravada em Celular 📱'
          : 'Pasta marcada como gravada em Câmera 📷';
        showToast(msg);
        renderSubalbumPills();
        renderPortfolioGrid();
      }
    } catch (err) {
      showToast(`Erro ao salvar dispositivo: ${err.message}`, true);
    }
  }

  // FEED NETFLIX MOBILE: CARDS DE APLICATIVOS E CÓDIGO
  function setupAppsCarouselDots() {
    const feed = $('appsCardsFeed');
    const dotsContainer = $('appsCarouselDots');
    if (!feed || !dotsContainer) return;

    const dots = dotsContainer.querySelectorAll('[data-app-dot]');

    const updateDots = () => {
      const firstCard = feed.children[0];
      const cardWidth = firstCard ? firstCard.offsetWidth : 280;
      const idx = Math.min(dots.length - 1, Math.max(0, Math.round(feed.scrollLeft / (cardWidth + 14))));
      dots.forEach((dot, dIdx) => {
        if (dIdx === idx) {
          dot.className = 'w-3 h-2.5 rounded-full bg-[#FFB703] transition-all cursor-pointer';
        } else {
          dot.className = 'w-2 h-2 rounded-full bg-[#5A189A] transition-all cursor-pointer';
        }
      });
    };

    feed.addEventListener('scroll', updateDots, { passive: true });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const dIdx = parseInt(dot.dataset.appDot, 10) || 0;
        const cards = feed.children;
        if (cards[dIdx]) {
          cards[dIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      });
    });
  }

  // ==========================================================================
  // AMBIENTE 3: TELEMETRIA DO SERVIDOR & MÍDIAS DO HUB (media/)
  // ==========================================================================
  async function loadTelemetry() {
    try {
      const t = await apiJson('/api/server/telemetry');
      const total = t.disk?.totalBytes || 1;
      const used = t.disk?.usedBytes || 0;
      const free = t.disk?.freeBytes || 0;

      const comm = t.disk?.commercialSize ? ` (${t.disk.commercialSize})` : '';
      if ($('telDiskHeadline')) $('telDiskHeadline').textContent = `${formatBytes(used)} / ${formatBytes(t.disk?.totalBytes)}${comm}`;
      if ($('telDiskPercent')) $('telDiskPercent').textContent = `${t.disk?.percentUsed || 0}% ocupado`;
      if ($('telDiskFree')) $('telDiskFree').textContent = formatBytes(free);
      if ($('telStoragePath')) $('telStoragePath').textContent = `Ponto de montagem HD: ${t.storagePath || 'STORAGE_DIR'}`;

      const pBytes = t.zones?.portfolio?.bytes || 0;
      const vBytes = t.zones?.vault?.bytes || 0;
      const mBytes = t.zones?.media?.bytes || 0;
      const otherUsed = Math.max(0, used - (pBytes + vBytes + mBytes));

      if ($('barSegPortfolio')) $('barSegPortfolio').style.width = `${Math.min(100, (pBytes / total) * 100).toFixed(2)}%`;
      if ($('barSegVault')) $('barSegVault').style.width = `${Math.min(100, (vBytes / total) * 100).toFixed(2)}%`;
      if ($('barSegHub')) $('barSegHub').style.width = `${Math.min(100, (mBytes / total) * 100).toFixed(2)}%`;
      if ($('barSegOther')) $('barSegOther').style.width = `${Math.min(100, (otherUsed / total) * 100).toFixed(2)}%`;

      if ($('telZonePortfolio')) $('telZonePortfolio').textContent = `${formatBytes(pBytes)} (${t.zones?.portfolio?.count || 0} arqs)`;
      if ($('telZoneVault')) $('telZoneVault').textContent = `${formatBytes(vBytes)} (${t.zones?.vault?.count || 0} arqs)`;
      if ($('telZoneHub')) $('telZoneHub').textContent = `${formatBytes(mBytes)} (${t.zones?.media?.count || 0} arqs)`;

      if ($('telRamValue')) $('telRamValue').textContent = `${formatBytes(t.memory?.usedBytes)} / ${formatBytes(t.memory?.totalBytes)}`;
      if ($('barRamFill')) $('barRamFill').style.width = `${t.memory?.percentUsed || 0}%`;
      if ($('telNodeRss')) $('telNodeRss').textContent = `Node.js RSS: ${formatBytes(t.memory?.processRssBytes)} (${t.memory?.percentUsed || 0}% RAM OS)`;

      if ($('telUptimeValue')) $('telUptimeValue').textContent = formatDuration(t.uptime?.processSec);
      const load1 = Array.isArray(t.cpu?.loadAvg) ? t.cpu.loadAvg[0].toFixed(2) : '0.00';
      if ($('telCpuInfo')) $('telCpuInfo').textContent = `${t.cpu?.arch || ''} (${t.cpu?.cores || 1} cores) • Load: ${load1}`;
      if ($('telCacheTimestamp')) {
        $('telCacheTimestamp').textContent = t.zones?.isScanning
          ? 'Escaneando diretórios...'
          : `Contabilidade O(1) • OS up ${formatDuration(t.uptime?.osSec)}`;
      }
    } catch (err) {
      console.warn('Erro na telemetria:', err);
    }
  }

  function startTelemetryPolling() {
    stopTelemetryPolling();
    state.telemetryTimer = setInterval(() => {
      if (!document.hidden && state.activeView === 'hub' && state.isAdmin) {
        loadTelemetry();
      }
    }, 15000);
  }

  function stopTelemetryPolling() {
    if (state.telemetryTimer) {
      clearInterval(state.telemetryTimer);
      state.telemetryTimer = null;
    }
  }

  async function loadHubMedia() {
    try {
      const params = new URLSearchParams({
        type: state.hubType,
        sort: state.hubSort,
        q: state.hubQuery,
      });
      const data = await apiJson(`/api/hub-media/list?${params.toString()}`);
      renderHubMedia(data.files || []);
    } catch (err) {
      showToast(`Erro ao listar mídias do HUB: ${err.message}`, true);
    }
  }

  function renderHubMedia(files) {
    const grid = $('hubMediaGrid');
    if (files.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>Nenhuma mídia do HUB encontrada com este filtro em <code>STORAGE_DIR/media/</code>.</p></div>`;
      return;
    }

    grid.innerHTML = files
      .map((f) => {
        const thumb =
          f.kind === 'image'
            ? `<img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.filename)}" loading="lazy" />`
            : `<span class="entry-kind-badge">${escapeHtml(f.kind)}</span>`;

        return `
          <div class="entry-card">
            <div class="entry-thumb" data-preview-hub="${escapeHtml(f.filename)}">
              ${thumb}
            </div>
            <div class="entry-body">
              <div class="entry-title" title="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</div>
              <div class="entry-sub">
                <span>${formatBytes(f.sizeBytes)}</span>
                <span>${new Date(f.modifiedAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <div class="entry-actions">
                <button type="button" class="entry-btn" data-preview-hub="${escapeHtml(f.filename)}">Ver</button>
                <button type="button" class="entry-btn" data-copy-hub="${escapeHtml(f.url)}">Link</button>
                <button type="button" class="entry-btn danger" data-del-hub="${escapeHtml(f.filename)}">✕</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-preview-hub]').forEach((el) => {
      el.addEventListener('click', () => {
        const file = files.find((x) => x.filename === el.dataset.previewHub);
        if (file) openUniversalPreview(file.filename, file.kind, file.url, file.url);
      });
    });

    grid.querySelectorAll('[data-copy-hub]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fullUrl = `${window.location.origin}${btn.dataset.copyHub}`;
        try {
          await navigator.clipboard.writeText(fullUrl);
          showToast('URL pública copiada para a área de transferência!');
        } catch {
          prompt('Copie a URL pública:', fullUrl);
        }
      });
    });

    grid.querySelectorAll('[data-del-hub]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fn = btn.dataset.delHub;
        if (!confirm(`Excluir "${fn}" de STORAGE_DIR/media/? (Atenção: se um post do HUB depender deste backup, ele será removido)`)) return;
        try {
          await apiJson(`/api/hub-media/${encodeURIComponent(fn)}`, { method: 'DELETE' });
          showToast('Mídia removida da pasta media/.');
          loadHubMedia();
          loadTelemetry();
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  // ==========================================================================
  // VISUALIZADOR UNIVERSAL (VÍDEO HTTP 206 RANGE, PDF, ÁUDIO, IMAGEM, TEXTO)
  // ==========================================================================
  async function openUniversalPreview(title, kind, streamUrl, downloadUrl) {
    $('previewTitle').textContent = title;
    $('previewDownloadBtn').href = downloadUrl;
    const stage = $('previewStage');
    stage.innerHTML = '<span class="muted mono">Carregando stream...</span>';
    openModal('modalPreview');

    if (kind === 'audio') {
      closeModal('modalPreview');
      playAudioTrack({ name: title, path: streamUrl.split('path=')[1] ? decodeURIComponent(streamUrl.split('path=')[1].split('&')[0]) : title, streamUrl });
      return;
    } else if (kind === 'video') {
      closeModal('modalPreview');
      playVideoModal({ name: title, streamUrl, downloadUrl });
      return;
    } else if (kind === 'pdf' || kind === 'text' || title.endsWith('.md') || title.endsWith('.txt') || title.endsWith('.json') || title.endsWith('.py') || title.endsWith('.js') || title.endsWith('.css') || title.endsWith('.html') || title.endsWith('.sh') || title.endsWith('.log')) {
      closeModal('modalPreview');
      openDocumentViewer({ name: title, path: streamUrl.split('path=')[1] ? decodeURIComponent(streamUrl.split('path=')[1].split('&')[0]) : title, streamUrl, downloadUrl, kind });
      return;
    } else if (kind === 'image') {
      stage.innerHTML = `<img src="${escapeHtml(streamUrl)}" alt="${escapeHtml(title)}" />`;
    } else if (false) {
      try {
        const res = await fetch(streamUrl, { credentials: 'same-origin' });
        const txt = await res.text();
        stage.innerHTML = `<pre>${escapeHtml(txt.slice(0, 120000))}</pre>`;
      } catch {
        stage.innerHTML = `<p class="muted">Não foi possível pré-visualizar o texto.</p>`;
      }
    } else {
      stage.innerHTML = `
        <div style="text-align:center;padding:2rem;">
          <p class="muted" style="margin-bottom:1rem;">Formato binário (<code>${escapeHtml(kind)}</code>). Utilize o download direto.</p>
          <a href="${escapeHtml(downloadUrl)}" download class="btn-gold">Baixar Arquivo</a>
        </div>
      `;
    }
  }

  function closeUniversalPreview() {
    $('previewStage').innerHTML = ''; // Interrompe streams de vídeo/áudio imediatamente
    closeModal('modalPreview');
  }

  // ==========================================================================
  // MODAIS, DROPZONES & EVENT LISTENERS
  // ==========================================================================
  function openModal(id) {
    $(id).classList.remove('hidden');
  }

  function closeModal(id) {
    $(id).classList.add('hidden');
  }

  function bindDropzone(el, onFilesDropped) {
    if (!el) return;
    ['dragenter', 'dragover'].forEach((evName) => {
      el.addEventListener(evName, (e) => {
        e.preventDefault();
        el.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evName) => {
      el.addEventListener(evName, (e) => {
        e.preventDefault();
        el.classList.remove('dragover');
      });
    });
    el.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) {
        onFilesDropped(e.dataTransfer.files);
      }
    });
  }

  function initEvents() {
    // Fechamento de modais
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    $('btnClosePreview')?.addEventListener('click', closeUniversalPreview);

    // Abas Superiores
    document.querySelectorAll('.env-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });

    $('brandLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('portfolio');
    });

    // Botão Unificado Top App Bar: 🟢 Online | 🔒 Admin (Hover no Desktop & Click no Mobile/Desktop)
    const adminWrapper = $('adminDropdownWrapper');
    const adminMenu = $('adminDropdownMenu');
    let dropdownHoverTimer = null;
    let isDropdownPinnedOpen = false;

    function openAdminDropdown(pinned = false) {
      clearTimeout(dropdownHoverTimer);
      if (pinned) isDropdownPinnedOpen = true;
      if (adminMenu) {
        adminMenu.classList.remove('hidden');
        adminMenu.style.zIndex = '1050';
      }
    }

    function closeAdminDropdown(force = false) {
      clearTimeout(dropdownHoverTimer);
      if (force) isDropdownPinnedOpen = false;
      if (!isDropdownPinnedOpen || force) {
        adminMenu?.classList.add('hidden');
      }
    }

    function toggleAdminDropdown() {
      clearTimeout(dropdownHoverTimer);
      if (adminMenu) {
        if (adminMenu.classList.contains('hidden')) {
          openAdminDropdown(true);
        } else {
          closeAdminDropdown(true);
        }
      }
    }

    if (adminWrapper) {
      adminWrapper.addEventListener('mouseenter', () => {
        if (!state.isAdmin) return;
        if (window.matchMedia('(hover: hover)').matches) {
          openAdminDropdown(false);
        }
      });

      adminWrapper.addEventListener('mouseleave', () => {
        if (!state.isAdmin) return;
        if (isDropdownPinnedOpen) return;
        if (window.matchMedia('(hover: hover)').matches) {
          clearTimeout(dropdownHoverTimer);
          dropdownHoverTimer = setTimeout(() => {
            closeAdminDropdown(false);
          }, 320);
        }
      });
    }

    $('btnAuthAction')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isAdmin) {
        toggleAdminDropdown();
      } else {
        openModal('modalLogin');
        setTimeout(() => $('inputAdminPassword')?.focus(), 60);
      }
    });

    document.addEventListener('click', (e) => {
      const menu = $('adminDropdownMenu');
      if (menu && !menu.classList.contains('hidden')) {
        if (!e.target.closest('#adminDropdownWrapper')) {
          closeAdminDropdown(true);
        }
      }
    });

    document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeAdminDropdown(true);
        switchView(btn.dataset.adminNav);
      });
    });

    $('btnDropdownToggleStudio')?.addEventListener('click', () => {
      closeAdminDropdown(true);
      if (state.activeView !== 'portfolio') {
        switchView('portfolio');
      }
      if (state.isVisualEditMode) {
        exitVisualStudio(state.studioDirty);
      } else {
        enterVisualStudio();
      }
    });

    // Alternar Visualização como Visitante
    $('btnToggleVisitorView')?.addEventListener('click', () => setVisitorViewOverride(true));
    $('btnDropdownVisitorView')?.addEventListener('click', () => {
      closeAdminDropdown(true);
      setVisitorViewOverride(true);
    });
    $('pillReturnToEdit')?.addEventListener('click', () => setVisitorViewOverride(false));

    // Botão de Baixar Álbum Completo / Subpasta Ativa em .ZIP
    $('btnDownloadActiveAlbumZip')?.addEventListener('click', () => {
      const targetAlbum = state.selectedAlbum;
      const targetSub = state.selectedSubalbum;
      let scope = '';
      if (targetAlbum === 'ALL' || !targetAlbum) {
        scope = 'portfolio';
      } else if (targetSub && targetSub !== 'ALL') {
        scope = `portfolio/${targetAlbum}/${targetSub}`;
      } else {
        scope = `portfolio/${targetAlbum}`;
      }
      triggerFolderZipDownload(scope);
    });

    // Modal de Equipamento da Pasta / EXIF
    $('btnOpenFolderEquipmentModal')?.addEventListener('click', () => openFolderEquipmentModal());
    $('btnCloseFolderEquipmentModal')?.addEventListener('click', () => closeModal('folderEquipmentModal'));
    $('btnCancelFolderEquipment')?.addEventListener('click', () => closeModal('folderEquipmentModal'));
    $('btnSaveFolderEquipment')?.addEventListener('click', saveFolderEquipment);

    // Modal de Personalização Visual da Pasta (Cores & Ícones - Sprint 1)
    $('btnCloseFolderVisualModal')?.addEventListener('click', () => closeModal('folderVisualModal'));
    $('btnCancelFolderVisual')?.addEventListener('click', () => closeModal('folderVisualModal'));
    $('btnSaveFolderVisual')?.addEventListener('click', saveFolderVisual);

    document.querySelectorAll('.color-dot-choice').forEach((dot) => {
      dot.addEventListener('click', () => {
        activeFolderColor = dot.dataset.color;
        updateFolderVisualPickersUI();
      });
    });

    document.querySelectorAll('.icon-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFolderIcon = btn.dataset.icon;
        updateFolderVisualPickersUI();
      });
    });

    // Modal de Criação de Atalho Virtual (Sprint 1)
    $('btnCloseCreateShortcutModal')?.addEventListener('click', () => closeModal('createShortcutModal'));
    $('btnCancelCreateShortcut')?.addEventListener('click', () => closeModal('createShortcutModal'));
    $('btnConfirmCreateShortcut')?.addEventListener('click', confirmCreateShortcut);

    // Controles da Barra Horizontal Superior do Cofre (Sprint 1 - V9.0)
    $('vaultAdvSearchInput')?.addEventListener('input', (e) => {
      state.vaultSearchQuery = e.target.value;
      $('btnVaultClearSearch')?.classList.toggle('hidden', !state.vaultSearchQuery);
      renderVaultTree();
      renderVaultFolderRightPane();
    });

    $('btnVaultClearSearch')?.addEventListener('click', () => {
      state.vaultSearchQuery = '';
      if ($('vaultAdvSearchInput')) $('vaultAdvSearchInput').value = '';
      $('btnVaultClearSearch')?.classList.add('hidden');
      renderVaultTree();
      renderVaultFolderRightPane();
    });

    $('btnVaultFilterFavorites')?.addEventListener('click', () => {
      state.vaultFavoritesOnly = !state.vaultFavoritesOnly;
      $('btnVaultFilterFavorites')?.classList.toggle('active', state.vaultFavoritesOnly);
      renderVaultFolderRightPane();
    });

    $('selectVaultSortMode')?.addEventListener('change', (e) => {
      state.vaultSearchSort = e.target.value;
      renderVaultFolderRightPane();
    });

    // Ações Rápidas em Lote no Cofre
    $('btnVaultQuickFav')?.addEventListener('click', async () => {
      const paths = Array.from(state.vaultSelectedFiles || []);
      if (!paths.length) return;
      try {
        await apiJson('/api/vault/meta', {
          method: 'POST',
          body: JSON.stringify({ paths, isFavorite: true }),
        });
        showToast(`${paths.length} item(ns) favoritado(s) ⭐`);
        await loadVaultTree(state.vaultFolder);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao favoritar: ${err.message}`, true);
      }
    });

    $('btnVaultQuickTags')?.addEventListener('click', () => {
      const paths = Array.from(state.vaultSelectedFiles || []);
      if (paths.length) openVaultTagsModal(paths);
    });

    $('btnVaultQuickShortcut')?.addEventListener('click', () => {
      const paths = Array.from(state.vaultSelectedFiles || []);
      if (!paths.length) return;
      const first = (state.vaultData?.files || []).find((f) => f.path === paths[0]);
      if (first) {
        const item = (state.catalog.items || []).find((it) => it.relativePath === first.path || it.originalFile === first.name);
        if (item) openCreateShortcutModal(item.id);
        else showToast('Este arquivo ainda não foi catalogado no portfólio.', true);
      }
    });

    // Eventos do Modal de Tags do Cofre
    $('btnCloseVaultTagsModal')?.addEventListener('click', () => closeModal('vaultTagsModal'));
    $('btnCancelVaultTags')?.addEventListener('click', () => closeModal('vaultTagsModal'));
    $('btnSaveVaultTags')?.addEventListener('click', saveVaultTagsModal);

    // Eventos do Menu de Contexto do Cofre (Botão Direito)
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#vaultContextMenu')) {
        closeVaultContextMenu();
      }
    });



    // --- SELETOR DE MODO DO EXPLORER: MEU COFRE vs PASTAS DO PORTFÓLIO ---
    $('btnVaultModeVault')?.addEventListener('click', () => {
      state.vaultMode = 'vault';
      state.vaultFolder = '';
      updateVaultModeButtons();
      loadVaultTree('');
    });

    $('btnVaultModePortfolio')?.addEventListener('click', () => {
      state.vaultMode = 'portfolio';
      state.vaultFolder = '';
      updateVaultModeButtons();
      loadVaultTree('');
    });

    // --- MENU ⋮ (3 PONTINHOS — MAIS AÇÕES NA BARRA DO COFRE) ---
    $('btnVaultQuickMore')?.addEventListener('click', (e) => {
      e.stopPropagation();
      $('vaultMoreActionsDropdown')?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#vaultQuickActionsWrap')) {
        $('vaultMoreActionsDropdown')?.classList.add('hidden');
      }
    });

    // Botões Principais da Barra Horizontal: atuam no item selecionado ou na pasta atual
    function getActiveTargetForBarActions() {
      const selected = Array.from(state.vaultSelectedFiles || []);
      if (selected.length > 0) {
        const first = (state.vaultData?.files || []).find((f) => f.path === selected[0]);
        return {
          type: 'file',
          path: selected[0],
          name: first?.name || selected[0].split('/').pop(),
          paths: selected,
        };
      }
      return {
        type: 'folder',
        path: state.vaultFolder || '',
        name: (state.vaultFolder || '').split('/').pop() || (state.vaultMode === 'portfolio' ? 'Portfólio' : 'stangorlini'),
        paths: state.vaultFolder ? [state.vaultFolder] : [],
      };
    }

    $('btnVaultQuickVisual')?.addEventListener('click', () => {
      const target = getActiveTargetForBarActions();
      const scopeKey = normalizeFolderScopeKey(target.path);
      openFolderVisualModal(scopeKey);
    });

    $('btnVaultQuickPortfolio')?.addEventListener('click', () => {
      const target = getActiveTargetForBarActions();
      const scopeKey = normalizeFolderScopeKey(target.path);
      toggleFolderPortfolioInclusion(scopeKey);
    });

    // Ações do Dropdown ⋮
    $('btnMoreActionPin')?.addEventListener('click', () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const target = getActiveTargetForBarActions();
      openFolderPinModal(target.path, false);
    });

    $('btnMoreActionShortcut')?.addEventListener('click', () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const target = getActiveTargetForBarActions();
      const item = (state.catalog.items || []).find((it) => it.relativePath === target.path || it.originalFile === target.name);
      if (item) {
        openCreateShortcutModal(item.id);
      } else {
        showToast('Para criar atalho virtual de arquivo no HD, inclua-o no portfólio primeiro.', true);
      }
    });

    $('btnMoreActionMove')?.addEventListener('click', async () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const target = getActiveTargetForBarActions();
      if (!target.path) {
        showToast('Não é permitido mover a raiz.', true);
        return;
      }
      const dest = prompt(`Mover "${target.name}" para qual pasta?`, state.vaultFolder || '');
      if (dest === null) return;
      try {
        await apiJson('/api/vault/move', {
          method: 'POST',
          body: JSON.stringify({ srcPath: target.path, destFolder: dest, drive: state.vaultActiveDrive }),
        });
        showToast(`"${target.name}" movido com sucesso!`);
        await loadVaultTree(dest);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao mover: ${err.message}`, true);
      }
    });

    $('btnMoreActionDelete')?.addEventListener('click', async () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const target = getActiveTargetForBarActions();
      if (!target.path) {
        showToast('Não é permitido excluir a raiz.', true);
        return;
      }
      if (!confirm(`Mover "${target.name}" para a Lixeira (.trash)?\nEle permanecerá seguro por 15 dias.`)) return;
      try {
        await apiJson('/api/vault/entry', {
          method: 'DELETE',
          body: JSON.stringify({ path: target.path, drive: state.vaultActiveDrive }),
        });
        showToast(`"${target.name}" movido para a Lixeira 🗑️`);
        await loadVaultTree(state.vaultFolder);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao excluir: ${err.message}`, true);
      }
    });

    $('btnMoreActionDeduplicator')?.addEventListener('click', () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      openDeduplicatorModal();
    });

    $('btnMoreActionTrash')?.addEventListener('click', () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      openTrashModal();
    });

        // Eventos Sprint 2: Lixeira Centralizada
    $('btnVaultOpenTrash')?.addEventListener('click', openTrashModal);
    $('btnEmptyTrash')?.addEventListener('click', handleEmptyTrash);

    // Eventos Sprint 2: Deduplicador (Caçador de Cópias)
    $('btnVaultOpenDeduplicator')?.addEventListener('click', openDeduplicatorModal);
    $('btnRunDeduplicationScan')?.addEventListener('click', runDeduplicationScan);

    // Eventos Sprint 2: Cofre PIN
    $('btnConfirmVaultPin')?.addEventListener('click', submitFolderPin);
    $('btnRemoveFolderPin')?.addEventListener('click', removeFolderPin);
    $('inputVaultPin')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitFolderPin();
    });

    // Menu de Contexto: Portfólio Opcional e PIN
    $('btnCtxTogglePortfolio')?.addEventListener('click', () => {
      if (!activeVaultContextMenuTarget || activeVaultContextMenuTarget.type !== 'folder') return;
      const targetPath = activeVaultContextMenuTarget.path;
      closeVaultContextMenu();
      toggleFolderPortfolioInclusion(targetPath);
    });

    $('btnCtxFolderPin')?.addEventListener('click', () => {
      if (!activeVaultContextMenuTarget || activeVaultContextMenuTarget.type !== 'folder') return;
      const targetPath = activeVaultContextMenuTarget.path;
      closeVaultContextMenu();
      openFolderPinModal(targetPath, false);
    });

    $('btnCtxFolderVisual')?.addEventListener('click', () => {
      if (!activeVaultContextMenuTarget) return;
      const fPath = activeVaultContextMenuTarget.path;
      closeVaultContextMenu();
      const cleanScope = normalizeFolderScopeKey(fPath);
      openFolderVisualModal(cleanScope);
    });

    $('btnCtxToggleFav')?.addEventListener('click', async () => {
      if (!activeVaultContextMenuTarget) return;
      const target = activeVaultContextMenuTarget;
      closeVaultContextMenu();
      const nextFav = !target.isFavorite;
      try {
        await apiJson('/api/vault/meta', {
          method: 'POST',
          body: JSON.stringify({
            paths: [target.path],
            isFolder: target.type === 'folder',
            scopeKey: target.type === 'folder' ? normalizeFolderScopeKey(target.path) : undefined,
            isFavorite: nextFav,
          }),
        });
        showToast(nextFav ? 'Marcado como favorito ⭐' : 'Removido dos favoritos');
        await loadVaultTree(state.vaultFolder);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao alterar favorito: ${err.message}`, true);
      }
    });

    $('btnCtxManageTags')?.addEventListener('click', () => {
      if (!activeVaultContextMenuTarget) return;
      const target = activeVaultContextMenuTarget;
      closeVaultContextMenu();
      openVaultTagsModal([target.path]);
    });

    $('btnCtxCreateShortcut')?.addEventListener('click', () => {
      if (!activeVaultContextMenuTarget) return;
      const target = activeVaultContextMenuTarget;
      closeVaultContextMenu();
      const item = (state.catalog.items || []).find((it) => it.relativePath === target.path || it.originalFile === target.name);
      if (item) {
        openCreateShortcutModal(item.id);
      } else {
        showToast('Para criar atalho virtual de arquivo no HD, inclua-o no portfólio primeiro.', true);
      }
    });

    $('btnCtxMove')?.addEventListener('click', async () => {
      if (!activeVaultContextMenuTarget) return;
      const target = activeVaultContextMenuTarget;
      closeVaultContextMenu();
      const dest = prompt(`Mover "${target.name}" para qual pasta no HD?
(Ex: portfolio/POLÍTICAS ou vault):`, state.vaultFolder || '');
      if (dest === null) return;
      try {
        await apiJson('/api/vault/move', {
          method: 'POST',
          body: JSON.stringify({ srcPath: target.path, destFolder: dest, drive: state.vaultActiveDrive }),
        });
        showToast(`"${target.name}" movido para "${dest}"!`);
        await loadVaultTree(dest);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao mover: ${err.message}`, true);
      }
    });

    $('btnCtxDelete')?.addEventListener('click', async () => {
      if (!activeVaultContextMenuTarget) return;
      const target = activeVaultContextMenuTarget;
      closeVaultContextMenu();
      if (!confirm(`Excluir permanentemente "${target.name}" do disco rígido?`)) return;
      try {
        await apiJson('/api/vault/entry', {
          method: 'DELETE',
          body: JSON.stringify({ path: target.path, drive: state.vaultActiveDrive }),
        });
        showToast(`"${target.name}" excluído com sucesso!`);
        await loadVaultTree(state.vaultFolder);
        loadPortfolio();
      } catch (err) {
        showToast(`Erro ao excluir: ${err.message}`, true);
      }
    });

    // Barra de Busca Global, Filtros e Ordenação (Sprint 1)
    $('globalSearchInput')?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      $('btnClearSearch')?.classList.toggle('hidden', !state.searchQuery);
      renderPortfolioGrid();
    });

    $('btnClearSearch')?.addEventListener('click', () => {
      state.searchQuery = '';
      if ($('globalSearchInput')) $('globalSearchInput').value = '';
      $('btnClearSearch')?.classList.add('hidden');
      renderPortfolioGrid();
    });

    $('btnFilterFavorites')?.addEventListener('click', () => {
      state.searchFavoritesOnly = !state.searchFavoritesOnly;
      $('btnFilterFavorites')?.classList.toggle('active', state.searchFavoritesOnly);
      renderPortfolioGrid();
    });

    $('selectSortMode')?.addEventListener('change', (e) => {
      state.searchSort = e.target.value;
      renderPortfolioGrid();
    });

    // Inicialização do Módulo de Atalhos de Teclado no Desktop (Sprint 1)
    if (typeof window.initKeyboardShortcuts === 'function') {
      window.initKeyboardShortcuts({
        onFocusSearch: () => {
          const input = $('globalSearchInput');
          if (input) {
            input.focus();
            input.select();
          }
        },
        onToggleSelectFocused: () => {
          if (state.lightboxIndex >= 0 && state.lightboxIndex < state.filteredPortfolio.length) {
            const it = state.filteredPortfolio[state.lightboxIndex];
            if (it) {
              const chk = document.querySelector(`[data-toggle-select-card="${CSS.escape(it.id)}"]`);
              chk?.click();
            }
          }
        },
        onToggleFavorite: async () => {
          if (state.lightboxIndex >= 0 && state.lightboxIndex < state.filteredPortfolio.length) {
            const it = state.filteredPortfolio[state.lightboxIndex];
            if (!it) return;
            const nextFav = !it.isFavorite;
            it.isFavorite = nextFav;
            try {
              await apiJson('/api/portfolio/items/meta', {
                method: 'PATCH',
                body: JSON.stringify({ itemIds: [it.id], isFavorite: nextFav }),
              });
              showToast(nextFav ? 'Foto adicionada aos favoritos ⭐' : 'Removida dos favoritos');
              renderPortfolioGrid();
            } catch (err) {
              it.isFavorite = !nextFav;
              showToast(`Erro ao favoritar: ${err.message}`, true);
            }
          }
        },
        onDeleteFocused: () => {
          if (state.lightboxIndex >= 0 && state.lightboxIndex < state.filteredPortfolio.length) {
            const it = state.filteredPortfolio[state.lightboxIndex];
            if (!it) return;
            const btn = document.querySelector(`[data-delete-photo="${CSS.escape(it.id)}"]`);
            if (btn) {
              btn.click();
            }
          }
        },
        onChangeFreeColumns: (cols) => {
          if (cols >= 1 && cols <= 5) {
            state.freeViewColsCount = cols;
            localStorage.setItem('portfolio_free_cols_count', String(cols));
            document.querySelectorAll('[data-free-col]').forEach((b) => {
              b.classList.toggle('active', parseInt(b.dataset.freeCol, 10) === cols);
              b.classList.toggle('bg-[#5A189A]', parseInt(b.dataset.freeCol, 10) === cols);
              b.classList.toggle('text-[#FFB703]', parseInt(b.dataset.freeCol, 10) === cols);
            });
            renderPortfolioGrid();
            showToast(`Visualização Livre: ${cols} coluna(s)`);
          }
        },
        onPrevSlide: () => {
          if (state.lightboxIndex > 0) {
            state.lightboxIndex--;
            renderLightboxSlide();
          }
        },
        onNextSlide: () => {
          if (state.lightboxIndex >= 0 && state.lightboxIndex < state.filteredPortfolio.length - 1) {
            state.lightboxIndex++;
            renderLightboxSlide();
          }
        },
        onEscape: () => {
          if (state.lightboxIndex >= 0) {
            closeLightbox();
          }
        },
      });
    }

    document.querySelectorAll('.folder-dev-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clicked = btn.dataset.dev;
        activeFolderDevType = activeFolderDevType === clicked ? null : clicked;
        updateFolderDevTypeButtons();
      });
    });

    $('btnAdminLogout')?.addEventListener('click', async () => {
      $('adminDropdownMenu')?.classList.add('hidden');
      try {
        await apiJson('/api/auth/logout', { method: 'POST' });
      } catch {}
      state.isAdmin = false;
      state.isVisitorViewOverride = false;
      state.isVisualEditMode = false;
      applyAdminUiState();
      switchView('portfolio');
      showToast('Sessão administrativa encerrada.');
    });

    // Switch Restaurado: Ver mais de uma coluna no mobile
    $('btnToggleMultiCol')?.addEventListener('click', () => {
      state.isMultiColMobile = !state.isMultiColMobile;
      localStorage.setItem('portfolio_multi_col_mobile', String(state.isMultiColMobile));
      updateMultiColSwitchUI();
    });

    // Seletor de colunas do estúdio (1 a 5) — Studio Dock do Portfólio
    document.querySelectorAll('[data-studio-col]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cols = Number(btn.dataset.studioCol);
        if (!state.catalog.settings) state.catalog.settings = {};
        if (!state.catalog.settings.layout) state.catalog.settings.layout = {};
        state.catalog.settings.layout.columnsDesktop = cols;
        document.querySelectorAll('[data-studio-col]').forEach((b) => {
          const active = Number(b.dataset.studioCol) === cols;
          b.classList.toggle('bg-[#5A189A]', active);
          b.classList.toggle('text-[#FFB703]', active);
          b.classList.toggle('font-bold', active);
        });
        markStudioDirty();
        applyGlobalLayoutVariables();
        renderPortfolioGrid();
      });
    });

    // Seletor de dispositivo da pasta atual (📱 Celular | 📷 Câmera) — Studio Dock
    document.querySelectorAll('[data-studio-dev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const devType = btn.dataset.studioDev;
        const scope = state.selectedSubalbum && state.selectedSubalbum !== 'ALL'
          ? `${state.selectedAlbum}::${state.selectedSubalbum}`
          : state.selectedAlbum;
        if (!scope || scope === 'ALL') {
          showToast('Selecione um álbum ou subálbum antes de definir o dispositivo.', true);
          return;
        }
        try {
          const res = await apiJson('/api/portfolio/folder-meta', {
            method: 'POST',
            body: JSON.stringify({ scopeKey: scope, deviceType: devType }),
          });
          if (res.success) {
            state.catalog.settings.layout.folderMeta = res.folderMeta;
            document.querySelectorAll('[data-studio-dev]').forEach((b) => {
              const active = b.dataset.studioDev === devType;
              b.classList.toggle('bg-[#5A189A]', active);
              b.classList.toggle('text-[#FFB703]', active);
            });
            showToast(`Dispositivo definido: ${devType === 'phone' ? '📱 Celular' : '📷 Câmera'}`);
            renderPortfolioGrid();
          }
        } catch (err) {
          showToast(`Erro ao definir dispositivo: ${err.message}`, true);
        }
      });
    });

    // Cofre Pessoal: Controles do VS Code Explorer
    $('btnVaultNewFolder')?.addEventListener('click', () => {
      promptCreateVaultFolder();
    });

    $('inputVaultFolder')?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) handleFolderUpload(files);
      e.target.value = '';
    });

    $('inputVaultZipUpload')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleZipUpload(file);
      e.target.value = '';
    });

    $('btnVaultDownloadZip')?.addEventListener('click', () => {
      handleDownloadFolderZip();
    });

    $('btnVaultRefreshTree')?.addEventListener('click', async () => {
      showToast('Atualizando arquivos do HD e sincronizando catálogo...');
      try {
        await apiJson('/api/portfolio/sync', { method: 'POST' }).catch(() => {});
        await loadVaultDrives();
        await loadVaultTree(state.vaultFolder);
        await loadPortfolio();
        showToast('HD e Portfólio sincronizados com sucesso!');
      } catch (err) {
        showToast(`Erro ao sincronizar: ${err.message}`, true);
      }
    });

    $('btnVaultDrawerClose')?.addEventListener('click', () => {
      $('vaultMobileDrawer')?.classList.remove('open');
    });

    $('vaultSearchInput')?.addEventListener('input', () => {
      renderVaultTree();
      if (!state.vaultSelectedFile) {
        renderVaultFolderRightPane();
      }
    });

    $('inputVaultFiles')?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      showToast(`Iniciando upload de ${files.length} arquivo(s) para o HD...`);
      for (const file of files) {
        try {
          await uploadVaultFileWithThumb(file, state.vaultFolder || '', state.vaultActiveDrive || '');
        } catch (err) {
          showToast(`Falha no upload de ${file.name}: ${err.message}`, true);
        }
      }
      e.target.value = '';
      showToast('Upload concluído no HD!');
      loadVaultTree(state.vaultFolder);
      loadPortfolio();
    });

    $('formLogin')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = $('inputAdminPassword').value;
      try {
        await apiJson('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        $('inputAdminPassword').value = '';
        closeModal('modalLogin');
        state.isAdmin = true;
        applyAdminUiState();
        $('adminDropdownMenu')?.classList.remove('hidden');
        showToast('Console do Fire Stick desbloqueado.');
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Portfólio Admin: Upload, Sync & Settings
    $('btnSyncPortfolioDisk')?.addEventListener('click', async () => {
      showToast('Sincronizando pastas e fotografias do HD...');
      try {
        const res = await apiJson('/api/portfolio/sync', { method: 'POST' });
        showToast(`Concluído! ${res.count} fotos indexadas em ${res.albums.length} categorias.`);
        await loadPortfolio();
        if (state.isAdmin) loadTelemetry();
      } catch (err) {
        showToast(err.message, true);
      }
    });

    $('btnToggleAllAlbums')?.addEventListener('click', () => {
      const allSections = document.querySelectorAll('.portfolio-album-section');
      if (!allSections.length) return;
      const anyOpen = Array.from(allSections).some((s) => !s.classList.contains('is-collapsed'));
      allSections.forEach((s) => {
        const alb = s.dataset.albumSection;
        if (anyOpen) {
          s.classList.add('is-collapsed');
          if (alb) state.collapsedAlbums.add(alb);
        } else {
          s.classList.remove('is-collapsed');
          if (alb) state.collapsedAlbums.delete(alb);
        }
      });
      localStorage.setItem('portfolio_collapsed_albums', JSON.stringify(Array.from(state.collapsedAlbums)));
      updateToggleAllBtnLabel();
      renderPortfolioGrid();
    });

    $('btnOpenPortfolioUpload')?.addEventListener('click', () => {
      state.selectedPortfolioFiles = [];
      $('inputPortfolioFiles').value = '';
      $('portfolioSelectedInfo').textContent = 'Nenhum arquivo selecionado';
      openModal('modalPortfolioUpload');
    });

    $('inputPortfolioFiles')?.addEventListener('change', (e) => {
      state.selectedPortfolioFiles = Array.from(e.target.files || []);
      $('portfolioSelectedInfo').textContent = state.selectedPortfolioFiles.length
        ? `${state.selectedPortfolioFiles.length} fotografia(s) pronta(s) para a fila`
        : 'Nenhum arquivo selecionado';
    });

    bindDropzone($('portfolioModalDrop'), (files) => {
      state.selectedPortfolioFiles = Array.from(files);
      $('portfolioSelectedInfo').textContent = `${state.selectedPortfolioFiles.length} fotografia(s) pronta(s) para a fila`;
    });

    $('formPortfolioUpload')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.selectedPortfolioFiles.length) {
        showToast('Selecione ao menos uma fotografia.', true);
        return;
      }
      const newAlbum = $('inputNewAlbumInline').value.trim();
      const album = newAlbum || $('selectPortfolioAlbum').value || 'Destaques';
      const title = $('inputPhotoTitlePrefix').value.trim();
      const description = $('inputPhotoDesc').value.trim();

      uploadQueue.enqueueFiles(state.selectedPortfolioFiles, {
        zone: 'portfolio',
        album,
        title,
        description,
      });

      $('inputNewAlbumInline').value = '';
      $('inputPhotoTitlePrefix').value = '';
      $('inputPhotoDesc').value = '';
      closeModal('modalPortfolioUpload');
    });

    // Estúdio de Diagramação ao Vivo ("Editar Visualização")
    $('btnToggleVisualStudio')?.addEventListener('click', () => {
      if (state.isVisualEditMode) {
        if (state.studioDirty) {
          if (!confirm('Existem alterações de layout não salvas. Deseja descartá-las e sair do modo de edição?')) {
            return;
          }
        }
        exitVisualStudio(state.studioDirty);
      } else {
        enterVisualStudio();
      }
    });

    $('btnCancelVisualStudio')?.addEventListener('click', () => {
      exitVisualStudio(true);
    });

    $('btnSaveVisualStudio')?.addEventListener('click', () => {
      saveVisualStudioLayout();
    });

    $('btnStudioNewAlbum')?.addEventListener('click', () => {
      if (!state.isAdmin) {
        showToast('Faça login como Admin para criar pastas físicas no HD.');
        openModal('modalLogin');
        return;
      }
      promptCreateFolderOrSubfolder(state.selectedAlbum !== 'ALL' ? state.selectedAlbum : '');
    });

    $('btnStudioRenameFolder')?.addEventListener('click', () => {
      if (!state.isAdmin) {
        showToast('Faça login como Admin para renomear pastas no HD.');
        openModal('modalLogin');
        return;
      }
      promptRenameCurrentFolder(
        state.selectedAlbum !== 'ALL' ? state.selectedAlbum : '',
        state.selectedSubalbum !== 'ALL' ? state.selectedSubalbum : ''
      );
    });

    $('btnStudioMoveItems')?.addEventListener('click', () => {
      if (!state.isAdmin) {
        showToast('Faça login como Admin para mover arquivos entre pastas do HD.');
        openModal('modalLogin');
        return;
      }
      if (!state.isVisualEditMode) {
        enterVisualStudio();
        showToast('Modo de seleção ativado: clique em "☐ Selecionar" nas fotos e depois em "⇄ Mover".');
        return;
      }
      promptMoveSelectedItems();
    });

    // Bind dos botões de preset de seção na barra Editar Visualização ('1', '2', '1+2', '2+1', '4', '6', '🎠 Carrossel')
    document.querySelectorAll('[data-dock-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.dockPreset;
        if (!preset) return;
        const layout = getLayoutSettings();
        const scopeKey =
          state.selectedAlbum === 'ALL'
            ? 'ALL'
            : state.selectedSubalbum && state.selectedSubalbum !== 'ALL'
            ? `${state.selectedAlbum}::${state.selectedSubalbum}`
            : state.selectedAlbum;

        if (!Array.isArray(layout.sections[scopeKey]) || layout.sections[scopeKey].length === 0) {
          ensureDefaultSectionsForScope(state.filteredPortfolio || [], scopeKey, layout);
        }

        // Atualiza a Seção 1 para o preset clicado (ou se clicar em Carrossel/outro com Shift, adiciona nova seção)
        if (layout.sections[scopeKey] && layout.sections[scopeKey].length > 0) {
          layout.sections[scopeKey][0].preset = preset;
        }

        document.querySelectorAll('[data-dock-preset]').forEach((b) => {
          const isMatch = b.dataset.dockPreset === preset;
          if (b.dataset.dockPreset !== 'carousel') {
            b.className = isMatch
              ? 'px-2.5 py-1 rounded bg-[#5A189A] border border-[#FFB703] text-xs font-mono text-[#E0FBFC] font-bold shadow transition-all'
              : 'px-2.5 py-1 rounded text-xs font-mono text-[#E0FBFC]/75 hover:text-[#E0FBFC] hover:bg-[#5A189A]/40 transition-all';
          }
        });

        markStudioDirty();
        renderPortfolioGrid();
        const pDef = WM_TILE_PRESETS.find((p) => p.id === preset);
        showToast(`Seção 1 atualizada para: ${pDef ? pDef.label : preset}`);
      });
    });

    $('btnStudioEditHeader')?.addEventListener('click', () => {
      const s = state.catalog.settings || {};
      $('inputSettingTag').value = s.accentTag || 'fotografia • física • código';
      $('inputSettingTitle').value = s.title || 'João Stangorlini';
      $('inputSettingSubtitle').value = s.subtitle || '';
      $('inputSettingAlbums').value = (state.catalog.albums || []).join(', ');
      openModal('modalPortfolioSettings');
    });

    document.querySelectorAll('#studioGridModeGroup .studio-seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layout = getLayoutSettings();
        layout.gridMode = btn.dataset.gridMode || 'masonry';
        markStudioDirty();
        applyGlobalLayoutVariables();
        renderPortfolioGrid();
      });
    });

    const updateGapValue = (val) => {
      const layout = getLayoutSettings();
      layout.gapPx = Math.max(4, Math.min(44, Number(val) || 18));
      markStudioDirty();
      applyGlobalLayoutVariables();
      requestAnimationFrame(updateMasonrySpans);
    };

    const updateRadiusValue = (val) => {
      const layout = getLayoutSettings();
      layout.borderRadiusPx = Math.max(0, Math.min(36, Number(val) ?? 16));
      markStudioDirty();
      applyGlobalLayoutVariables();
    };

    $('studioGapSlider')?.addEventListener('input', (e) => {
      updateSliderTrack(e.target);
      updateGapValue(e.target.value);
    });
    $('btnGapMinus')?.addEventListener('click', () => updateGapValue((getLayoutSettings().gapPx ?? 18) - 2));
    $('btnGapPlus')?.addEventListener('click', () => updateGapValue((getLayoutSettings().gapPx ?? 18) + 2));

    $('studioRadiusSlider')?.addEventListener('input', (e) => {
      updateSliderTrack(e.target);
      updateRadiusValue(e.target.value);
    });
    $('btnRadiusMinus')?.addEventListener('click', () => updateRadiusValue((getLayoutSettings().borderRadiusPx ?? 16) - 2));
    $('btnRadiusPlus')?.addEventListener('click', () => updateRadiusValue((getLayoutSettings().borderRadiusPx ?? 16) + 2));

    $('formPortfolioSettings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const albums = $('inputSettingAlbums')
        .value.split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      try {
        await apiJson('/api/portfolio/settings', {
          method: 'PATCH',
          body: JSON.stringify({
            accentTag: $('inputSettingTag').value.trim(),
            title: $('inputSettingTitle').value.trim(),
            subtitle: $('inputSettingSubtitle').value.trim(),
            albums,
          }),
        });
        closeModal('modalPortfolioSettings');
        showToast('Assinatura e álbuns do portfólio salvos.');
        await loadPortfolio();
        if (state.isVisualEditMode) {
          state.studioSnapshot = JSON.parse(JSON.stringify(state.catalog));
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    $('formEditPhoto')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('editPhotoId').value;
      const title = $('editPhotoTitle').value.trim();
      const newAlb = $('editPhotoNewAlbum').value.trim();
      const album = newAlb || $('editPhotoAlbumSelect').value || 'Destaques';
      const description = $('editPhotoDesc').value.trim();

      const item = (state.catalog.items || []).find((x) => x.id === id);
      if (!item) return;

      if (String(id).startsWith('mock_')) {
        item.title = title || item.title;
        item.album = album;
        item.description = description;
        if (!state.catalog.albums.includes(album)) {
          state.catalog.albums.push(album);
        }
        $('editPhotoNewAlbum').value = '';
        closeModal('modalEditPhoto');
        markStudioDirty();
        renderAlbumPills();
        renderPortfolioGrid();
        showToast('Metadados atualizados na visualização.');
        return;
      }

      try {
        await apiJson(`/api/portfolio/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, album, description }),
        });
        $('editPhotoNewAlbum').value = '';
        closeModal('modalEditPhoto');
        showToast('Fotografia atualizada.');
        await loadPortfolio();
        if (state.isVisualEditMode) {
          state.studioSnapshot = JSON.parse(JSON.stringify(state.catalog));
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Cofre Pessoal (Vault Dropzone)
    bindDropzone($('vaultDropzone'), (files) => {
      uploadQueue.enqueueFiles(files, { zone: 'vault', folder: state.vaultFolder });
    });

    // Telemetria & HUB Media
    $('btnRecalcDisk')?.addEventListener('click', async () => {
      $('labelRecalcDisk').textContent = 'Recalculando...';
      try {
        await apiJson('/api/server/telemetry/recalculate', { method: 'POST' });
        await loadTelemetry();
        showToast('Contabilidade física do HD recalculada.');
      } catch (err) {
        showToast(err.message, true);
      } finally {
        $('labelRecalcDisk').textContent = 'Recalcular Disco';
      }
    });

    $('inputHubFiles')?.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        uploadQueue.enqueueFiles(e.target.files, { zone: 'hub' });
        e.target.value = '';
      }
    });

    bindDropzone($('hubDropzone'), (files) => {
      uploadQueue.enqueueFiles(files, { zone: 'hub' });
    });

    $('hubTypeFilters')?.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.hubType = btn.dataset.type;
        $('hubTypeFilters')?.querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', b === btn));
        loadHubMedia();
      });
    });

    let hubSearchTimer = null;
    $('hubSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(hubSearchTimer);
      hubSearchTimer = setTimeout(() => {
        state.hubQuery = e.target.value.trim();
        loadHubMedia();
      }, 220);
    });

    $('hubSortSelect')?.addEventListener('change', (e) => {
      state.hubSort = e.target.value;
      loadHubMedia();
    });

    // Fila Flutuante
    $('btnToggleQueueBody')?.addEventListener('click', () => {
      uploadQueue.minimized = !uploadQueue.minimized;
      $('btnToggleQueueBody').textContent = uploadQueue.minimized ? 'Expandir' : 'Minimizar';
      uploadQueue.render();
    });

    $('btnClearFinishedQueue')?.addEventListener('click', () => uploadQueue.clearFinished());

    // Cinema Lightbox Controles, Zoom Livre (até 25x), Pan, Swipe, Pinch-to-Zoom & Clique Fora
    $('lbBtnClose')?.addEventListener('click', closeLightbox);
    $('lbBtnPrev')?.addEventListener('click', () => stepLightbox(-1));
    $('lbBtnNext')?.addEventListener('click', () => stepLightbox(1));
    $('lbBtnZoomIn')?.addEventListener('click', () => adjustLightboxZoomAtPoint(state.lbZoom * 1.35));
    $('lbBtnZoomOut')?.addEventListener('click', () => adjustLightboxZoomAtPoint(state.lbZoom / 1.35));
    $('lbBtnResetZoom')?.addEventListener('click', () => resetLightboxTransform());
    $('lbBtnFeature')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = state.filteredPortfolio[state.lightboxIndex];
      if (!item) return;
      await toggleItemFeatured(item.id);
      renderLightboxFeatureButton();
    });
    $('lbBtnFavorite')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!state.isAdmin || state.isVisitorViewOverride) return;
      const item = state.filteredPortfolio[state.lightboxIndex];
      if (!item) return;
      const nextFav = !item.isFavorite;
      item.isFavorite = nextFav;
      renderLightboxFavButton();
      try {
        await apiJson('/api/portfolio/items/meta', {
          method: 'PATCH',
          body: JSON.stringify({ itemIds: [item.id], isFavorite: nextFav }),
        });
        showToast(nextFav ? '⭐ Foto adicionada aos favoritos!' : 'Removida dos favoritos');
        renderPortfolioGrid();
      } catch (err) {
        item.isFavorite = !nextFav;
        renderLightboxFavButton();
        showToast(`Erro ao favoritar: ${err.message}`, true);
      }
    });
    $('lbBtnFullscreen')?.addEventListener('click', () => {
      const lb = $('cinemaLightbox');
      if (!document.fullscreenElement) lb.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.().catch(() => {});
    });

    const stage = $('lbStage');
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
        adjustLightboxZoomAtPoint(state.lbZoom * factor, e.clientX, e.clientY);
      },
      { passive: false }
    );

    stage.addEventListener('dblclick', (e) => {
      if (state.lbZoom > 1.0) {
        resetLightboxTransform();
      } else {
        adjustLightboxZoomAtPoint(2.8, e.clientX, e.clientY);
      }
    });

    let isPanning = false;
    let isPinching = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let startX = 0;
    let startY = 0;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let pointerMovedDist = 0;

    // Gestos Multitoque Mobile: Pinch-to-Zoom (2 dedos) & Double-Tap (1 dedo)
    stage.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          isPinching = true;
          isPanning = false;
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
          pinchStartZoom = state.lbZoom;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          const t = e.touches[0];
          const dt = now - lastTapTime;
          const dist = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
          if (dt > 40 && dt < 280 && dist < 32) {
            e.preventDefault();
            if (state.lbZoom > 1.05) {
              resetLightboxTransform();
            } else {
              adjustLightboxZoomAtPoint(2.8, t.clientX, t.clientY);
            }
            lastTapTime = 0;
          } else {
            lastTapTime = now;
            lastTapX = t.clientX;
            lastTapY = t.clientY;
          }
        }
      },
      { passive: false }
    );

    stage.addEventListener(
      'touchmove',
      (e) => {
        if (isPinching && e.touches.length === 2) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const curDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
          const midX = (t1.clientX + t2.clientX) / 2;
          const midY = (t1.clientY + t2.clientY) / 2;
          const targetZoom = pinchStartZoom * (curDist / pinchStartDist);
          adjustLightboxZoomAtPoint(targetZoom, midX, midY);
        }
      },
      { passive: false }
    );

    stage.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        setTimeout(() => {
          isPinching = false;
        }, 80);
      }
    });

    stage.addEventListener('pointerdown', (e) => {
      if (isPinching) return;
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
      pointerMovedDist = 0;
      if (state.lbZoom > 1.0) {
        isPanning = true;
        startX = e.clientX - state.lbPanX;
        startY = e.clientY - state.lbPanY;
        stage.classList.add('dragging');
        stage.setPointerCapture?.(e.pointerId);
      }
    });

    stage.addEventListener('pointermove', (e) => {
      pointerMovedDist = Math.hypot(e.clientX - swipeStartX, e.clientY - swipeStartY);
      if (!isPanning || isPinching) return;
      state.lbPanX = e.clientX - startX;
      state.lbPanY = e.clientY - startY;
      applyLightboxTransform();
    });

    stage.addEventListener('pointerup', (e) => {
      if (isPanning) {
        isPanning = false;
        stage.classList.remove('dragging');
        return;
      }
      if (isPinching) return;
      const dx = e.clientX - swipeStartX;
      if (state.lbZoom === 1.0 && Math.abs(dx) > 55) {
        stepLightbox(dx < 0 ? 1 : -1);
      }
    });

    // Clique em qualquer espaço vazio fora da fotografia fecha o Lightbox imediatamente
    stage.addEventListener('click', (e) => {
      if (pointerMovedDist > 12 || isPinching) return;
      if (e.target === stage || e.target.id === 'lbCanvas') {
        closeLightbox();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (state.lightboxIndex === -1) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') stepLightbox(1);
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === '+' || e.key === '=') adjustLightboxZoomAtPoint(state.lbZoom * 1.35);
      else if (e.key === '-') adjustLightboxZoomAtPoint(state.lbZoom / 1.35);
      else if (e.key === '0') resetLightboxTransform();
      else if (e.key === 'f' || e.key === 'F') $('lbBtnFullscreen')?.click();
    });
  }

  // ==========================================================================
  // FUNÇÕES AUXILIARES V4 (TEMA, CARROSSEL, SUBPASTAS, CONTATO, STATUS)
  // ==========================================================================
  function initTheme() {
    const params = new URLSearchParams(window.location.search);
    const qTheme = params.get('theme');
    const saved = qTheme === 'light' || qTheme === 'dark' ? qTheme : localStorage.getItem('portfolio_theme') || 'dark';
    setTheme(saved);

    $('btnThemeToggle')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
      showToast(next === 'light' ? 'Modo Claro Editorial ativado' : 'Modo Escuro ativado');
    });
  }

  function setTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
      if ($('themeToggleIcon')) $('themeToggleIcon').textContent = 'light_mode';
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      if ($('themeToggleIcon')) $('themeToggleIcon').textContent = 'dark_mode';
    }
    localStorage.setItem('portfolio_theme', theme);
    const meta = $('metaThemeColor');
    if (meta) {
      meta.content = theme === 'light' ? '#FAF8F5' : '#0B1320';
    }
  }

  function initSubfolderMode() {
    state.subfolderViewMode = localStorage.getItem('subfolder_view_mode') || 'full';
    applySubfolderModeUi();

    $('btnModeFullAlbum')?.addEventListener('click', () => {
      state.subfolderViewMode = 'full';
      localStorage.setItem('subfolder_view_mode', 'full');
      applySubfolderModeUi();
      renderPortfolioGrid();
      showToast('Visualização: Álbum Completo (Diretão)');
    });

    $('btnModeBySubfolders')?.addEventListener('click', () => {
      state.subfolderViewMode = 'subfolders';
      localStorage.setItem('subfolder_view_mode', 'subfolders');
      applySubfolderModeUi();
      renderPortfolioGrid();
      showToast('Visualização: Filtrar por Subpastas');
    });
  }

  function applySubfolderModeUi() {
    const isFull = state.subfolderViewMode === 'full';
    const btnFull = $('btnModeFullAlbum');
    const btnSub = $('btnModeBySubfolders');
    if (btnFull) {
      btnFull.className = isFull
        ? 'subfolder-mode-btn active px-3.5 py-1.5 rounded-lg bg-[#5A189A] text-[#E0FBFC] text-xs font-bold shadow flex items-center gap-1.5'
        : 'subfolder-mode-btn px-3.5 py-1.5 rounded-lg text-[#E0FBFC]/70 hover:text-[#E0FBFC] text-xs font-medium flex items-center gap-1.5';
    }
    if (btnSub) {
      btnSub.className = !isFull
        ? 'subfolder-mode-btn active px-3.5 py-1.5 rounded-lg bg-[#5A189A] text-[#E0FBFC] text-xs font-bold shadow flex items-center gap-1.5'
        : 'subfolder-mode-btn px-3.5 py-1.5 rounded-lg text-[#E0FBFC]/70 hover:text-[#E0FBFC] text-xs font-medium flex items-center gap-1.5';
    }
    const chipsWrap = $('subfolderChipsContainer');
    if (chipsWrap) {
      chipsWrap.classList.remove('hidden');
    }
  }

  function renderFeaturedCarousel() {
    const track = $('carouselTrack');
    if (!track) return;
    const items = state.catalog.items || [];
    if (items.length === 0) {
      track.innerHTML = '<div class="py-6 px-4 text-xs font-mono text-[#E0FBFC]/60">Conecte o disco para carregar as fotos em destaque.</div>';
      return;
    }
    const featured = items.slice(0, 10);
    track.innerHTML = featured
      .map((it, idx) => {
        const thumb = it.thumbUrl || it.originalUrl || '';
        const title = it.title || it.fileName || `Obra #${idx + 1}`;
        const album = it.album || 'Destaques';
        return `
          <div class="photo-matte-frame rounded-[14px] w-[31%] min-w-[280px] shrink-0 h-[210px] relative cursor-pointer" role="button" tabindex="0" onclick="window.openFeaturedLightbox('${escapeHtml(it.id)}')">
            <img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" class="max-h-[170px] max-w-full w-auto object-contain rounded-md" loading="lazy" />
            <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-[#0B1320]/80 border border-[#5A189A] text-[10px] font-mono text-[#FFB703] font-bold">${escapeHtml(album)}</span>
          </div>
        `;
      })
      .join('');
  }

  window.openFeaturedLightbox = (id) => {
    const idx = (state.filteredPortfolio || []).findIndex((x) => x.id === id);
    if (idx >= 0) {
      openLightbox(idx);
    } else {
      const item = (state.catalog.items || []).find((x) => x.id === id);
      if (item) {
        state.filteredPortfolio = [item];
        openLightbox(0);
      }
    }
  };

  // ==========================================================================
  // MODO DE EXIBIÇÃO DO VISITANTE ("EM SEÇÕES" vs "VISUALIZAÇÃO LIVRE") & EMBED IFRAME
  // ==========================================================================
  function updateViewModeSwitcherUI() {
    const isSections = state.portfolioDisplayMode !== 'free';
    const btnSec = $('btnDisplayModeSections');
    const btnFree = $('btnDisplayModeFree');
    const freeSubControls = $('freeViewSubControls');

    const activeModeCls = 'subfolder-mode-btn active px-3 py-1.5 rounded-lg bg-[#5A189A] text-[#E0FBFC] text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer transition-all';
    const inactiveModeCls = 'subfolder-mode-btn px-3 py-1.5 rounded-lg text-[#E0FBFC]/75 hover:text-[#E0FBFC] text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all';

    if (btnSec) btnSec.className = isSections ? activeModeCls : inactiveModeCls;
    if (btnFree) btnFree.className = !isSections ? activeModeCls : inactiveModeCls;
    if (freeSubControls) freeSubControls.classList.toggle('hidden', isSections);

    const isVert = state.freeViewDirection !== 'carousel';
    const btnVert = $('btnFreeDirVertical');
    const btnCar = $('btnFreeDirCarousel');
    const colsGroup = $('freeColsToggleGroup');

    const activeSubCls = 'subfolder-mode-btn active px-2.5 py-1 rounded-lg bg-[#5A189A] text-[#E0FBFC] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all';
    const inactiveSubCls = 'subfolder-mode-btn px-2.5 py-1 rounded-lg text-[#E0FBFC]/75 hover:text-[#E0FBFC] text-xs font-medium flex items-center gap-1 cursor-pointer transition-all';

    if (btnVert) btnVert.className = isVert ? activeSubCls : inactiveSubCls;
    if (btnCar) btnCar.className = !isVert ? activeSubCls : inactiveSubCls;
    if (colsGroup) colsGroup.classList.toggle('hidden', !isVert);

    const currentCols = parseInt(state.freeViewColsCount, 10) || 4;
    document.querySelectorAll('[data-free-col]').forEach((btn) => {
      const c = parseInt(btn.dataset.freeCol, 10);
      const isSel = c === currentCols;
      btn.className = `subfolder-mode-btn px-2 py-0.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
        isSel ? 'active bg-[#5A189A] text-[#FFB703] border border-[#FFB703]/60 shadow' : 'text-[#E0FBFC]/70 hover:text-[#E0FBFC]'
      }`;
    });
  }

  function initViewModeSwitcher() {
    state.freeViewColsCount = parseInt(localStorage.getItem('portfolio_free_cols_count'), 10) || 4;
    updateViewModeSwitcherUI();

    $('btnDisplayModeSections')?.addEventListener('click', () => {
      state.portfolioDisplayMode = 'sections';
      localStorage.setItem('portfolio_display_mode', 'sections');
      updateViewModeSwitcherUI();
      renderPortfolioGrid();
    });

    $('btnDisplayModeFree')?.addEventListener('click', () => {
      state.portfolioDisplayMode = 'free';
      localStorage.setItem('portfolio_display_mode', 'free');
      updateViewModeSwitcherUI();
      renderPortfolioGrid();
    });

    $('btnFreeDirVertical')?.addEventListener('click', () => {
      state.freeViewDirection = 'vertical';
      localStorage.setItem('portfolio_free_dir', 'vertical');
      updateViewModeSwitcherUI();
      renderPortfolioGrid();
    });

    $('btnFreeDirCarousel')?.addEventListener('click', () => {
      state.freeViewDirection = 'carousel';
      state.freeCarouselIndex = 0;
      localStorage.setItem('portfolio_free_dir', 'carousel');
      updateViewModeSwitcherUI();
      renderPortfolioGrid();
    });

    document.querySelectorAll('[data-free-col]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.freeCol, 10) || 4;
        state.freeViewColsCount = val;
        localStorage.setItem('portfolio_free_cols_count', String(val));
        updateViewModeSwitcherUI();
        renderPortfolioGrid();
      });
    });
  }

  function updateEmbedGeneratorCodeSnippets() {
    const dir = state.embedGeneratorLayout || 'vertical';
    const btnVert = $('btnEmbedGenLayoutVertical');
    const btnHoriz = $('btnEmbedGenLayoutHorizontal');
    const activeCls = 'subfolder-mode-btn active px-3 py-1 rounded-md bg-[#5A189A] text-[#E0FBFC] text-xs font-bold cursor-pointer';
    const inactiveCls = 'subfolder-mode-btn px-3 py-1 rounded-md text-[#E0FBFC]/75 hover:text-[#E0FBFC] text-xs font-medium cursor-pointer';

    if (btnVert) btnVert.className = dir === 'vertical' ? activeCls : inactiveCls;
    if (btnHoriz) btnHoriz.className = dir === 'horizontal' ? activeCls : inactiveCls;

    const baseOrigin = window.location.origin.includes('localhost')
      ? 'https://storage.hublabdiv.com.br'
      : window.location.origin;

    const urlShowFisica = `${baseOrigin}/?embed=1&album=SHOW%20DE%20FISICA&layout=${dir}`;
    const urlFullPortfolio = `${baseOrigin}/?embed=1&layout=${dir}`;

    const codeShowFisica = `<iframe\n  src="${urlShowFisica}"\n  width="100%"\n  height="85vh"\n  style="width:100%; height:85vh; border:0; border-radius:16px; overflow:auto; background:#0B1320;"\n  loading="lazy"\n  allowfullscreen\n></iframe>`;

    const codeFullPortfolio = `<iframe\n  src="${urlFullPortfolio}"\n  width="100%"\n  height="85vh"\n  style="width:100%; height:85vh; border:0; border-radius:16px; overflow:auto; background:#0B1320;"\n  loading="lazy"\n  allowfullscreen\n></iframe>`;

    if ($('textareaEmbedShowFisica')) $('textareaEmbedShowFisica').value = codeShowFisica;
    if ($('textareaEmbedFullPortfolio')) $('textareaEmbedFullPortfolio').value = codeFullPortfolio;

    $('btnCopyEmbedUrlShowFisica')?.setAttribute('data-copy-url', urlShowFisica);
    $('btnCopyEmbedUrlFullPortfolio')?.setAttribute('data-copy-url', urlFullPortfolio);
  }

  function initEmbedGeneratorModal() {
    const openGen = () => {
      $('adminDropdownMenu')?.classList.add('hidden');
      updateEmbedGeneratorCodeSnippets();
      openModal('modalEmbedGenerator');
    };

    $('btnDropdownEmbedCode')?.addEventListener('click', openGen);
    $('btnDockEmbedCode')?.addEventListener('click', openGen);

    $('btnEmbedGenLayoutVertical')?.addEventListener('click', () => {
      state.embedGeneratorLayout = 'vertical';
      updateEmbedGeneratorCodeSnippets();
    });

    $('btnEmbedGenLayoutHorizontal')?.addEventListener('click', () => {
      state.embedGeneratorLayout = 'horizontal';
      updateEmbedGeneratorCodeSnippets();
    });

    $('btnCopyEmbedUrlShowFisica')?.addEventListener('click', async () => {
      const url = $('btnCopyEmbedUrlShowFisica')?.dataset?.copyUrl || '';
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link direto (Show de Física) copiado!');
      } catch {
        prompt('Copie o link direto:', url);
      }
    });

    $('btnCopyEmbedUrlFullPortfolio')?.addEventListener('click', async () => {
      const url = $('btnCopyEmbedUrlFullPortfolio')?.dataset?.copyUrl || '';
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link direto (Portfólio Completo) copiado!');
      } catch {
        prompt('Copie o link direto:', url);
      }
    });

    $('btnCopyEmbedShowFisica')?.addEventListener('click', async () => {
      const val = $('textareaEmbedShowFisica')?.value || '';
      try {
        await navigator.clipboard.writeText(val);
        showToast('Código Iframe (Show de Física) copiado!');
      } catch {
        $('textareaEmbedShowFisica')?.select();
        document.execCommand('copy');
        showToast('Código Iframe copiado!');
      }
    });

    $('btnCopyEmbedFullPortfolio')?.addEventListener('click', async () => {
      const val = $('textareaEmbedFullPortfolio')?.value || '';
      try {
        await navigator.clipboard.writeText(val);
        showToast('Código Iframe (Portfólio Completo) copiado!');
      } catch {
        $('textareaEmbedFullPortfolio')?.select();
        document.execCommand('copy');
        showToast('Código Iframe copiado!');
      }
    });
  }

  function initEmbedMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const isEmbed = urlParams.get('embed') === '1';
    if (!isEmbed) return false;

    state.isEmbedMode = true;
    document.body.classList.add('is-embed-mode');

    const rawLayout = (urlParams.get('layout') || 'vertical').toLowerCase();
    state.embedFixedLayout = rawLayout === 'horizontal' || rawLayout === 'carousel' ? 'horizontal' : 'vertical';

    const rawAlbum = (urlParams.get('album') || '').trim();
    if (rawAlbum) {
      state.embedLockedAlbum = rawAlbum;
      state.selectedAlbum = rawAlbum;
      $('albumPills')?.classList.add('hidden');
    }

    $('topSiteHeader')?.classList.add('hidden');
    $('heroIntroSection')?.classList.add('hidden');
    $('sectionContact')?.classList.add('hidden');
    $('sectionAppsGithub')?.classList.add('hidden');
    $('viewModeSwitcherBar')?.classList.add('hidden');
    $('siteFooter')?.classList.add('hidden');
    $('embedViewContainer')?.classList.add('hidden');
    $('mainSiteContainer')?.classList.remove('hidden');

    return true;
  }

  function initCarouselNav() {
    const track = $('carouselTrack');
    $('carouselPrev')?.addEventListener('click', () => {
      if (track) track.scrollBy({ left: -Math.max(300, track.clientWidth * 0.75), behavior: 'smooth' });
    });
    $('carouselNext')?.addEventListener('click', () => {
      if (track) track.scrollBy({ left: Math.max(300, track.clientWidth * 0.75), behavior: 'smooth' });
    });
  }

  function initContactModal() {
    $('btnOpenContactModal')?.addEventListener('click', () => openModal('modalContact'));
    $('btnFooterContact')?.addEventListener('click', () => openModal('modalContact'));

    $('formAurtisticBeta')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('inputAurtisticBetaEmail');
      const btn = $('btnSubmitAurtisticBeta');
      const feedback = $('aurtisticBetaFeedback');
      const email = input ? input.value.trim() : '';
      if (!email) return;

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Enviando...';
      }
      try {
        const res = await apiJson('/api/beta-signup', {
          method: 'POST',
          body: JSON.stringify({ email, app: 'aurtistic' }),
        });
        if (input) input.value = '';
        if (feedback) {
          feedback.textContent = `✓ ${res.message || 'E-mail registrado na lista do Beta!'}`;
          feedback.className = 'text-[11px] font-mono text-emerald-400';
          feedback.classList.remove('hidden');
        }
        showToast(res.message || 'E-mail registrado na lista do Beta do Aurtistic!');
      } catch (err) {
        if (feedback) {
          feedback.textContent = `✕ ${err.message}`;
          feedback.className = 'text-[11px] font-mono text-rose-400';
          feedback.classList.remove('hidden');
        }
        showToast(err.message, true);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Testar Beta';
        }
      }
    });
  }

  function initServerHealthPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (res.ok) {
          $('serverPulseDot')?.classList.remove('offline');
          if ($('serverStatusText')) $('serverStatusText').textContent = 'Online';
        } else {
          $('serverPulseDot')?.classList.add('offline');
          if ($('serverStatusText')) $('serverStatusText').textContent = 'Instável';
        }
      } catch {
        $('serverPulseDot')?.classList.add('offline');
        if ($('serverStatusText')) $('serverStatusText').textContent = 'Offline';
      }
    }, 15000);
  }


  async function checkVaultPinAndOpen(scopeKey = 'vault') {
    try {
      const res = await apiJson(`/api/vault/pin/status?scopeKey=${encodeURIComponent(scopeKey)}`);
      if (!res.hasPin) {
        // Primeiro acesso: Definir senha do cofre
        const modal = $('modalVaultPinSetup');
        if (modal) {
          if ($('inputSetupPin')) $('inputSetupPin').value = '';
          if ($('inputSetupPinConfirm')) $('inputSetupPinConfirm').value = '';
          modal.classList.remove('hidden');
        }
        return;
      }

      if (!res.isUnlocked) {
        // Pasta protegida com senha: pedir senha
        openVaultPinModal(scopeKey);
        return;
      }

      // Já destrancada na sessão: abre normalmente
      state.vaultExpandedPaths.add(scopeKey);
      state.vaultSelectedFile = null;
      loadVaultTree(scopeKey);
    } catch (err) {
      showToast('Erro ao verificar status de proteção do cofre: ' + err.message, true);
    }
  }

  function initSprint3AndExplorerUpgrades() {
    // -------------------------------------------------------------------------
    // 1. ATALHOS RÁPIDOS AO LADO DO NOME (stangorlini)
    // -------------------------------------------------------------------------
    $('btnQuickNewFolder')?.addEventListener('click', () => {
      openVaultNewFolderModal();
    });

    $('btnQuickNewTxt')?.addEventListener('click', () => {
      const modal = $('modalCreateTxt');
      if (modal) {
        if ($('inputNewTxtName')) $('inputNewTxtName').value = '';
        if ($('inputNewTxtContent')) $('inputNewTxtContent').value = '';
        modal.classList.remove('hidden');
        setTimeout(() => $('inputNewTxtName')?.focus(), 100);
      }
    });

    $('btnQuickSync')?.addEventListener('click', async () => {
      showToast('Sincronizando com o disco...', false);
      await loadVaultTree(state.vaultFolder);
      showToast('Catálogo e arquivos sincronizados com sucesso! 🔄', false);
    });

    // Modal Salvar Arquivo .txt
    $('btnConfirmCreateTxt')?.addEventListener('click', async () => {
      const filename = ($('inputNewTxtName')?.value || '').trim();
      const content = $('inputNewTxtContent')?.value || '';
      if (!filename) {
        showToast('Informe o nome do arquivo .txt', true);
        return;
      }

      try {
        const driveParam = state.vaultActiveDrive ? `?drive=${encodeURIComponent(state.vaultActiveDrive)}` : '';
        const res = await apiJson(`/api/vault/create-txt${driveParam}`, {
          method: 'POST',
          body: JSON.stringify({
            folder: state.vaultFolder || '',
            filename,
            content,
          }),
        });

        $('modalCreateTxt')?.classList.add('hidden');
        showToast(res.message || 'Arquivo .txt criado com sucesso! 📄', false);
        await loadVaultTree(state.vaultFolder);
      } catch (err) {
        showToast('Erro ao criar arquivo: ' + err.message, true);
      }
    });

    // -------------------------------------------------------------------------
    // 2. FIRST-TIME SETUP DE SENHA DO COFRE
    // -------------------------------------------------------------------------
    $('btnConfirmSetupPin')?.addEventListener('click', async () => {
      const pin = ($('inputSetupPin')?.value || '').trim();
      const confirmPin = ($('inputSetupPinConfirm')?.value || '').trim();

      if (!pin || pin.length < 4 || pin.length > 8) {
        showToast('O PIN/Senha deve conter entre 4 e 8 dígitos.', true);
        return;
      }

      if (pin !== confirmPin) {
        showToast('A confirmação de senha não confere.', true);
        return;
      }

      try {
        const res = await apiJson('/api/vault/pin/setup', {
          method: 'POST',
          body: JSON.stringify({
            scopeKey: 'vault',
            pin,
            confirmPin,
          }),
        });

        $('modalVaultPinSetup')?.classList.add('hidden');
        showToast('Senha do Cofre definida com sucesso! Cofre destrancado. 🔓', false);
        state.vaultExpandedPaths.add('vault');
        state.vaultSelectedFile = null;
        await loadVaultTree('vault');
      } catch (err) {
        showToast('Erro ao configurar senha: ' + err.message, true);
      }
    });

    // -------------------------------------------------------------------------
    // 3. FLOATING ACTION BUTTON (FAB) & SPEED DIAL
    // -------------------------------------------------------------------------
    let isFabOpen = false;
    const fabMain = $('btnVaultFabMain');
    const fabDial = $('vaultSpeedDial');
    const fabIcon = $('fabMainIcon');

    function toggleFab(open = null) {
      isFabOpen = open !== null ? open : !isFabOpen;
      if (isFabOpen) {
        fabDial?.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
        fabIcon?.classList.add('rotate-45');
      } else {
        fabDial?.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
        fabIcon?.classList.remove('rotate-45');
      }
    }

    fabMain?.addEventListener('click', () => toggleFab());

    // Fechar Speed Dial ao clicar fora
    document.addEventListener('click', (e) => {
      if (isFabOpen && !e.target.closest('#vaultFabContainer')) {
        toggleFab(false);
      }
    });

    $('btnFabUpload')?.addEventListener('click', () => {
      toggleFab(false);
      $('inputVaultFiles')?.click();
    });

    $('btnFabNewFolder')?.addEventListener('click', () => {
      toggleFab(false);
      openVaultNewFolderModal();
    });

    $('btnFabNewTxt')?.addEventListener('click', () => {
      toggleFab(false);
      $('btnQuickNewTxt')?.click();
    });

    $('btnFabExtractZip')?.addEventListener('click', () => {
      toggleFab(false);
      $('inputVaultZipUpload')?.click();
    });

    // -------------------------------------------------------------------------
    // 4. BARRA DE BUSCA GLOBAL NA NAVBAR SUPERIOR (header.top-app-bar)
    // -------------------------------------------------------------------------
    const globalSearch = $('globalTopSearchInput');
    const globalClear = $('btnGlobalTopSearchClear');

    globalSearch?.addEventListener('input', (e) => {
      const q = e.target.value;
      if (globalClear) {
        globalClear.classList.toggle('hidden', !q);
      }

      // Se estiver no Cofre, sincroniza busca do cofre
      if ($('view-vault') && !$('view-vault').classList.contains('hidden')) {
        state.vaultSearchQuery = q;
        if ($('vaultAdvSearchInput')) $('vaultAdvSearchInput').value = q;
        renderVaultFolderRightPane();
      } else {
        // Filtro de portfólio
        state.searchQuery = q;
        renderPortfolioGrid();
      }
    });

    globalClear?.addEventListener('click', () => {
      if (globalSearch) globalSearch.value = '';
      globalClear.classList.add('hidden');
      state.vaultSearchQuery = '';
      state.searchQuery = '';
      if ($('vaultAdvSearchInput')) $('vaultAdvSearchInput').value = '';
      if ($('view-vault') && !$('view-vault').classList.contains('hidden')) {
        renderVaultFolderRightPane();
      } else {
        renderPortfolioGrid();
      }
    });

    // Atalho de teclado global '/' para focar na busca
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        globalSearch?.focus();
        globalSearch?.select();
      }
    });

    // -------------------------------------------------------------------------
    // 5. COMPARTILHAMENTO TEMPORÁRIO, QR CODE & CLIENT PROOFING (SPRINT 3)
    // -------------------------------------------------------------------------
    let currentGeneratedShare = null;

    $('btnMoreActionShare')?.addEventListener('click', () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const modal = $('modalShareLink');
      if (!modal) return;

      const target = state.vaultFolder || '';
      const defaultTitle = target ? (target.split('/').pop() || target) : 'Acervo Fotográfico';
      if ($('inputShareTitle')) $('inputShareTitle').value = defaultTitle;
      if ($('selectShareMode')) $('selectShareMode').value = 'view';
      if ($('selectShareExpiry')) $('selectShareExpiry').value = '168';
      if ($('checkShareWatermark')) $('checkShareWatermark').checked = false;
      if ($('checkShareAllowZip')) $('checkShareAllowZip').checked = true;

      $('shareConfigSection')?.classList.remove('hidden');
      $('shareResultSection')?.classList.add('hidden');
      modal.classList.remove('hidden');
    });

    $('btnGenerateShareLink')?.addEventListener('click', async () => {
      const btn = $('btnGenerateShareLink');
      btn.disabled = true;
      btn.textContent = 'Gerando link seguro...';

      try {
        const title = ($('inputShareTitle')?.value || '').trim();
        const mode = $('selectShareMode')?.value || 'view';
        const expiresInHours = Number($('selectShareExpiry')?.value || 168);
        const watermark = Boolean($('checkShareWatermark')?.checked);
        const allowZip = Boolean($('checkShareAllowZip')?.checked);

        const res = await apiJson('/api/shares/create', {
          method: 'POST',
          body: JSON.stringify({
            targetPath: state.vaultFolder || '',
            title,
            mode,
            expiresInHours,
            watermark,
            allowZip,
          }),
        });

        if (res.share) {
          currentGeneratedShare = res.share;
          const shareUrl = `${window.location.origin}/s/${res.share.id}`;
          if ($('inputGeneratedShareUrl')) $('inputGeneratedShareUrl').value = shareUrl;

          // Gera QR Code SVG instantâneo
          const qrContainer = $('shareQrCodeContainer');
          if (qrContainer && window.QRCodeSVG) {
            qrContainer.innerHTML = window.QRCodeSVG.generateSVG(shareUrl, {
              size: 190,
              fgColor: '#FFB703',
              bgColor: '#0B1320',
            });
          }

          $('shareResultSection')?.classList.remove('hidden');
          showToast('Link de compartilhamento criado com sucesso! 🔗', false);
        }
      } catch (err) {
        showToast('Erro ao criar compartilhamento: ' + err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar Link de Compartilhamento';
      }
    });

    $('btnCopyShareUrl')?.addEventListener('click', () => {
      const input = $('inputGeneratedShareUrl');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('Link copiado para a área de transferência! 📋', false);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('Link copiado! 📋', false);
      });
    });

    $('btnDownloadQrCodeSvg')?.addEventListener('click', () => {
      const qrContainer = $('shareQrCodeContainer');
      const svgEl = qrContainer?.querySelector('svg');
      if (!svgEl) return;

      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrcode_${currentGeneratedShare?.id || 'share'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('QR Code (.svg) baixado com sucesso! ⬇️', false);
    });

    // Listagem de links ativos
    $('btnOpenActiveSharesModal')?.addEventListener('click', async () => {
      $('modalShareLink')?.classList.add('hidden');
      const modal = $('modalActiveShares');
      const container = $('activeSharesListContainer');
      if (!modal || !container) return;

      modal.classList.remove('hidden');
      container.innerHTML = '<div class="text-center py-8 text-xs text-[#E0FBFC]/50">Carregando links...</div>';

      try {
        const res = await apiJson('/api/shares/list');
        const shares = res.shares || [];

        if (shares.length === 0) {
          container.innerHTML = '<div class="text-center py-8 text-xs text-[#E0FBFC]/50">Nenhum link de compartilhamento ativo no momento.</div>';
          return;
        }

        container.innerHTML = shares
          .map((s) => {
            const expText = s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('pt-BR') : 'Permanente';
            const statusColor = s.status === 'active' ? 'text-emerald-400' : 'text-rose-400';
            return `
              <div class="p-3 bg-[#0B1320] border border-[#5A189A]/60 rounded-xl flex items-center justify-between gap-3 text-xs font-mono">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-[#FFB703] truncate">${escapeHtml(s.title || s.targetPath || 'Compartilhamento')}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#240046] border border-[#5A189A] uppercase">${escapeHtml(s.mode)}</span>
                    <span class="${statusColor} text-[10px] font-bold uppercase">${escapeHtml(s.status)}</span>
                  </div>
                  <div class="text-[10px] text-[#E0FBFC]/60 truncate pt-0.5">
                    Validade: ${expText} • Acessos: ${s.viewCount || 0} ${s.selectedItems?.length ? `• ${s.selectedItems.length} selecionadas (#)` : ''}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <a href="/s/${s.id}" target="_blank" class="px-2.5 py-1 bg-[#240046] hover:bg-[#5A189A] text-[#E0FBFC] rounded-lg text-xs transition">Abrir</a>
                  <button type="button" class="btn-delete-share px-2 py-1 text-rose-400 hover:text-rose-300 transition cursor-pointer" data-share-id="${s.id}" title="Excluir link">✕</button>
                </div>
              </div>
            `;
          })
          .join('');

        container.querySelectorAll('.btn-delete-share').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.shareId;
            if (!confirm('Deseja realmente revogar e excluir este link de compartilhamento?')) return;
            try {
              await apiJson(`/api/shares/${id}`, { method: 'DELETE' });
              showToast('Link de compartilhamento excluído.', false);
              $('btnOpenActiveSharesModal')?.click();
            } catch (err) {
              showToast('Erro ao excluir: ' + err.message, true);
            }
          });
        });
      } catch (err) {
        container.innerHTML = `<div class="text-center py-8 text-xs text-rose-400">Erro ao listar links: ${escapeHtml(err.message)}</div>`;
      }
    });
  }

  // Inicialização
  initEvents();
  initSprint3AndExplorerUpgrades();
  initSprint4MultimediaAndWebdav();
  initGridDensitySlider();
  initTheme();
  updateMultiColSwitchUI();
  initSubfolderMode();
  initViewModeSwitcher();
  initEmbedGeneratorModal();
  initCarouselNav();
  setupAppsCarouselDots();
  initContactModal();
  initServerHealthPolling();
  initEmbedMode();
  loadPortfolio();
  checkSession();
})();


  // ==========================================================================
  // SPRINT 4 (V12.0): REPRODUÇÃO MULTIMÍDIA CONTÍNUA (HTTP 206) & DOCUMENTOS
  // ==========================================================================

  let audioPlaylist = [];
  let currentAudioIndex = -1;
  let currentEditingDoc = null;

  function formatTimeMinutes(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function renderSimpleMarkdown(md) {
    let html = escapeHtml(md || '');
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-[#FFB703] mt-3 mb-1">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-[#FFB703] mt-4 mb-2 pb-1 border-b border-[#5A189A]/40">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold text-[#E0FBFC] mt-4 mb-2 pb-1 border-b border-[#5A189A]/60">$1</h1>');
    // Bold / Italic
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong class="text-[#FFB703]">$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/gim, '<pre class="bg-[#10002B] border border-[#5A189A] p-3 rounded-xl my-2 overflow-x-auto font-mono text-xs">$1</pre>');
    html = html.replace(/`([^`]+)`/gim, '<code class="bg-[#10002B] px-1.5 py-0.5 rounded text-[#FFB703] font-mono text-[11px]">$1</code>');
    // List items
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-[#E0FBFC]/90">$1</li>');
    // Paragraphs
    html = html.replace(/\n\n+/g, '<br/><br/>');
    return html;
  }

  function playAudioTrack(file) {
    const audioEl = $('vaultAudioElement');
    const dock = $('audioPlayerFloatingDock');
    if (!audioEl || !dock) return;

    // Coleta arquivos de áudio da pasta atual para a playlist contínua
    const currentFiles = state.vaultData?.files || [];
    audioPlaylist = currentFiles.filter((f) => f.kind === 'audio' || /\.(mp3|flac|wav|m4a|ogg|aac)$/i.test(f.name));
    currentAudioIndex = audioPlaylist.findIndex((f) => f.path === file.path || f.name === file.name);

    if (currentAudioIndex === -1) {
      audioPlaylist = [file];
      currentAudioIndex = 0;
    }

    const currentTrack = audioPlaylist[currentAudioIndex] || file;
    audioEl.src = currentTrack.streamUrl;
    audioEl.play().catch(() => {});

    $('audioDockTitle').textContent = currentTrack.name;
    $('audioDockAlbum').textContent = state.vaultFolder ? `Pasta: ${state.vaultFolder}` : 'Cofre Pessoal • Reprodução Contínua';
    $('audioDockPlayIcon').textContent = 'pause';

    dock.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
    $('audioDockIcon')?.classList.add('animate-pulse');
  }

  function playNextAudioTrack() {
    if (!audioPlaylist.length) return;
    currentAudioIndex = (currentAudioIndex + 1) % audioPlaylist.length;
    playAudioTrack(audioPlaylist[currentAudioIndex]);
  }

  function playPrevAudioTrack() {
    if (!audioPlaylist.length) return;
    currentAudioIndex = (currentAudioIndex - 1 + audioPlaylist.length) % audioPlaylist.length;
    playAudioTrack(audioPlaylist[currentAudioIndex]);
  }

  function playVideoModal(file) {
    const modal = $('videoPlayerModal');
    const videoEl = $('vaultVideoPlayer');
    if (!modal || !videoEl) return;

    $('videoModalTitle').textContent = file.name;
    if ($('btnVideoDownload')) $('btnVideoDownload').href = file.downloadUrl || file.streamUrl;
    videoEl.src = file.streamUrl;
    modal.classList.remove('hidden');
    videoEl.play().catch(() => {});
  }

  async function openDocumentViewer(file) {
    const modal = $('modalDocViewer');
    if (!modal) return;

    const isPdf = file.kind === 'pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isMd = file.name.toLowerCase().endsWith('.md');
    const iframe = $('docPdfIframe');
    const mdView = $('docMarkdownRender');
    const editor = $('docTextEditor');
    const toggleBtn = $('btnDocToggleMode');
    const saveBtn = $('btnDocSaveContent');

    $('docViewerTitle').textContent = file.name;
    $('docViewerMeta').textContent = isPdf ? 'Documento PDF' : (isMd ? 'Documento Markdown (.md)' : 'Arquivo de Texto / Código');
    if ($('btnDocDownload')) $('btnDocDownload').href = file.downloadUrl || file.streamUrl;

    currentEditingDoc = {
      path: file.path,
      isPdf,
      isMd,
      isEditing: !isMd && !isPdf,
      content: '',
    };

    if (isPdf) {
      iframe.classList.remove('hidden');
      mdView.classList.add('hidden');
      editor.classList.add('hidden');
      toggleBtn?.classList.add('hidden');
      saveBtn?.classList.add('hidden');
      iframe.src = file.streamUrl;
      modal.classList.remove('hidden');
      return;
    }

    // Leitura do conteúdo do texto no backend
    try {
      iframe.classList.add('hidden');
      toggleBtn?.classList.remove('hidden');

      const res = await apiJson(`/api/vault/read-text?path=${encodeURIComponent(file.path)}`);
      currentEditingDoc.content = res.content || '';
      editor.value = res.content || '';

      if (isMd) {
        // Exibe preview do Markdown
        mdView.innerHTML = renderSimpleMarkdown(res.content);
        mdView.classList.remove('hidden');
        editor.classList.add('hidden');
        saveBtn?.classList.add('hidden');
        $('docToggleText').textContent = 'Editar';
        $('docToggleIcon').textContent = 'edit';
      } else {
        // Exibe editor direto
        mdView.classList.add('hidden');
        editor.classList.remove('hidden');
        saveBtn?.classList.remove('hidden');
        $('docToggleText').textContent = 'Código';
        $('docToggleIcon').textContent = 'code';
      }

      modal.classList.remove('hidden');
    } catch (err) {
      showToast('Erro ao ler documento: ' + err.message, true);
    }
  }

  function initSprint4MultimediaAndWebdav() {
    // -------------------------------------------------------------------------
    // 1. ÁUDIO CONTÍNUO (DOCK FLUTUANTE)
    // -------------------------------------------------------------------------
    const audioEl = $('vaultAudioElement');
    const dock = $('audioPlayerFloatingDock');
    const seekRange = $('audioDockSeekRange');
    const curTime = $('audioDockCurrentTime');
    const durTime = $('audioDockDuration');
    const playPauseBtn = $('btnAudioDockPlayPause');
    const playIcon = $('audioDockPlayIcon');

    audioEl?.addEventListener('timeupdate', () => {
      if (!audioEl.duration) return;
      seekRange.value = (audioEl.currentTime / audioEl.duration) * 100;
      curTime.textContent = formatTimeMinutes(audioEl.currentTime);
    });

    audioEl?.addEventListener('loadedmetadata', () => {
      durTime.textContent = formatTimeMinutes(audioEl.duration);
    });

    audioEl?.addEventListener('ended', () => {
      playNextAudioTrack();
    });

    playPauseBtn?.addEventListener('click', () => {
      if (audioEl.paused) {
        audioEl.play().catch(() => {});
        playIcon.textContent = 'pause';
      } else {
        audioEl.pause();
        playIcon.textContent = 'play_arrow';
      }
    });

    $('btnAudioDockNext')?.addEventListener('click', () => playNextAudioTrack());
    $('btnAudioDockPrev')?.addEventListener('click', () => playPrevAudioTrack());

    $('btnAudioDockClose')?.addEventListener('click', () => {
      audioEl?.pause();
      dock?.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
    });

    seekRange?.addEventListener('input', (e) => {
      if (!audioEl.duration) return;
      const targetTime = (e.target.value / 100) * audioEl.duration;
      audioEl.currentTime = targetTime;
    });

    // Fechar player de vídeo ao fechar modal
    document.querySelectorAll('[data-close-modal="videoPlayerModal"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = $('vaultVideoPlayer');
        if (v) {
          v.pause();
          v.src = '';
        }
      });
    });

    // -------------------------------------------------------------------------
    // 2. DOCUMENT VIEWER & EDITOR DE CÓDIGO
    // -------------------------------------------------------------------------
    $('btnDocToggleMode')?.addEventListener('click', () => {
      if (!currentEditingDoc || currentEditingDoc.isPdf) return;
      const mdView = $('docMarkdownRender');
      const editor = $('docTextEditor');
      const saveBtn = $('btnDocSaveContent');

      if (currentEditingDoc.isEditing) {
        // Volta para visualização
        currentEditingDoc.isEditing = false;
        currentEditingDoc.content = editor.value;
        if (currentEditingDoc.isMd) {
          mdView.innerHTML = renderSimpleMarkdown(editor.value);
          mdView.classList.remove('hidden');
          editor.classList.add('hidden');
        }
        $('docToggleText').textContent = 'Editar';
        $('docToggleIcon').textContent = 'edit';
        saveBtn?.classList.add('hidden');
      } else {
        // Entra no modo de edição
        currentEditingDoc.isEditing = true;
        editor.value = currentEditingDoc.content;
        mdView.classList.add('hidden');
        editor.classList.remove('hidden');
        saveBtn?.classList.remove('hidden');
        $('docToggleText').textContent = 'Visualizar';
        $('docToggleIcon').textContent = 'visibility';
      }
    });

    $('btnDocCopyContent')?.addEventListener('click', () => {
      const txt = $('docTextEditor')?.value || currentEditingDoc?.content || '';
      navigator.clipboard.writeText(txt).then(() => {
        showToast('Conteúdo copiado para a área de transferência! 📋', false);
      }).catch(() => {
        showToast('Conteúdo copiado! 📋', false);
      });
    });

    $('btnDocSaveContent')?.addEventListener('click', async () => {
      if (!currentEditingDoc || !currentEditingDoc.path) return;
      const saveBtn = $('btnDocSaveContent');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';

      try {
        const content = $('docTextEditor')?.value || '';
        await apiJson('/api/vault/save-text', {
          method: 'POST',
          body: JSON.stringify({
            path: currentEditingDoc.path,
            content,
          }),
        });

        currentEditingDoc.content = content;
        showToast('Arquivo salvo com sucesso no disco! 💾', false);
        if (currentEditingDoc.isMd && $('docMarkdownRender')) {
          $('docMarkdownRender').innerHTML = renderSimpleMarkdown(content);
        }
      } catch (err) {
        showToast('Erro ao salvar arquivo: ' + err.message, true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-outlined text-[15px]">save</span><span>Salvar Alterações</span>';
      }
    });

    // -------------------------------------------------------------------------
    // 3. CONEXÃO DE REDE WEBDAV & WI-FI
    // -------------------------------------------------------------------------
    $('btnMoreActionWebdav')?.addEventListener('click', async () => {
      $('vaultMoreActionsDropdown')?.classList.add('hidden');
      const modal = $('modalWebdavConnect');
      if (!modal) return;

      try {
        const netInfo = await apiJson('/api/network/info');
        if ($('inputWebdavUrl')) $('inputWebdavUrl').value = netInfo.webdavUrl;
        modal.classList.remove('hidden');
      } catch {
        const fallbackUrl = `${window.location.origin}/webdav`;
        if ($('inputWebdavUrl')) $('inputWebdavUrl').value = fallbackUrl;
        modal.classList.remove('hidden');
      }
    });

    $('btnCopyWebdavUrl')?.addEventListener('click', () => {
      const input = $('inputWebdavUrl');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('Endereço WebDAV copiado! 🌐', false);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('Endereço copiado! 🌐', false);
      });
    });
  }
