// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/portfolio/AurtisticGalleryGrid.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { UserFileIndexRow } from '@/types';
import { buildTenantThumbUrl, buildTenantZipUrl, formatStorageBytes, resolveClientEdgeServerUrl } from '@/lib/edge-urls';
import { PhotoInspectModal, type PhotoInspectItem } from './PhotoInspectModal';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { getPortfolioAlbumZipUrlAction, savePortfolioLayoutOrderAction } from '@/app/(dashboard)/actions';

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
  isEditingPortfolio?: boolean;
  onToggleEditPortfolio?: () => void;
  hiddenPhotoIds?: string[];
  hiddenPhotoFolders?: string[];
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

  const make = String(exif.make || '').trim();
  const model = String(exif.model || exif.camera || '').trim();
  const rawModel = model || make;
  // Classifica por fabricante + modelo (ex.: Xiaomi "M2101K6G" não traz a marca no modelo)
  const haystack = `${make} ${model}`.toLowerCase();

  if (/canon|nikon|sony|fujifilm|fuji|leica|hasselblad|panasonic|olympus|pentax|\beos\b|rebel|lumix|ilce/i.test(haystack)) {
    return { category: 'camera', name: rawModel || 'Câmera Profissional' };
  }
  if (/dji|mavic|phantom|autel/i.test(haystack)) {
    return { category: 'drone', name: rawModel || 'Drone' };
  }
  if (
    /iphone|ipad|apple|samsung|galaxy|xiaomi|redmi|poco|motorola|moto|pixel|google|huawei|honor|oppo|oneplus|realme|vivo|asus|zenfone|nokia|\blg\b|sm-[a-z]\d/i.test(haystack) ||
    /^m\d{4}[a-z0-9]+/i.test(model) ||
    /^\d{7}[a-z]{1,2}\b/i.test(model)
  ) {
    return { category: 'mobile', name: rawModel || 'Celular' };
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
  isEditingPortfolio = false,
  onToggleEditPortfolio,
  hiddenPhotoIds = [],
  hiddenPhotoFolders = [],
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtros Avançados de Dispositivo e Ordenação Temporal
  const [deviceCategoryFilter, setDeviceCategoryFilter] = useState<'all' | 'camera' | 'mobile'>('all');
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

  // Ordem Customizada das Subpastas por Álbum (Persistida em localStorage)
  const [customSubfolderOrder, setCustomSubfolderOrder] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('aurtistic_portfolio_subfolder_order');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  const editModeActive = Boolean(isEditingPortfolio || isReorderingAlbums);

  const handleToggleEditMode = useCallback(() => {
    if (onToggleEditPortfolio) {
      onToggleEditPortfolio();
    } else {
      setIsReorderingAlbums((prev) => !prev);
    }
  }, [onToggleEditPortfolio]);

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

  // Helper para extrair a subpasta de uma foto
  const extractItemSubfolder = useCallback((item: PhotoInspectItem): string | undefined => {
    const alb = item.album || 'Geral';
    let sub: string | undefined = item.category;
    if (!sub || sub === 'Fotografia' || sub === alb) {
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
    if (sub && sub !== alb && sub !== 'Fotografia') {
      return sub;
    }
    return undefined;
  }, []);

  // Dispositivo e lente: SOMENTE pelos metadados (EXIF) da foto
  const getEffectiveItemDevice = useCallback(
    (item: PhotoInspectItem) => resolveItemDeviceInfo(item),
    []
  );
  const getEffectiveItemLens = useCallback(
    (item: PhotoInspectItem) => resolveItemLensInfo(item),
    []
  );

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

  // Move a Ordem de um Álbum
  const handleMoveAlbum = useCallback(
    (albumName: string, direction: -1 | 1) => {
      const currentList = [...sortedAlbums];
      const idx = currentList.indexOf(albumName);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= currentList.length) return;

      const tmp = currentList[idx];
      currentList[idx] = currentList[targetIdx];
      currentList[targetIdx] = tmp;

      setCustomAlbumOrder(currentList);
      try {
        localStorage.setItem('aurtistic_portfolio_album_order', JSON.stringify(currentList));
      } catch {}

      // Persiste no Supabase via merge_user_features_config (RPC atômica do perfil)
      void savePortfolioLayoutOrderAction({ albumOrder: currentList });

      try {
        const edgeBase = resolveClientEdgeServerUrl(serverUrl);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (effectiveTicket) headers['Authorization'] = `Bearer ${effectiveTicket}`;
        fetch(`${edgeBase}/api/portfolio/layout`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ albumOrder: currentList }),
        }).catch(() => {});
      } catch {}

      showToast(`Ordem das pastas atualizada: "${albumName}" movida.`);
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

  // Extrai e Ordena Subpastas do Álbum Alvo respeitando a Ordem Customizada
  const targetSubfolders = useMemo(() => {
    const subMap: Record<string, number> = {};
    for (const item of items) {
      if (item.album === targetAlbumForSubfolders) {
        const sub = extractItemSubfolder(item);
        if (sub) {
          subMap[sub] = (subMap[sub] || 0) + 1;
        }
      }
    }
    const entries = Object.entries(subMap).sort((a, b) => b[1] - a[1]);
    const savedOrder = customSubfolderOrder[targetAlbumForSubfolders];
    if (savedOrder && savedOrder.length > 0) {
      const entryMap = new Map(entries);
      const ordered: [string, number][] = [];
      for (const name of savedOrder) {
        if (entryMap.has(name)) {
          ordered.push([name, entryMap.get(name)!]);
          entryMap.delete(name);
        }
      }
      for (const [name, count] of entryMap.entries()) {
        ordered.push([name, count]);
      }
      return ordered;
    }
    return entries;
  }, [items, targetAlbumForSubfolders, extractItemSubfolder, customSubfolderOrder]);

  // Move a Ordem de uma Subpasta dentro do Álbum Alvo
  const handleMoveSubfolder = useCallback(
    (albumName: string, subfolderName: string, direction: -1 | 1) => {
      const currentNames = targetSubfolders.map(([name]) => name);
      const idx = currentNames.indexOf(subfolderName);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= currentNames.length) return;

      const tmp = currentNames[idx];
      currentNames[idx] = currentNames[targetIdx];
      currentNames[targetIdx] = tmp;

      setCustomSubfolderOrder((prev) => {
        const next = { ...prev, [albumName]: currentNames };
        try {
          localStorage.setItem('aurtistic_portfolio_subfolder_order', JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast(`Subpasta "${subfolderName}" movida.`);
    },
    [targetSubfolders, showToast]
  );

  // Total de Favoritas
  const totalFavorites = useMemo(
    () => items.filter((it) => Boolean(it.is_favorite)).length,
    [items]
  );

  // Lista Dinâmica de Equipamentos Encontrados no Acervo (Incluindo Configurados nas Pastas)
  const discoveredDevices = useMemo(() => {
    const map = new Map<string, { category: string; count: number }>();
    for (const item of items) {
      const dev = getEffectiveItemDevice(item);
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
  }, [items, getEffectiveItemDevice]);

  // Lista Dinâmica de Lentes Encontradas no Acervo (Incluindo Configuradas nas Pastas)
  const discoveredLenses = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const lens = getEffectiveItemLens(item);
      if (lens) {
        map.set(lens, (map.get(lens) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items, getEffectiveItemLens]);

  // Filtragem Geral de Itens
  const filteredItems = useMemo(() => {
    const list = items.filter((item) => {
      // Se não for dono, fotos e álbuns ocultados na curadoria não aparecem
      const isItemHidden =
        hiddenPhotoIds.includes(item.id) ||
        hiddenPhotoIds.includes(item.relative_path) ||
        Boolean(item.album && hiddenPhotoFolders.includes(item.album));

      if (!isOwner && isItemHidden) {
        return false;
      }

      if (onlyFavorites && !item.is_favorite) return false;

      // Filtro de Álbum
      if (selectedAlbum !== 'all' && item.album !== selectedAlbum) return false;

      // Filtro de Subpasta
      const itemSub = extractItemSubfolder(item);
      if (selectedSubfolder !== 'all' && itemSub !== selectedSubfolder) {
        return false;
      }

      // Filtro de Dispositivo (Câmera / Celular) pelos metadados
      if (deviceCategoryFilter !== 'all') {
        const dev = getEffectiveItemDevice(item);
        if (dev.category !== deviceCategoryFilter) return false;
      }

      // Filtro de Equipamento Específico (Câmera / Celular)
      if (selectedDeviceName !== 'all') {
        const dev = getEffectiveItemDevice(item);
        if (dev.name !== selectedDeviceName) return false;
      }

      // Filtro de Lente Específica
      if (selectedLensName !== 'all') {
        const lens = getEffectiveItemLens(item);
        if (lens !== selectedLensName) return false;
      }

      // Busca Textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const nameMatch = item.filename?.toLowerCase().includes(q);
        const albumMatch = item.album?.toLowerCase().includes(q);
        const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
        const dev = getEffectiveItemDevice(item);
        const lens = getEffectiveItemLens(item);
        const cameraMatch = String(
          item.exif_data?.camera || item.exif_data?.model || dev.name || ''
        ).toLowerCase().includes(q);
        const lensMatch = String(lens || item.exif_data?.lens || '').toLowerCase().includes(q);
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
    extractItemSubfolder,
    deviceCategoryFilter,
    selectedDeviceName,
    selectedLensName,
    getEffectiveItemDevice,
    getEffectiveItemLens,
    sortOrder,
    searchQuery,
    hiddenPhotoIds,
    hiddenPhotoFolders,
    isOwner,
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
              className="px-3 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Sincronizar acervo com o disco físico do servidor"
            >
              <span className={`material-symbols-outlined text-[18px] text-[var(--accent-secondary)] ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>
          )}

          {/* Botão de Editar Portfólio (exibido apenas se não houver botão pai) */}
          {isOwner && !onToggleEditPortfolio && (
            <button
              type="button"
              onClick={handleToggleEditMode}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                editModeActive
                  ? 'bg-accent-primary text-on-accent-primary border-accent-primary shadow-md shadow-accent-primary/20 font-black'
                  : 'bg-surface hover:bg-surface-hover text-fg border-border-subtle hover:border-[#FFCC00]'
              }`}
              title="Editar ordem das pastas e marcar qual equipamento foi usado em cada pasta"
            >
              <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                {editModeActive ? 'done' : 'edit_square'}
              </span>
              <span>{editModeActive ? 'Concluir Edição' : 'Editar Portfólio'}</span>
            </button>
          )}
        </div>
      </div>

      {/* PAINEL DE EDIÇÃO DO PORTFÓLIO (ORDEM DAS PASTAS & EQUIPAMENTOS POR PASTA) */}
      {isOwner && editModeActive && (
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border-2 border-accent-primary/60 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FFCC00] text-[22px]">tune</span>
              <div>
                <h3 className="text-sm font-black text-fg uppercase tracking-wider font-['Bukra']">
                  Editor do Portfólio • Ordem das Pastas
                </h3>
                <p className="text-xs text-fg-secondary">
                  Mude a ordem de exibição das pastas e subpastas. Câmera/celular são identificados automaticamente pelos metadados das fotos.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleEditMode}
              className="px-3 py-1.5 rounded-xl bg-accent-primary text-on-accent-primary text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
            >
              Concluir Edição ✓
            </button>
          </div>

          {/* 1. Reordenação Visual e Equipamento de Cada Pasta Principal */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-[#FFCC00] uppercase tracking-wider block">
              1. Ordem das Pastas Principais ({sortedAlbums.length})
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {sortedAlbums.map((alb, idx) => {
                return (
                  <div
                    key={alb}
                    className="p-3 rounded-xl bg-app border border-border-subtle flex flex-col gap-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-surface border border-border-subtle font-mono text-[10px] text-fg-muted">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-fg truncate">{alb}</span>
                        <span className="text-[10px] font-mono text-fg-muted">
                          ({albumCounts[alb] || 0})
                        </span>
                      </div>

                      {/* Botões de Mover Ordem da Pasta */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveAlbum(alb, -1)}
                          className="px-2 py-1 rounded bg-surface hover:bg-surface-hover border border-border-subtle text-fg disabled:opacity-25 font-bold cursor-pointer"
                          title="Mover pasta para antes"
                        >
                          ◀ Subir
                        </button>
                        <button
                          type="button"
                          disabled={idx === sortedAlbums.length - 1}
                          onClick={() => handleMoveAlbum(alb, 1)}
                          className="px-2 py-1 rounded bg-surface hover:bg-surface-hover border border-border-subtle text-fg disabled:opacity-25 font-bold cursor-pointer"
                          title="Mover pasta para depois"
                        >
                          Descer ▶
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Subpastas do Álbum Selecionado (Ordem e Equipamento por Subpasta) */}
          {targetSubfolders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border-subtle">
              <span className="text-[11px] font-bold text-[#C77DFF] uppercase tracking-wider block">
                2. Subpastas de &quot;{targetAlbumForSubfolders}&quot; ({targetSubfolders.length}) — Ordem
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {targetSubfolders.map(([subName, subCount], sIdx) => {
                  return (
                    <div
                      key={`${targetAlbumForSubfolders}/${subName}`}
                      className="p-2.5 rounded-xl bg-app border border-border-subtle flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-fg truncate">
                          📂 {subName} <span className="text-fg-muted font-mono">({subCount})</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sIdx === 0}
                            onClick={() => handleMoveSubfolder(targetAlbumForSubfolders, subName, -1)}
                            className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg disabled:opacity-25 cursor-pointer"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            disabled={sIdx === targetSubfolders.length - 1}
                            onClick={() => handleMoveSubfolder(targetAlbumForSubfolders, subName, 1)}
                            className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg disabled:opacity-25 cursor-pointer"
                          >
                            ▶
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* 2. PÍLULAS DOS ÁLBUNS PRINCIPAIS (COM ROLAGEM HORIZONTAL E ÍCONES TEMÁTICOS) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin" data-tour="portfolio-albums">
        {/* Botão Fixo no Início para Ativar/Desativar Reordenação e Edição de Pastas */}
        {isOwner && (
          <button
            type="button"
            onClick={handleToggleEditMode}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              editModeActive
                ? 'bg-accent-primary text-on-accent-primary border-accent-primary shadow-sm font-black'
                : 'bg-surface hover:bg-surface-hover text-[#FFCC00] border-[#FFCC00]/40 hover:border-[#FFCC00]'
            }`}
            title="Mudar a ordem das pastas/álbuns e definir equipamentos"
          >
            <span className="material-symbols-outlined text-[16px]">
              {editModeActive ? 'done' : 'swap_horiz'}
            </span>
            <span>{editModeActive ? 'Concluir' : 'Mover / Editar'}</span>
          </button>
        )}

        {/* Chip 'Todas as Obras' */}
        <button
          type="button"
          onClick={() => {
            setSelectedAlbum('all');
            setSelectedSubfolder('all');
          }}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-all border cursor-pointer ${
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
                className="px-3.5 py-2 text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                <span>{alb}</span>
                <span className="font-mono text-xs opacity-80">({count})</span>
              </button>

              {/* Botões de Mover Ordem (Quando modo editar/reordenar ativo) */}
              {editModeActive && (
                <div className="flex items-center gap-0.5 pr-2 pl-1 border-l border-current/20" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={albIdx === 0}
                    onClick={() => handleMoveAlbum(alb, -1)}
                    className="p-1 rounded hover:bg-black/20 text-current disabled:opacity-20 transition-transform active:scale-90 cursor-pointer"
                    title={`Mover "${alb}" para a esquerda`}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    disabled={albIdx === sortedAlbums.length - 1}
                    onClick={() => handleMoveAlbum(alb, 1)}
                    className="p-1 rounded hover:bg-black/20 text-current disabled:opacity-20 transition-transform active:scale-90 cursor-pointer"
                    title={`Mover "${alb}" para a direita`}
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. BARRA DE SUBPASTAS, EQUIPAMENTO DA PASTA, MODO DE EXIBIÇÃO, COLUNAS E DOWNLOAD .ZIP */}
      <div className="bg-surface border border-border-subtle p-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm" data-tour="portfolio-view-controls">
        {/* Esquerda: Segmented Control ('▤ Ver Álbum Completo' vs '📂 Por Subpastas') + Seletor de Equipamento da Pasta + Chips */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Controle Segmentado */}
          <div className="inline-flex rounded-xl bg-app p-1 border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={() => setSubfolderMode('full')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                subfolderMode === 'full'
                  ? 'bg-accent-primary text-on-accent-primary shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span>▤</span>
              <span>Ver Álbum Completo</span>
            </button>
            <button
              type="button"
              onClick={() => setSubfolderMode('subfolders')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                subfolderMode === 'subfolders'
                  ? 'bg-accent-primary text-on-accent-primary shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span>📂</span>
              <span>Por Subpastas</span>
            </button>
          </div>

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
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-colors border cursor-pointer ${
                    selectedSubfolder === 'all'
                      ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00]'
                      : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border-border-subtle'
                  }`}
                >
                  Todas ({albumCounts[targetAlbumForSubfolders] || 0})
                </button>
                {targetSubfolders.map(([subName, count], sIdx) => {
                  const isSelected = selectedSubfolder === subName;
                  return (
                    <div
                      key={subName}
                      className={`inline-flex items-center rounded-lg border transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00]'
                          : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border-border-subtle'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSubfolder(subName)}
                        className="px-2.5 py-1 text-xs font-mono font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer"
                      >
                        <span>{subName} ({count})</span>
                      </button>
                      {editModeActive && (
                        <div className="flex items-center pr-1 border-l border-current/20">
                          <button
                            type="button"
                            disabled={sIdx === 0}
                            onClick={() => handleMoveSubfolder(targetAlbumForSubfolders, subName, -1)}
                            className="px-1 text-[10px] disabled:opacity-20 cursor-pointer"
                            title="Mover subpasta para a esquerda"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            disabled={sIdx === targetSubfolders.length - 1}
                            onClick={() => handleMoveSubfolder(targetAlbumForSubfolders, subName, 1)}
                            className="px-1 text-[10px] disabled:opacity-20 cursor-pointer"
                            title="Mover subpasta para a direita"
                          >
                            ▶
                          </button>
                        </div>
                      )}
                    </div>
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

      {/* 3.1 Botão de expandir filtros no Mobile (inicia recolhido) + Filtros Avançados */}
      <div className="sm:hidden flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs font-bold text-fg cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
          <span>Filtros</span>
          {(deviceCategoryFilter !== 'all' || selectedDeviceName !== 'all' || selectedLensName !== 'all' || onlyFavorites || searchQuery.trim() !== '') && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#FFCC00] text-black text-[10px] font-black">
              {[
                deviceCategoryFilter !== 'all',
                selectedDeviceName !== 'all',
                selectedLensName !== 'all',
                onlyFavorites,
                searchQuery.trim() !== '',
              ].filter(Boolean).length}
            </span>
          )}
          <span className="material-symbols-outlined text-[16px]">{mobileFiltersOpen ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>

      <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex bg-surface/80 border border-border-subtle p-2.5 rounded-2xl flex-wrap items-center justify-between gap-3 text-xs`}>
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
                  ? 'bg-[var(--accent-primary)] text-on-accent-primary font-bold shadow-sm'
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
                  ? 'bg-[var(--accent-primary)] text-on-accent-primary font-bold shadow-sm'
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
                  ? 'bg-[var(--accent-primary)] text-on-accent-primary font-bold shadow-sm'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">smartphone</span>
              <span>Celulares</span>
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
                  ? 'bg-[var(--accent-primary)] text-on-accent-primary font-bold shadow-sm'
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
                  ? 'bg-[var(--accent-primary)] text-on-accent-primary font-bold shadow-sm'
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

                {/* Grid Masonry em colunas flex determinísticas */}
                {!isCollapsed && (
                  <div className="p-4">
                    {renderMasonryItems(groupItems)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Modo Fluxo Contínuo / Diretão (Masonry em colunas flex determinísticas) */
        renderMasonryItems(filteredItems)
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

  // Renderizador Masonry determinístico em colunas flex (preserva ordem visual sem colapso CSS columns)
  function renderMasonryItems(list: PhotoInspectItem[]) {
    const colCount = Math.max(1, gridCols);
    const buckets: { item: PhotoInspectItem; globalIndex: number }[][] = Array.from(
      { length: colCount },
      () => []
    );
    list.forEach((item, idx) => {
      const globalIndex = filteredItems.indexOf(item);
      buckets[idx % colCount].push({ item, globalIndex: globalIndex >= 0 ? globalIndex : idx });
    });

    return (
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {buckets.map((col, colIdx) => (
          <div key={colIdx} className="flex-1 min-w-0 w-full flex flex-col gap-4">
            {col.map(({ item, globalIndex }) => renderPhotoCard(item, globalIndex))}
          </div>
        ))}
      </div>
    );
  }

  // Renderizador do Card Passe-Partout de Cada Fotografia
  function renderPhotoCard(item: PhotoInspectItem, index: number) {
    const thumb =
      item.signedThumbUrl ||
      buildTenantThumbUrl(item.relative_path, item.itemTicket || effectiveTicket, {
        serverUrl,
      });

    const exif = item.exif_data || {};
    const effectiveDev = getEffectiveItemDevice(item);
    const effectiveLens = getEffectiveItemLens(item);
    const lensInfo = effectiveLens || (exif.lens ? String(exif.lens) : null);
    const focalAperture =
      exif.focalLength && (exif.fNumber || exif.aperture)
        ? `${exif.focalLength} ${exif.fNumber || exif.aperture}`
        : null;
    const displayEquipmentText =
      focalAperture || lensInfo || effectiveDev.name || String(exif.camera || exif.model || '');

    const isItemHidden =
      hiddenPhotoIds.includes(item.id) ||
      hiddenPhotoIds.includes(item.relative_path) ||
      Boolean(item.album && hiddenPhotoFolders.includes(item.album));

    return (
      <div
        key={item.relative_path}
        onClick={() => setInspectIndex(index)}
        className={`group cursor-pointer bg-surface border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between hover:shadow-xl hover:shadow-[#FFCC00]/5 ${
          isItemHidden
            ? 'opacity-70 border-dashed border-amber-500/50'
            : 'border-border-subtle hover:border-[#FFCC00]'
        }`}
      >
        {/* Moldura Passe-Partout em Proporção Natural (sem cortes forçados em caixas rígidas) */}
        <div className="w-full bg-app/80 dark:bg-[#101010] p-2.5 flex items-center justify-center relative overflow-hidden">
          {/* Badge de Oculto (apenas visível para o dono) */}
          {isItemHidden && (
            <div className="absolute top-2 left-2 z-10 bg-amber-500/80 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold text-black flex items-center gap-1 shadow-md">
              <span className="material-symbols-outlined text-[13px]">visibility_off</span>
              Oculta
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={item.title || item.filename}
            loading="lazy"
            className="w-full h-auto object-contain rounded-lg transition-transform duration-500 group-hover:scale-[1.02]"
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
          {displayEquipmentText && (
            <div className="text-[10px] text-fg-muted truncate flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] text-[#FFCC00]">
                {effectiveDev.category === 'mobile' ? 'smartphone' : 'photo_camera'}
              </span>
              <span className="truncate">
                {displayEquipmentText}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
}
