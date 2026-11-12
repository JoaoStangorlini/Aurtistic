// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/portfolio/AurtisticGalleryGrid.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { UserFileIndexRow } from '@/types';
import { buildTenantThumbUrl, buildTenantZipUrl, formatStorageBytes, resolveClientEdgeServerUrl } from '@/lib/edge-urls';
import { PhotoInspectModal, type PhotoInspectItem } from './PhotoInspectModal';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { getPortfolioAlbumZipUrlAction } from '@/app/(dashboard)/actions';

export interface AurtisticGalleryGridProps {
  items: PhotoInspectItem[];
  serverUrl?: string;
  isOwner?: boolean;
  username?: string;
  ticket?: string;
  onOpenUploadModal?: () => void;
  onItemUpdated?: (updated: UserFileIndexRow) => void;
  onSyncPortfolio?: (forceReset?: boolean) => Promise<void>;
  isSyncing?: boolean;
}

const PREFERRED_ALBUM_ORDER = [
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

const ALBUM_ICONS: Record<string, string> = {
  ALL: 'collections',
  POLÍTICAS: 'campaign',
  EVENTOS: 'event',
  FESTAS: 'celebration',
  'SHOW DE FISICA': 'science',
  'STREET-TRILHAS': 'hiking',
  USP: 'school',
  BAHIA: 'beach_access',
  CIENTEC: 'biotech',
  PASSARINHADA: 'flutter_dash',
  'CENTRO HISTORICO': 'account_balance',
  GERAL: 'photo_camera',
  PIZZARIA: 'local_pizza',
  HALLOWUSP: 'nightlight',
  PUNKUSP: 'music_note',
  CASAMENTO: 'favorite',
  PRINCIPIA: 'auto_stories',
  SYCOMP: 'laptop_mac',
  TESTES: 'tune',
  TRANCASSO: 'lock',
  EULER: 'functions',
  'ASSEMBLEIA - CAMPANHA': 'campaign',
  'ASSEMBLEIA-GREVE': 'campaign',
  'ATO PROFESSORES - GREVE': 'campaign',
  'CANALHA - CAMPANHA': 'campaign',
  'MARCHA - GREVE': 'campaign',
  PAULISTA: 'location_city',
};

export function resolveItemDeviceInfo(item: PhotoInspectItem): {
  category: 'camera' | 'mobile' | 'drone' | 'other' | 'unknown';
  name: string;
} {
  const exif = (item.exif_data || {}) as Record<string, unknown>;
  if (exif.deviceCategory) {
    return {
      category: exif.deviceCategory as 'camera' | 'mobile' | 'drone' | 'other',
      name: String(exif.deviceName || exif.camera || exif.model || 'Dispositivo'),
    };
  }

  const rawModel = String(exif.camera || exif.model || exif.make || '').trim();
  const lower = rawModel.toLowerCase();

  if (/canon|nikon|sony|fujifilm|fuji|leica|hasselblad|panasonic|olympus|pentax/i.test(lower)) {
    return { category: 'camera', name: rawModel || 'Câmera Profissional' };
  }
  if (/iphone|apple|samsung|galaxy|xiaomi|redmi|poco|motorola|moto|pixel|google|huawei|oppo|oneplus|realme|asus|lg/i.test(lower)) {
    return { category: 'mobile', name: rawModel || 'Celular' };
  }
  if (/dji|mavic|phantom|mini \d|air \d|autel/i.test(lower)) {
    return { category: 'drone', name: rawModel || 'Drone' };
  }

  return { category: 'unknown', name: rawModel };
}

export function resolveItemLensInfo(item: PhotoInspectItem): string | null {
  const exif = (item.exif_data || {}) as Record<string, unknown>;
  const rawLens =
    exif.lens ||
    exif.lensModel ||
    exif.LensModel ||
    exif.lensMake ||
    exif.Lens ||
    (exif.raw as Record<string, unknown> | undefined)?.LensModel ||
    null;
  if (!rawLens) return null;
  const s = String(rawLens).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : null;
}

export function parseItemTimestamp(item: PhotoInspectItem): number {
  const exif = (item.exif_data || {}) as Record<string, unknown>;
  const rawDate = exif.dateTimeOriginal || exif.dateTaken || item.created_at || '';
  if (!rawDate) return 0;
  const normalized = String(rawDate).trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const parsed = Date.parse(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

export function AurtisticGalleryGrid({
  items,
  serverUrl,
  isOwner = false,
  username,
  ticket: propTicket,
  onOpenUploadModal,
  onItemUpdated,
  onSyncPortfolio,
  isSyncing = false,
}: AurtisticGalleryGridProps) {
  // Contexto de Mídia para Ticket de Fallback
  const mediaCtx = useAurtisticMedia();
  const effectiveTicket =
    propTicket || mediaCtx.vaultTicket || mediaCtx.mediaTicket || mediaCtx.activeTicket || '';

  // Filtros de Navegação
  const [selectedAlbum, setSelectedAlbum] = useState<string>('all');
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>('all');
  const [subfolderMode, setSubfolderMode] = useState<'full' | 'subfolders'>('full');
  const [gridCols, setGridCols] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Filtros de Pesquisa e Metadados
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtros Avançados de Dispositivo e Ordenação Temporal
  const [deviceCategoryFilter, setDeviceCategoryFilter] = useState<'all' | 'camera' | 'mobile' | 'mixed'>('all');
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>('all');
  const [selectedLensName, setSelectedLensName] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name' | 'default'>('newest');

  // Ordem Customizada dos Álbuns (Persistida em localStorage)
  const [customAlbumOrder, setCustomAlbumOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('aurtistic_portfolio_album_order');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [isReorderingAlbums, setIsReorderingAlbums] = useState(false);

  // Álbuns Marcados como Equipamento Misto (Persistido em localStorage)
  const [mixedAlbums, setMixedAlbums] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('aurtistic_portfolio_mixed_albums');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set();
  });

  // Modal de Inspeção Fotográfica
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Exibição de Toast Efêmero
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  }, []);

  // Extrai e Ordena Álbuns respeitando a Ordem Personalizada ou a Padrão
  const sortedAlbums = useMemo(() => {
    const rawAlbums = new Set<string>();
    for (const item of items) {
      if (item.album && item.album.trim()) {
        rawAlbums.add(item.album.trim());
      }
    }
    const found = Array.from(rawAlbums);
    const orderToUse = customAlbumOrder.length > 0 ? customAlbumOrder : PREFERRED_ALBUM_ORDER;
    const ordered = [
      ...orderToUse.filter((a) => found.includes(a)),
      ...found.filter((a) => !orderToUse.includes(a)).sort(),
    ];
    return ordered;
  }, [items, customAlbumOrder]);

  // Estatísticas de Equipamentos (Câmeras + Lentes) por Álbum
  const albumEquipmentStats = useMemo(() => {
    const stats: Record<string, { cameras: Set<string>; lenses: Set<string> }> = {};
    for (const item of items) {
      const alb = item.album || 'Geral';
      if (!stats[alb]) {
        stats[alb] = { cameras: new Set(), lenses: new Set() };
      }
      const dev = resolveItemDeviceInfo(item);
      if (dev.name && dev.category !== 'unknown') {
        stats[alb].cameras.add(dev.name);
      }
      const lens = resolveItemLensInfo(item);
      if (lens) {
        stats[alb].lenses.add(lens);
      }
    }
    return stats;
  }, [items]);

  // Verifica se um Álbum é considerado Misto (automático ou marcado manualmente)
  const isAlbumMixed = useCallback(
    (alb: string) => {
      if (mixedAlbums.has(alb)) return true;
      const st = albumEquipmentStats[alb];
      if (!st) return false;
      return st.cameras.size > 1 || st.lenses.size > 1;
    },
    [mixedAlbums, albumEquipmentStats]
  );

  // Alterna Marcação de Álbum Misto
  const handleToggleMixedAlbum = useCallback(
    (alb: string) => {
      setMixedAlbums((prev) => {
        const next = new Set(prev);
        if (next.has(alb)) {
          next.delete(alb);
          showToast(`Álbum "${alb}" desmarcado de Misto.`);
        } else {
          next.add(alb);
          showToast(`Álbum "${alb}" marcado como Equipamento Misto!`);
        }
        try {
          localStorage.setItem('aurtistic_portfolio_mixed_albums', JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    },
    [showToast]
  );

  // Move a Ordem de um Álbum
  const handleMoveAlbum = useCallback(
    (albumName: string, direction: -1 | 1) => {
      setCustomAlbumOrder((prevOrder) => {
        const baseList = prevOrder.length > 0 ? [...prevOrder] : [...sortedAlbums];
        const fullList = Array.from(new Set([...baseList, ...sortedAlbums]));
        const idx = fullList.indexOf(albumName);
        const targetIdx = idx + direction;
        if (idx === -1 || targetIdx < 0 || targetIdx >= fullList.length) return prevOrder;

        const tmp = fullList[idx];
        fullList[idx] = fullList[targetIdx];
        fullList[targetIdx] = tmp;

        try {
          localStorage.setItem('aurtistic_portfolio_album_order', JSON.stringify(fullList));
        } catch {}

        // Sincronização assíncrona com o servidor Edge (PUT /api/portfolio/layout)
        try {
          const edgeBase = resolveClientEdgeServerUrl(serverUrl);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (effectiveTicket) headers['Authorization'] = `Bearer ${effectiveTicket}`;
          fetch(`${edgeBase}/api/portfolio/layout`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ albumOrder: fullList }),
          }).catch(() => {});
        } catch {}

        showToast(`Ordem alterada: "${albumName}" movido.`);
        return fullList;
      });
    },
    [sortedAlbums, showToast, serverUrl, effectiveTicket]
  );

  // Contagem por Álbum
  const albumCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const alb = item.album || 'Geral';
      counts[alb] = (counts[alb] || 0) + 1;
    }
    return counts;
  }, [items]);

  // Álbum Alvo para exibição de Subpastas na barra
  const targetAlbumForSubfolders = useMemo(() => {
    if (selectedAlbum !== 'all') return selectedAlbum;
    return sortedAlbums[0] || 'POLÍTICAS';
  }, [selectedAlbum, sortedAlbums]);

  // Extrai Subpastas do Álbum Alvo
  const targetSubfolders = useMemo(() => {
    const subMap: Record<string, number> = {};
    for (const item of items) {
      if (item.album === targetAlbumForSubfolders) {
        // Tenta extrair subpasta da categoria ou do relative_path
        let sub: string | undefined = item.category;
        if (!sub || sub === 'Fotografia' || sub === targetAlbumForSubfolders) {
          const cleanRel = String(item.relative_path || '')
            .replace(/\\/g, '/')
            .replace(/^Portfolio\//, '');
          const parts = cleanRel.split('/');
          if (parts.length > 2) {
            sub = parts[1];
          } else {
            sub = undefined;
          }
        }
        if (sub && sub !== targetAlbumForSubfolders && sub !== 'Fotografia') {
          subMap[sub] = (subMap[sub] || 0) + 1;
        }
      }
    }
    return Object.entries(subMap).sort((a, b) => b[1] - a[1]);
  }, [items, targetAlbumForSubfolders]);

  // Total de Favoritas
  const totalFavorites = useMemo(
    () => items.filter((it) => Boolean(it.is_favorite)).length,
    [items]
  );

  // Lista Dinâmica de Equipamentos Encontrados no Acervo
  const discoveredDevices = useMemo(() => {
    const map = new Map<string, { category: string; count: number }>();
    for (const item of items) {
      const dev = resolveItemDeviceInfo(item);
      if (dev.name && dev.category !== 'unknown') {
        const existing = map.get(dev.name);
        map.set(dev.name, {
          category: dev.category,
          count: (existing?.count || 0) + 1,
        });
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Lista Dinâmica de Lentes Encontradas no Acervo
  const discoveredLenses = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const lens = resolveItemLensInfo(item);
      if (lens) {
        map.set(lens, (map.get(lens) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Filtragem Geral de Itens
  const filteredItems = useMemo(() => {
    const list = items.filter((item) => {
      if (onlyFavorites && !item.is_favorite) return false;

      // Filtro de Álbum
      if (selectedAlbum !== 'all' && item.album !== selectedAlbum) return false;

      // Filtro de Subpasta
      if (selectedSubfolder !== 'all') {
        let itemSub = item.category;
        if (!itemSub || itemSub === 'Fotografia' || itemSub === item.album) {
          const cleanRel = String(item.relative_path || '')
            .replace(/\\/g, '/')
            .replace(/^Portfolio\//, '');
          const parts = cleanRel.split('/');
          if (parts.length > 2) {
            itemSub = parts[1];
          }
        }
        if (itemSub !== selectedSubfolder) return false;
      }

      // Filtro de Dispositivo (Câmera / Celular / Álbum Misto)
      if (deviceCategoryFilter === 'mixed') {
        const isMixed = isAlbumMixed(item.album || 'Geral');
        if (!isMixed) return false;
      } else if (deviceCategoryFilter !== 'all') {
        const dev = resolveItemDeviceInfo(item);
        if (dev.category !== deviceCategoryFilter) return false;
      }

      // Filtro de Equipamento Específico (Câmera / Celular)
      if (selectedDeviceName !== 'all') {
        const dev = resolveItemDeviceInfo(item);
        if (dev.name !== selectedDeviceName) return false;
      }

      // Filtro de Lente Específica
      if (selectedLensName !== 'all') {
        const lens = resolveItemLensInfo(item);
        if (lens !== selectedLensName) return false;
      }

      // Busca Textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const nameMatch = item.filename?.toLowerCase().includes(q);
        const albumMatch = item.album?.toLowerCase().includes(q);
        const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
        const dev = resolveItemDeviceInfo(item);
        const cameraMatch = String(
          item.exif_data?.camera || item.exif_data?.model || dev.name || ''
        ).toLowerCase().includes(q);
        const lensMatch = String(item.exif_data?.lens || '').toLowerCase().includes(q);
        if (!titleMatch && !nameMatch && !albumMatch && !tagMatch && !cameraMatch && !lensMatch) {
          return false;
        }
      }

      return true;
    });

    // Ordenação Temporal
    if (sortOrder === 'newest') {
      list.sort((a, b) => parseItemTimestamp(b) - parseItemTimestamp(a));
    } else if (sortOrder === 'oldest') {
      list.sort((a, b) => parseItemTimestamp(a) - parseItemTimestamp(b));
    } else if (sortOrder === 'name') {
      list.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
    }

    return list;
  }, [
    items,
    onlyFavorites,
    selectedAlbum,
    selectedSubfolder,
    deviceCategoryFilter,
    selectedDeviceName,
    selectedLensName,
    isAlbumMixed,
    sortOrder,
    searchQuery,
  ]);

  // Agrupamento por Seção/Subpasta quando no modo 'subfolders'
  const groupedSections = useMemo(() => {
    if (subfolderMode !== 'subfolders' || selectedSubfolder !== 'all') {
      return null;
    }

    const groups: Record<string, PhotoInspectItem[]> = {};
    for (const item of filteredItems) {
      let key = item.album || 'Geral';
      // Se um álbum específico estiver selecionado, agrupa por subpastas internas
      if (selectedAlbum !== 'all') {
        let sub = item.category;
        if (!sub || sub === 'Fotografia' || sub === selectedAlbum) {
          const cleanRel = String(item.relative_path || '')
            .replace(/\\/g, '/')
            .replace(/^Portfolio\//, '');
          const parts = cleanRel.split('/');
          sub = parts.length > 2 ? parts[1] : 'Sem Subpasta';
        }
        key = sub || 'Geral';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [subfolderMode, selectedSubfolder, selectedAlbum, filteredItems]);

  // Alterna Colapso de Seção Individual
  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Download do Pacote .ZIP do Álbum ou Subpasta Ativa
  const handleDownloadActiveZip = useCallback(
    async (customScope?: string, customName?: string) => {
      let scopePath = 'Portfolio';
      let displayName = 'Acervo_Fotografico';

      if (customScope) {
        scopePath = customScope.startsWith('Portfolio') ? customScope : `Portfolio/${customScope}`;
        displayName = customName || customScope.replace(/[\/\\]/g, '_');
      } else if (selectedAlbum !== 'all') {
        if (selectedSubfolder !== 'all') {
          scopePath = `Portfolio/${selectedAlbum}/${selectedSubfolder}`;
          displayName = `${selectedAlbum}_${selectedSubfolder}`;
        } else {
          scopePath = `Portfolio/${selectedAlbum}`;
          displayName = selectedAlbum;
        }
      }

      showToast(`Iniciando download do pacote .ZIP (${displayName})...`);

      try {
        const ownerId = items[0]?.user_id;
        const res = await getPortfolioAlbumZipUrlAction({ albumPath: scopePath, ownerId });
        const zipUrl =
          res.ok && res.zipUrl
            ? res.zipUrl
            : buildTenantZipUrl(scopePath, effectiveTicket, { serverUrl });

        const a = document.createElement('a');
        a.href = zipUrl;
        a.setAttribute('download', `${displayName}.zip`);
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 1500);
      } catch (err) {
        console.error('Falha ao emitir link de ZIP:', err);
        showToast('Erro ao preparar download .ZIP');
      }
    },
    [selectedAlbum, selectedSubfolder, effectiveTicket, serverUrl, items, showToast]
  );

  // Copia Link Público
  const handleCopyPublicLink = () => {
    if (typeof window === 'undefined') return;
    const targetSlug = username || 'perfil';
    const url = `${window.location.origin}/portfolio/${targetSlug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      showToast('Link do portfólio copiado com sucesso!');
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Mapeamento de Classes de Coluna Tailwind
  const gridColClass = useMemo(() => {
    switch (gridCols) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 3:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
      case 5:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5';
      default:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    }
  }, [gridCols]);

  return (
    <div className="space-y-6">
      {/* Toast Notificação */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface border-2 border-[#FFCC00] text-fg px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in font-mono text-xs">
          <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. CABEÇALHO DO ACERVO FOTOGRÁFICO COM CONTADOR EM TEMPO REAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#FFCC00] text-[24px]">photo_camera</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-['Bukra'] text-xl sm:text-2xl font-black text-fg tracking-tight">
                Acervo Fotográfico
              </h2>
              <span className="font-mono text-xs text-[#FFCC00] font-bold px-2 py-0.5 rounded-lg bg-[#FFCC00]/10 border border-[#FFCC00]/30">
                {filteredItems.length} obras
              </span>
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              Preservação em alta fidelidade com moldura Passe-Partout e metadados EXIF.
            </p>
          </div>
        </div>

        {/* Ações de Topo: Busca, Favoritas, Link e Upload */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca Textual */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar foto, lente, câmera ou tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface border border-border-subtle rounded-xl pl-9 pr-7 py-2 text-xs text-fg placeholder-fg-muted focus:outline-none focus:border-[#FFCC00] w-56 sm:w-64"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Botão de Favoritas */}
          <button
            type="button"
            onClick={() => setOnlyFavorites((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              onlyFavorites
                ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00] shadow-md shadow-[#FFCC00]/10'
                : 'bg-surface text-fg-secondary hover:text-fg border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-amber-500">
              {onlyFavorites ? 'star' : 'star_border'}
            </span>
            <span className="hidden sm:inline">Favoritas</span> ({totalFavorites})
          </button>

          {/* Compartilhar Link Público */}
          {username && (
            <button
              type="button"
              data-tour="portfolio-share"
              onClick={handleCopyPublicLink}
              className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[var(--accent-secondary)] text-fg rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">
                {copiedLink ? 'check' : 'share'}
              </span>
              <span className="hidden sm:inline">{copiedLink ? 'Copiado!' : 'Compartilhar'}</span>
            </button>
          )}

          {/* Botão de Upload / Vincular Fotos */}
          {isOwner && onOpenUploadModal && (
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="px-3.5 py-2 bg-[var(--accent-secondary)] hover:opacity-90 text-[#121212] rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-[var(--accent-secondary)]/15"
            >
              <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
              <span>Adicionar</span>
            </button>
          )}

          {/* Botão de Sincronizar Disco / Servidor */}
          {isOwner && onSyncPortfolio && (
            <button
              type="button"
              onClick={() => onSyncPortfolio(false)}
              disabled={isSyncing}
              className="px-3 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Sincronizar acervo com o disco físico do servidor"
            >
              <span className={`material-symbols-outlined text-[18px] text-[var(--accent-secondary)] ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. PÍLULAS DOS ÁLBUNS PRINCIPAIS (COM ROLAGEM HORIZONTAL E ÍCONES TEMÁTICOS) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin" data-tour="portfolio-albums">
        {/* Chip 'Todas as Obras' */}
        <button
          type="button"
          onClick={() => {
            setSelectedAlbum('all');
            setSelectedSubfolder('all');
          }}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-all border ${
            selectedAlbum === 'all'
              ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00] shadow-lg shadow-[#FFCC00]/10 font-black'
              : 'bg-surface hover:bg-surface-hover text-fg-secondary hover:text-fg border-border-subtle'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">collections</span>
          <span>Todas as Obras</span>
          <span className="font-mono text-xs opacity-80">({items.length})</span>
        </button>

        {/* Chips de Cada Álbum */}
        {sortedAlbums.map((alb, albIdx) => {
          const count = albumCounts[alb] || 0;
          const isSelected = selectedAlbum === alb;
          const icon = ALBUM_ICONS[alb] || 'folder';
          const mixed = isAlbumMixed(alb);

          return (
            <div
              key={alb}
              className={`inline-flex items-center rounded-xl transition-all border shrink-0 ${
                isSelected
                  ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00] shadow-lg shadow-[#FFCC00]/10 font-black'
                  : 'bg-surface hover:bg-surface-hover text-fg-secondary hover:text-fg border-border-subtle'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedAlbum(alb);
                  setSelectedSubfolder('all');
                }}
                className="px-3.5 py-2 text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                <span>{alb}</span>
                <span className="font-mono text-xs opacity-80">({count})</span>
                {mixed && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-black border ${
                      isSelected
                        ? 'bg-black/20 text-[#121212] border-black/30'
                        : 'bg-[#9D4EDD]/15 text-[#C77DFF] border-[#9D4EDD]/40'
                    }`}
                    title="Álbum com múltiplos equipamentos (sessão mista)"
                  >
                    🔀 Misto
                  </span>
                )}
              </button>

              {/* Botões de Mover Ordem (Quando modo reordenar ativo) */}
              {isReorderingAlbums && (
                <div className="flex items-center gap-0.5 pr-2 pl-0.5 border-l border-current/20" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={albIdx === 0}
                    onClick={() => handleMoveAlbum(alb, -1)}
                    className="p-1 rounded hover:bg-black/20 text-current disabled:opacity-20 transition-transform active:scale-90"
                    title={`Mover "${alb}" para a esquerda`}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    disabled={albIdx === sortedAlbums.length - 1}
                    onClick={() => handleMoveAlbum(alb, 1)}
                    className="p-1 rounded hover:bg-black/20 text-current disabled:opacity-20 transition-transform active:scale-90"
                    title={`Mover "${alb}" para a direita`}
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Botão de Ativar/Desativar Reordenação */}
        {isOwner && (
          <button
            type="button"
            onClick={() => setIsReorderingAlbums((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all border shrink-0 ${
              isReorderingAlbums
                ? 'bg-[#9D4EDD] text-white border-[#9D4EDD] shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-fg-muted hover:text-fg border-border-subtle'
            }`}
            title="Mudar a ordem das pastas/álbuns do portfólio"
          >
            <span className="material-symbols-outlined text-[16px]">
              {isReorderingAlbums ? 'done' : 'swap_horiz'}
            </span>
            <span>{isReorderingAlbums ? 'Concluir' : 'Mover Ordem'}</span>
          </button>
        )}
      </div>

      {/* 3. BARRA DE SUBPASTAS, MODO DE EXIBIÇÃO, COLUNAS E DOWNLOAD .ZIP */}
      <div className="bg-surface border border-border-subtle p-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm" data-tour="portfolio-view-controls">
        {/* Esquerda: Segmented Control ('▤ Ver Álbum Completo' vs '📂 Por Subpastas') + Chips */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Controle Segmentado */}
          <div className="inline-flex rounded-xl bg-app p-1 border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={() => setSubfolderMode('full')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                subfolderMode === 'full'
                  ? 'bg-[#9D4EDD] text-white shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span>▤</span>
              <span>Ver Álbum Completo</span>
            </button>
            <button
              type="button"
              onClick={() => setSubfolderMode('subfolders')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                subfolderMode === 'subfolders'
                  ? 'bg-[#9D4EDD] text-white shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span>📂</span>
              <span>Por Subpastas</span>
            </button>
          </div>

          {/* Botão de Marcar Álbum como Misto (Múltiplos Equipamentos) */}
          {selectedAlbum !== 'all' && isOwner && (
            <button
              type="button"
              onClick={() => handleToggleMixedAlbum(selectedAlbum)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all shrink-0 ${
                isAlbumMixed(selectedAlbum)
                  ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#C77DFF] font-black'
                  : 'bg-app hover:bg-surface border-border-subtle text-fg-muted hover:text-fg'
              }`}
              title="Marcar ou desmarcar este álbum como sessão fotográfica mista (múltiplos equipamentos/câmeras/lentes)"
            >
              <span>🔀</span>
              <span>{isAlbumMixed(selectedAlbum) ? 'Álbum Misto (Ativo)' : 'Marcar como Misto'}</span>
            </button>
          )}

          {/* Prefixo Dinâmico de Subpastas */}
          <span className="text-xs font-mono text-[#FFCC00] font-bold hidden sm:inline shrink-0">
            {selectedAlbum === 'all'
              ? `Subpastas (${targetAlbumForSubfolders}):`
              : 'Subpastas:'}
          </span>

          {/* Pílulas de Subpastas */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {targetSubfolders.length === 0 ? (
              <span className="text-xs font-mono text-fg-muted">
                Sem subpastas em {targetAlbumForSubfolders}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedSubfolder('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-colors border ${
                    selectedSubfolder === 'all'
                      ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00]'
                      : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border-border-subtle'
                  }`}
                >
                  Todas ({albumCounts[targetAlbumForSubfolders] || 0})
                </button>
                {targetSubfolders.map(([subName, count]) => {
                  const isSelected = selectedSubfolder === subName;
                  return (
                    <button
                      key={subName}
                      type="button"
                      onClick={() => setSelectedSubfolder(subName)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-colors border ${
                        isSelected
                          ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00]'
                          : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border-border-subtle'
                      }`}
                    >
                      {subName} ({count})
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Direita: Seletor de Colunas (1 a 5) + Botão Baixar Álbum (.ZIP) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Seletor de 1 a 5 Colunas */}
          <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle">
            <span className="text-[11px] font-mono text-[#FFCC00] px-1.5 font-bold hidden md:inline">
              Colunas:
            </span>
            {([1, 2, 3, 4, 5] as const).map((cols) => (
              <button
                key={cols}
                type="button"
                onClick={() => setGridCols(cols)}
                className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  gridCols === cols
                    ? 'bg-[#FFCC00] text-[#121212]'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title={`Exibir em ${cols} coluna(s)`}
              >
                {cols}
              </button>
            ))}
          </div>

          {/* Botão Baixar Álbum Completo (.ZIP) */}
          <button
            type="button"
            onClick={() => handleDownloadActiveZip()}
            className="px-3.5 py-1.5 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[#FFCC00] text-xs font-mono text-[#FFCC00] hover:text-fg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Baixar fotos desta categoria em pacote .ZIP"
          >
            <span className="material-symbols-outlined text-[16px]">folder_zip</span>
            <span className="hidden sm:inline">Baixar Álbum (.ZIP)</span>
            <span className="sm:hidden">.ZIP</span>
          </button>
        </div>
      </div>

      {/* 3.1 FILTROS AVANÇADOS: DISPOSITIVO (CÂMERAS / CELULARES), EQUIPAMENTO E ORDENAÇÃO TEMPORAL */}
      <div className="bg-surface/80 border border-border-subtle p-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Esquerda: Filtro de Dispositivo (Todas / Câmeras / Celulares) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-fg-muted uppercase">
            Dispositivo:
          </span>
          <div className="inline-flex rounded-xl bg-app p-1 border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={() => {
                setDeviceCategoryFilter('all');
                setSelectedDeviceName('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                deviceCategoryFilter === 'all'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span>Todos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeviceCategoryFilter('camera');
                setSelectedDeviceName('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                deviceCategoryFilter === 'camera'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">photo_camera</span>
              <span>Câmeras</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeviceCategoryFilter('mobile');
                setSelectedDeviceName('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                deviceCategoryFilter === 'mobile'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">smartphone</span>
              <span>Celulares</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeviceCategoryFilter((prev) => (prev === 'mixed' ? 'all' : 'mixed'));
                setSelectedDeviceName('all');
                setSelectedLensName('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                deviceCategoryFilter === 'mixed'
                  ? 'bg-[#9D4EDD] text-white font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
              title="Filtrar por sessões/álbuns onde foram usados múltiplos equipamentos"
            >
              <span>🔀</span>
              <span>Mistos</span>
            </button>
          </div>

          {/* Dropdown de Equipamento Específico (Câmeras / Celulares) */}
          {discoveredDevices.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <select
                value={selectedDeviceName}
                onChange={(e) => setSelectedDeviceName(e.target.value)}
                className="bg-app border border-border-subtle rounded-xl px-2.5 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] font-mono max-w-[180px] truncate"
                title="Filtrar por modelo de câmera / dispositivo"
              >
                <option value="all">Equipamentos ({discoveredDevices.length})</option>
                {discoveredDevices
                  .filter((d) => deviceCategoryFilter === 'all' || d.category === deviceCategoryFilter)
                  .map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.count})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Dropdown de Lente Específica */}
          {discoveredLenses.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <select
                value={selectedLensName}
                onChange={(e) => setSelectedLensName(e.target.value)}
                className="bg-app border border-border-subtle rounded-xl px-2.5 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-[#FFCC00] font-mono max-w-[200px] truncate"
                title="Filtrar por modelo de lente"
              >
                <option value="all">🔍 Todas as Lentes ({discoveredLenses.length})</option>
                {discoveredLenses.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} ({l.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Direita: Ordenação Temporal */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-fg-muted uppercase">
            Ordenar:
          </span>
          <div className="inline-flex rounded-xl bg-app p-1 border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={() => setSortOrder('newest')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                sortOrder === 'newest'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
              title="Mais recentes primeiro (Data EXIF)"
            >
              <span className="material-symbols-outlined text-[15px]">schedule</span>
              <span>Mais Recentes</span>
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('oldest')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                sortOrder === 'oldest'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
              title="Mais antigas primeiro (Data EXIF)"
            >
              <span className="material-symbols-outlined text-[15px]">history</span>
              <span>Mais Antigas</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. CONTEÚDO PRINCIPAL: SEÇÕES DE SUBPASTAS OU GRID UNIFICADO PASSE-PARTOUT */}
      <div data-tour="portfolio-gallery">
        {filteredItems.length === 0 ? (
          /* Empty State */
        <div className="p-16 text-center bg-surface border border-border-subtle rounded-2xl space-y-3">
          {items.length === 0 ? (
            <div className="max-w-lg mx-auto space-y-4">
              <span className="material-symbols-outlined text-[64px] text-[var(--accent-secondary)] block">
                add_photo_alternate
              </span>
              <h3 className="text-xl font-bold text-fg font-['Bukra']">
                ❖ Acervo Pronto para Nova Estrutura
              </h3>
              <p className="text-sm text-fg-muted">
                Seu portfólio está limpo e pronto para receber o novo acervo de obras fotográficas.
              </p>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {isOwner && onOpenUploadModal && (
                  <button
                    type="button"
                    onClick={onOpenUploadModal}
                    className="px-4 py-2.5 bg-[var(--accent-secondary)] hover:opacity-90 text-[#121212] font-black rounded-xl text-xs transition-all flex items-center gap-2 shadow-md shadow-[var(--accent-secondary)]/20"
                  >
                    <span className="material-symbols-outlined text-[18px]">upload</span>
                    <span>Upload da Nova Estrutura</span>
                  </button>
                )}

                <Link
                  href="/servidor?folder=Portfolio"
                  className="px-4 py-2.5 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary)]">folder_open</span>
                  <span>Abrir no Servidor</span>
                </Link>

                {isOwner && onSyncPortfolio && (
                  <button
                    type="button"
                    onClick={() => onSyncPortfolio(false)}
                    disabled={isSyncing}
                    className="px-4 py-2.5 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[18px] text-[var(--accent-secondary)] ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Disco'}</span>
                  </button>
                )}
              </div>

              {/* Guia de Estrutura de Pastas */}
              <div className="mt-6 p-4 rounded-xl bg-app border border-border-subtle text-left text-xs font-mono space-y-1.5 text-fg-muted">
                <div className="font-bold text-fg text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5 text-[var(--accent-primary)]">
                  <span className="material-symbols-outlined text-[14px]">account_tree</span>
                  Como organizar suas pastas:
                </div>
                <div>📁 <span className="text-fg font-bold">Portfolio/</span></div>
                <div className="pl-4">📁 <span className="text-[var(--accent-secondary)] font-bold">Nome do Álbum/</span> <span className="text-fg-muted opacity-70">(ex: Ensaios, Street, Viagens)</span></div>
                <div className="pl-8">📁 <span className="text-fg-secondary">Subálbum (opcional)/</span></div>
                <div className="pl-12">📷 <span className="text-fg-secondary">foto01.jpg</span></div>
                <div className="pl-8">📷 <span className="text-fg-secondary">foto02.jpg</span></div>
              </div>
            </div>
          ) : (
            <>
              <span className="material-symbols-outlined text-[64px] text-fg-muted block">
                no_photography
              </span>
              <h3 className="text-lg font-bold text-fg">Nenhuma fotografia encontrada</h3>
              <p className="text-sm text-fg-muted max-w-md mx-auto">
                Nenhuma foto corresponde aos filtros ou à busca selecionada.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedAlbum('all');
                  setSelectedSubfolder('all');
                  setOnlyFavorites(false);
                  setSearchQuery('');
                }}
                className="mt-2 px-4 py-2 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-xl text-xs transition-colors"
              >
                Limpar Filtros
              </button>
            </>
          )}
        </div>
      ) : groupedSections && groupedSections.length > 0 ? (
        /* Modo Subpastas: Seções agrupadas com header individual */
        <div className="space-y-10">
          {groupedSections.map(([groupName, groupItems]) => {
            const isCollapsed = collapsedSections.has(groupName);
            const folderScope =
              selectedAlbum !== 'all'
                ? `Portfolio/${selectedAlbum}/${groupName}`
                : `Portfolio/${groupName}`;

            return (
              <div
                key={groupName}
                className="bg-surface border border-border-subtle rounded-2xl overflow-hidden transition-all"
              >
                {/* Cabeçalho da Seção de Pasta */}
                <div
                  onClick={() => toggleSectionCollapse(groupName)}
                  className="px-5 py-3.5 bg-surface-hover border-b border-border-subtle flex items-center justify-between cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-[#FFCC00]">
                      {isCollapsed ? 'folder' : 'folder_open'}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-fg font-['Bukra']">
                      {groupName}
                    </h3>
                    <span className="font-mono text-xs text-[#FFCC00] font-bold px-2 py-0.5 rounded bg-[#FFCC00]/10 border border-[#FFCC00]/20">
                      {groupItems.length} obras
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadActiveZip(folderScope, groupName);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-border-subtle text-[11px] font-mono text-[#FFCC00] flex items-center gap-1 transition-all"
                      title="Baixar esta subpasta em .ZIP"
                    >
                      <span className="material-symbols-outlined text-[14px]">folder_zip</span>
                      <span className="hidden sm:inline">Baixar Pasta (.ZIP)</span>
                    </button>
                    <span className="material-symbols-outlined text-fg-muted text-[20px]">
                      {isCollapsed ? 'expand_more' : 'expand_less'}
                    </span>
                  </div>
                </div>

                {/* Grid dos Itens da Seção */}
                {!isCollapsed && (
                  <div className={`p-4 grid gap-4 ${gridColClass}`}>
                    {groupItems.map((item) => {
                      const globalIndex = filteredItems.indexOf(item);
                      return renderPhotoCard(item, globalIndex);
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Modo Fluxo Contínuo / Diretão (Álbum Completo) */
        <div className={`grid gap-4 ${gridColClass}`}>
          {filteredItems.map((item, index) => renderPhotoCard(item, index))}
        </div>
      )}
      </div>

      {/* 5. MODAL DE INSPEÇÃO FOTOGRÁFICA 60FPS COM EXIF E NAVEGAÇÃO */}
      {inspectIndex !== null && (
        <PhotoInspectModal
          isOpen={inspectIndex !== null}
          onClose={() => setInspectIndex(null)}
          items={filteredItems}
          initialIndex={inspectIndex}
          serverUrl={serverUrl}
          isOwner={isOwner}
          onItemUpdated={(updated) => {
            onItemUpdated?.(updated);
          }}
        />
      )}
    </div>
  );

  // Renderizador do Card Passe-Partout de Cada Fotografia
  function renderPhotoCard(item: PhotoInspectItem, index: number) {
    const thumb =
      item.signedThumbUrl ||
      buildTenantThumbUrl(item.relative_path, item.itemTicket || effectiveTicket, {
        serverUrl,
      });

    const exif = item.exif_data || {};
    const lensInfo = exif.lens ? String(exif.lens) : null;
    const focalAperture =
      exif.focalLength && (exif.fNumber || exif.aperture)
        ? `${exif.focalLength} ${exif.fNumber || exif.aperture}`
        : null;

    return (
      <div
        key={item.relative_path}
        onClick={() => setInspectIndex(index)}
        className="group cursor-pointer bg-surface border border-border-subtle hover:border-[#FFCC00] rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between hover:shadow-xl hover:shadow-[#FFCC00]/5"
      >
        {/* Moldura Passe-Partout Respirável (object-contain sem cortes forçados) */}
        <div className="w-full aspect-[4/3] bg-app/80 dark:bg-[#101010] p-3 flex items-center justify-center relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={item.title || item.filename}
            loading="lazy"
            className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.fallback) {
                target.dataset.fallback = 'true';
                const safeTitle = encodeURIComponent((item.title || item.filename || 'Fotografia').slice(0, 30));
                const safeAlbum = encodeURIComponent((item.album || 'Acervo').slice(0, 25));
                target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%"><rect width="600" height="400" fill="%2318181b" rx="14"/><rect x="10" y="10" width="580" height="380" fill="none" stroke="rgba(245,158,11,0.2)" stroke-width="1.5" stroke-dasharray="6 4" rx="10"/><g transform="translate(300, 160)" text-anchor="middle"><circle cx="0" cy="0" r="44" fill="%2327272a" stroke="%23f59e0b" stroke-width="2.2"/><path d="M-18 -8 L-12 -16 L12 -16 L18 -8 L24 -8 C26.2 -8 28 -6.2 28 -4 L28 18 C28 20.2 26.2 22 24 22 L-24 22 C-26.2 22 -28 20.2 -28 18 L-28 -4 C-28 -6.2 -26.2 -8 -24 -8 Z" fill="none" stroke="%23f59e0b" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="7" r="9" fill="none" stroke="%23f59e0b" stroke-width="2.5"/><circle cx="16" cy="-2" r="2.5" fill="%23f59e0b"/><text y="74" fill="%23f1f5f9" font-family="system-ui, sans-serif" font-size="16" font-weight="600">${safeTitle}</text><text y="96" fill="%2394a3b8" font-family="system-ui, sans-serif" font-size="12">${safeAlbum} • HD USB em Espera</text></g></svg>`;
              }
            }}
          />

          {/* Badge de Favorito */}
          {item.is_favorite && (
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm p-1.5 rounded-full border border-[#FFCC00]/40 text-[#FFCC00]">
              <span className="material-symbols-outlined text-[16px] block">star</span>
            </div>
          )}

          {/* Overlay Inspecionar ao Hover */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="px-3 py-1.5 rounded-xl bg-black/80 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">zoom_in</span>
              Inspecionar
            </span>
          </div>
        </div>

        {/* Legenda & Metadados EXIF Compactos */}
        <div className="p-3 bg-surface border-t border-border-subtle space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-fg truncate" title={item.title || item.filename}>
              {item.title || item.filename}
            </h4>
            <span className="text-[10px] font-mono text-fg-muted shrink-0">
              {formatStorageBytes(item.size_bytes)}
            </span>
          </div>

          {/* Câmera / Lente / Abertura */}
          {(focalAperture || lensInfo || exif.camera || exif.model) && (
            <div className="text-[10px] text-fg-muted truncate flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] text-[#FFCC00]">
                photo_camera
              </span>
              <span className="truncate">
                {focalAperture || lensInfo || String(exif.camera || exif.model)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
}
