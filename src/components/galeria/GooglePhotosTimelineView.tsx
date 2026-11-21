// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryTimelineCursor, GalleryTimelineItem } from '@/types/storage';
import {
  getGalleryTimelinePageAction,
  getGalleryAlbumsAction,
  getPhotoExifDetailAction,
  createShareLinkAction,
  updateFileEcosystemLinksAction,
} from '@/app/(dashboard)/servidor/actions';
import { getUserOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { SmartBackupSettingsModal } from './SmartBackupSettingsModal';
import {
  DEFAULT_VAULT_SORT,
  loadVaultSortPreference,
  saveVaultSortPreference,
  sortVaultFiles,
  type VaultSortPreference,
} from '@/lib/vault-sorting';
import { VaultSortControl } from '@/components/servidor/VaultSortControl';

type TimelineFilter = 'all' | 'favorites' | 'camera' | 'mobile' | 'portfolio';

const ROW_HEIGHT = 160;
const SKELETON_RATIOS = [1.5, 1, 0.75, 1.33, 1.78, 1, 0.66, 1.5];

function TimelineSkeletonRow({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-1.5 after:content-[''] after:grow-[20]">
      {Array.from({ length: count }).map((_, i) => {
        const r = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
        return (
          <div
            key={i}
            style={{ height: ROW_HEIGHT, width: ROW_HEIGHT * r, flexGrow: r }}
            className="rounded-lg bg-white/5 border border-white/5 animate-pulse max-w-full"
          />
        );
      })}
    </div>
  );
}

export interface GooglePhotosTimelineViewProps {
  organizationId?: string | null;
  fallbackItems?: GalleryTimelineItem[];
  hideScopeSelector?: boolean;
}

export function GooglePhotosTimelineView({
  organizationId = null,
  fallbackItems = [],
  hideScopeSelector = false,
}: GooglePhotosTimelineViewProps = {}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(organizationId || null);
  useEffect(() => {
    setSelectedOrgId(organizationId || null);
  }, [organizationId]);
  const [userOrgs, setUserOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setSelectedAlbum(null);
  }, [selectedOrgId]);
  const [availableAlbums, setAvailableAlbums] = useState<{ name: string; count: number }[]>([]);
  const [items, setItems] = useState<GalleryTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<GalleryTimelineCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<GalleryTimelineItem | null>(null);
  const [selectedExif, setSelectedExif] = useState<Record<string, any> | null>(null);
  const [exifLoading, setExifLoading] = useState(false);
  const [thumbFallbackIds, setThumbFallbackIds] = useState<Record<string, boolean>>({});
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});
  const [retrySeeds, setRetrySeeds] = useState<Record<string, number>>({});
  const [lightboxImgFailed, setLightboxImgFailed] = useState(false);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [sortPref, setSortPref] = useState<VaultSortPreference>(DEFAULT_VAULT_SORT);

  useEffect(() => {
    setSortPref(loadVaultSortPreference());
  }, []);

  const handleSortChange = (next: VaultSortPreference) => {
    setSortPref(next);
    saveVaultSortPreference(next);
  };

  // Estado de Compartilhamento & Edição Rápida no Lightbox
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [editAlbum, setEditAlbum] = useState('');
  const [editFavorite, setEditFavorite] = useState(false);
  const [editPortfolio, setEditPortfolio] = useState(false);
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);
  const [quickEditStatus, setQuickEditStatus] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void getUserOrganizationsAction().then((res) => {
      if (active && res && res.ok && Array.isArray(res.organizations)) {
        setUserOrgs(
          res.organizations.map((o: any) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
          }))
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Carrega lista de álbuns disponíveis sempre que mudar o escopo de organização/usuário
  useEffect(() => {
    let active = true;
    void getGalleryAlbumsAction({ organizationId: selectedOrgId || null }).then((res) => {
      if (active && res && res.ok && Array.isArray(res.albums)) {
        setAvailableAlbums(res.albums);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedOrgId]);

  const fetchPage = useCallback(
    async (cursor: GalleryTimelineCursor | null, reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await getGalleryTimelinePageAction({
          cursorCapturedAt: cursor?.capturedAt || null,
          cursorId: cursor?.id || null,
          filter,
          limit: 48,
          organizationId: selectedOrgId || null,
          album: selectedAlbum || null,
        });
        if (res.ok) {
          setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
          setNextCursor(res.nextCursor);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, selectedOrgId, selectedAlbum, sortPref]
  );

  useEffect(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  // Se a consulta no banco não retornar itens, usa os arquivos em cache do cofre/Edge
  const displayItems = items.length > 0 ? items : fallbackItems;

  // Scroll infinito via IntersectionObserver usando paginação keyset
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !nextCursor || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor && !loadingMore) {
          void fetchPage(nextCursor, false);
        }
      },
      { rootMargin: '900px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchPage]);

  // Agrupamento cronológico por Dia quando ordenado por Data; grade contínua para Nome/Tipo/Tamanho
  const groupedSections = useMemo(() => {
    const sortedItems = sortVaultFiles(
      displayItems.map((it) => ({ ...it, name: it.filename })),
      sortPref
    );

    if (sortPref.field !== 'date') {
      const labelMap = {
        name: 'Ordenado por Nome',
        type: 'Ordenado por Tipo',
        size: 'Ordenado por Tamanho',
      } as const;
      return sortedItems.length > 0
        ? [
            {
              key: `sorted-${sortPref.field}`,
              label: `${labelMap[sortPref.field]} (${sortPref.direction === 'asc' ? '↑' : '↓'})`,
              monthKey: 'sorted',
              monthLabel: 'Todos',
              items: sortedItems,
            },
          ]
        : [];
    }

    const groups: {
      key: string;
      label: string;
      monthKey: string;
      monthLabel: string;
      items: GalleryTimelineItem[];
    }[] = [];
    const map = new Map<string, GalleryTimelineItem[]>();

    for (const item of sortedItems) {
      const dt = new Date(item.captured_at);
      const valid = !isNaN(dt.getTime());
      const dayKey = valid
        ? dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'Sem data';
      const monthKey = valid
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        : 'sem-data';
      const monthLabel = valid
        ? dt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
        : 'Sem data';

      let list = map.get(dayKey);
      if (!list) {
        list = [];
        map.set(dayKey, list);
        groups.push({ key: dayKey, label: dayKey, monthKey, monthLabel, items: list });
      }
      list.push(item);
    }

    return groups;
  }, [displayItems]);

  const monthScrubberItems = useMemo(() => {
    const seen = new Map<string, { monthKey: string; monthLabel: string; firstSectionKey: string }>();
    for (const group of groupedSections) {
      if (!seen.has(group.monthKey)) {
        seen.set(group.monthKey, {
          monthKey: group.monthKey,
          monthLabel: group.monthLabel,
          firstSectionKey: group.key,
        });
      }
    }
    return Array.from(seen.values());
  }, [groupedSections]);

  const scrollToSection = (sectionKey: string) => {
    const el = document.getElementById(`timeline-day-${encodeURIComponent(sectionKey)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOpenDetail = async (item: GalleryTimelineItem) => {
    setSelectedItem(item);
    setSelectedExif(null);
    setLightboxImgFailed(false);
    setShareFeedback(null);
    setIsQuickEditOpen(false);
    setQuickEditStatus(null);
    setEditAlbum(item.album || '');
    setEditFavorite(Boolean(item.is_favorite));
    setEditPortfolio(Boolean(item.show_in_portfolio));
    setExifLoading(true);
    try {
      const res = await getPhotoExifDetailAction(item.id);
      if (res.ok) setSelectedExif(res.exifData || null);
    } finally {
      setExifLoading(false);
    }
  };

  const handleQuickShare = async (item: GalleryTimelineItem) => {
    setSharingBusy(true);
    setShareFeedback(null);
    try {
      const parts = String(item.relative_path || '').split('/').filter(Boolean);
      const parentFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : item.relative_path;
      const res = await createShareLinkAction({
        folderPath: parentFolder,
        albumTitle: item.album || item.filename || 'Galeria Compartilhada',
        allowDownload: true,
      });
      const shareUrl =
        res && 'shareUrl' in res && typeof res.shareUrl === 'string'
          ? res.shareUrl
          : item.signedStreamUrl;
      if (typeof navigator !== 'undefined' && navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
      setShareFeedback(res?.ok ? 'Link compartilhável copiado!' : 'Link direto copiado!');
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard && item.signedStreamUrl) {
        await navigator.clipboard.writeText(item.signedStreamUrl).catch(() => {});
      }
      setShareFeedback('Link direto copiado!');
    } finally {
      setSharingBusy(false);
    }
  };

  const handleSaveQuickEdit = async () => {
    if (!selectedItem) return;
    setSavingQuickEdit(true);
    setQuickEditStatus(null);
    try {
      const res = await updateFileEcosystemLinksAction({
        relativePath: selectedItem.relative_path,
        filename: selectedItem.filename,
        mimeType: selectedItem.mime_type,
        sizeBytes: selectedItem.size_bytes,
        patch: {
          album: editAlbum.trim() || undefined,
          isFavorite: editFavorite,
          showInPortfolio: editPortfolio,
        },
      });
      if (res?.ok !== false) {
        const updated: GalleryTimelineItem = {
          ...selectedItem,
          album: editAlbum.trim(),
          is_favorite: editFavorite,
          show_in_portfolio: editPortfolio,
        };
        setSelectedItem(updated);
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
        setQuickEditStatus('Alterações salvas!');
        setIsQuickEditOpen(false);
      } else {
        setQuickEditStatus(res?.error || 'Erro ao salvar.');
      }
    } catch {
      setQuickEditStatus('Falha ao salvar alterações.');
    } finally {
      setSavingQuickEdit(false);
    }
  };

  const filterButtons: { id: TimelineFilter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'favorites', label: 'Favoritas' },
    { id: 'camera', label: 'Câmera' },
    { id: 'mobile', label: 'Celular' },
    { id: 'portfolio', label: 'Portfólio' },
  ];

  return (
    <div className="min-h-full p-4 md:p-6 space-y-5 bg-app text-fg">
      {/* Barra Superior Estilo Google Fotos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border-subtle rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">Galeria Contínua (Fotos)</h1>
            <p className="text-xs text-fg-muted">
              Fluxo cronológico contínuo indexado por data de captura EXIF
            </p>
          </div>

          {/* Seletor de Escopo do Cofre: Pessoal vs Organização */}
          {!hideScopeSelector && userOrgs.length > 0 && (
            <div className="flex items-center gap-2 bg-app px-3 py-1.5 rounded-xl border border-border-subtle">
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">Cofre:</span>
              <select
                value={selectedOrgId || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setSelectedOrgId(val);
                }}
                className="bg-transparent text-xs font-bold text-fg outline-none cursor-pointer"
              >
                <option value="" className="bg-[#121722] text-white">Meu Cofre Pessoal</option>
                {userOrgs.map((org) => (
                  <option key={org.id} value={org.id} className="bg-[#121722] text-white">
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <VaultSortControl value={sortPref} onChange={handleSortChange} compact />
          {/* Seletor de Álbuns Específicos */}
          {availableAlbums.length > 0 && (
            <div className="flex items-center gap-2 bg-app px-3 py-1.5 rounded-xl border border-border-subtle">
              <span className="material-symbols-outlined text-[16px] text-amber-400">photo_library</span>
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">Álbum:</span>
              <select
                value={selectedAlbum || ''}
                onChange={(e) => setSelectedAlbum(e.target.value || null)}
                className="bg-transparent text-xs font-bold text-fg outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="" className="bg-[#121722] text-white">Todos os Álbuns</option>
                {availableAlbums.map((alb) => (
                  <option key={alb.name} value={alb.name} className="bg-[#121722] text-white">
                    {alb.name} ({alb.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilter(btn.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                filter === btn.id
                  ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                  : 'border-border-subtle text-fg-secondary hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsBackupModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 cursor-pointer"
          >
            Backup Wi-Fi &amp; Espaço
          </button>
        </div>
      </div>

      {/* Banner de Álbum Ativo quando filtrado */}
      {selectedAlbum && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-400">folder_open</span>
            <span className="text-fg-secondary">Visualizando apenas o álbum:</span>
            <strong className="text-amber-300 font-bold">{selectedAlbum}</strong>
            <span className="text-[11px] text-fg-muted">({displayItems.length} foto{displayItems.length === 1 ? '' : 's'})</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAlbum(null)}
            className="flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer"
          >
            Ver Todos os Álbuns
          </button>
        </div>
      )}

      {/* Timeline Contínua */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando fotos">
          <div className="h-5 w-40 rounded bg-white/10 animate-pulse" />
          <TimelineSkeletonRow count={24} />
        </div>
      ) : groupedSections.length === 0 ? (
        <div className="py-16 text-center text-sm text-fg-muted border border-dashed border-border-subtle rounded-2xl">
          Nenhuma foto encontrada para este filtro.
        </div>
      ) : (
        <div className="relative flex gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-8">
            {groupedSections.map((group) => (
              <section
                key={group.key}
                id={`timeline-day-${encodeURIComponent(group.key)}`}
                className="space-y-2.5 scroll-mt-4"
              >
                <div className="sticky top-0 z-10 py-1.5 bg-app/90 backdrop-blur-sm flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white capitalize">{group.label}</h2>
                  <span className="text-[11px] text-fg-muted">{group.items.length} foto(s)</span>
                </div>

                <div className="flex flex-wrap gap-1.5 after:content-[''] after:grow-[20]">
                  {group.items.map((item) => {
                    const useFallback = Boolean(thumbFallbackIds[item.id]);
                    const isBroken = Boolean(brokenImageIds[item.id]);
                    const rawImgSrc = useFallback ? item.signedStreamUrl : item.signedThumbUrl;
                    const seed = retrySeeds[item.id];
                    const imgSrc = seed && rawImgSrc
                      ? `${rawImgSrc}${rawImgSrc.includes('?') ? '&' : '?'}retry=${seed}`
                      : rawImgSrc;
                    const ratio = aspectRatios[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleOpenDetail(item)}
                        style={{
                          height: ROW_HEIGHT,
                          width: ROW_HEIGHT * (ratio || 1),
                          flexGrow: ratio || 1,
                        }}
                        className={`group relative max-w-full rounded-lg overflow-hidden bg-surface border border-white/5 hover:border-[#FFCC00] cursor-pointer ${
                          ratio ? '' : 'animate-pulse'
                        }`}
                      >
                        {isBroken ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-black/40 text-fg-muted gap-1">
                            <span className="material-symbols-outlined text-[20px] opacity-60">image_not_supported</span>
                            <span className="text-[9px] line-clamp-1 break-all">{item.filename}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRetrySeeds((prev) => ({ ...prev, [item.id]: Date.now() }));
                                setBrokenImageIds((prev) => ({ ...prev, [item.id]: false }));
                                setThumbFallbackIds((prev) => ({ ...prev, [item.id]: false }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  setRetrySeeds((prev) => ({ ...prev, [item.id]: Date.now() }));
                                  setBrokenImageIds((prev) => ({ ...prev, [item.id]: false }));
                                  setThumbFallbackIds((prev) => ({ ...prev, [item.id]: false }));
                                }
                              }}
                              className="px-2 py-0.5 rounded bg-white/15 hover:bg-[#FFCC00] hover:text-black text-[9px] font-bold transition-colors"
                            >
                              Tentar de novo
                            </span>
                          </div>
                        ) : (
                          <img
                            src={imgSrc}
                            alt={item.filename}
                            loading="lazy"
                            decoding="async"
                            onLoad={(e) => {
                              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                              if (w > 0 && h > 0) {
                                const r = Math.min(3, Math.max(0.4, w / h));
                                setAspectRatios((prev) => (prev[item.id] === r ? prev : { ...prev, [item.id]: r }));
                              }
                            }}
                            onError={() => {
                              if (!useFallback && item.signedStreamUrl && item.signedStreamUrl !== item.signedThumbUrl) {
                                setThumbFallbackIds((prev) => ({ ...prev, [item.id]: true }));
                              } else {
                                setBrokenImageIds((prev) => ({ ...prev, [item.id]: true }));
                              }
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        )}
                        {item.is_favorite && (
                          <span className="absolute top-1.5 right-1.5 text-xs drop-shadow text-[#FFCC00]">★</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {loadingMore && <TimelineSkeletonRow count={12} />}
            <div ref={loadMoreRef} className="py-6 text-center text-xs text-fg-muted">
              {loadingMore ? '' : nextCursor ? 'Role para carregar mais' : 'Fim da timeline'}
            </div>
          </div>

          {/* Time Scrubber (Barra lateral rápida por Mês/Ano) */}
          {monthScrubberItems.length > 1 && (
            <aside
              aria-label="Navegação rápida por mês e ano"
              className="hidden md:flex sticky top-4 flex-col gap-1 py-2 px-1.5 rounded-xl bg-surface/90 border border-border-subtle max-h-[75vh] overflow-y-auto shrink-0"
            >
              {monthScrubberItems.map((m) => (
                <button
                  key={m.monthKey}
                  type="button"
                  onClick={() => scrollToSection(m.firstSectionKey)}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-fg-secondary hover:text-black hover:bg-[#FFCC00] transition-colors cursor-pointer text-right whitespace-nowrap"
                >
                  {m.monthLabel}
                </button>
              ))}
            </aside>
          )}
        </div>
      )}

      {/* Lightbox com Carregamento EXIF Sob Demanda */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="max-w-4xl w-full bg-surface border border-border-subtle rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="md:col-span-8 bg-black flex items-center justify-center max-h-[75vh] min-h-[280px]">
              {lightboxImgFailed ? (
                <div className="flex flex-col items-center justify-center p-6 text-center text-fg-muted gap-2.5">
                  <span className="material-symbols-outlined text-[42px] opacity-60">image_not_supported</span>
                  <p className="text-xs">Miniatura ou mídia indisponível no momento.</p>
                  <button
                    type="button"
                    onClick={() => setLightboxImgFailed(false)}
                    className="px-3 py-1.5 rounded-xl bg-[#FFCC00] text-black text-xs font-bold hover:brightness-110 cursor-pointer"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <img
                  src={selectedItem.signedStreamUrl || selectedItem.signedThumbUrl}
                  alt={selectedItem.filename}
                  onError={() => setLightboxImgFailed(true)}
                  className="max-h-[75vh] w-auto object-contain"
                />
              )}
            </div>
            <div className="md:col-span-4 p-4 space-y-3 text-xs overflow-y-auto max-h-[75vh]">
              <div className="flex justify-between items-start gap-2">
                <div className="font-bold text-fg break-all">{selectedItem.filename}</div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-fg-muted hover:text-fg font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Ações Rápidas: Compartilhar, Download e Editar Rápido */}
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`${selectedItem.signedStreamUrl}${selectedItem.signedStreamUrl.includes('?') ? '&' : '?'}download=1`}
                  download={selectedItem.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FFCC00] text-[#121212] font-bold hover:brightness-105 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  disabled={sharingBusy}
                  onClick={() => void handleQuickShare(selectedItem)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-app hover:border-[#FFCC00]/50 text-fg font-bold cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">share</span>
                  <span>{sharingBusy ? 'Gerando...' : 'Compartilhar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickEditOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors ${
                    isQuickEditOpen
                      ? 'border-accent-primary bg-accent-primary/20 text-fg'
                      : 'border-border-subtle bg-app hover:border-accent-primary/50 text-fg'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span>Editar Rápido</span>
                </button>
              </div>

              {shareFeedback && (
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  {shareFeedback}
                </div>
              )}

              {isQuickEditOpen && (
                <div className="p-3 rounded-xl bg-app border border-border-subtle space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-fg-muted mb-1">Álbum</label>
                    <input
                      type="text"
                      value={editAlbum}
                      onChange={(e) => setEditAlbum(e.target.value)}
                      placeholder="Ex: Eventos, Show de Física..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-fg outline-none focus:border-accent-secondary"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFavorite}
                      onChange={(e) => setEditFavorite(e.target.checked)}
                      className="accent-[var(--accent-secondary)]"
                    />
                    <span className="font-semibold text-fg">Marcar como Favorita</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPortfolio}
                      onChange={(e) => setEditPortfolio(e.target.checked)}
                      className="accent-[var(--accent-primary)]"
                    />
                    <span className="font-semibold text-fg">Exibir no Portfólio</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsQuickEditOpen(false)}
                      className="px-2.5 py-1 rounded-lg text-fg-muted hover:text-fg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingQuickEdit}
                      onClick={() => void handleSaveQuickEdit()}
                      className="px-3 py-1 rounded-lg bg-[#FFCC00] text-[#121212] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {savingQuickEdit ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              )}

              {quickEditStatus && (
                <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                  {quickEditStatus}
                </div>
              )}

              <div className="text-fg-muted space-y-1">
                <div>Pasta/Álbum: {selectedItem.album || selectedItem.relative_path}</div>
                <div>Capturada em: {new Date(selectedItem.captured_at).toLocaleString('pt-BR')}</div>
                <div>Tamanho: {(selectedItem.size_bytes / (1024 * 1024)).toFixed(2)} MB</div>
              </div>
              <div className="border-t border-border-subtle pt-2">
                <div className="font-bold text-slate-300 mb-1">Metadados EXIF</div>
                {exifLoading ? (
                  <div className="text-fg-muted">Carregando EXIF...</div>
                ) : selectedExif ? (
                  <pre className="text-[10px] text-slate-300 bg-black/40 p-2 rounded max-h-48 overflow-auto">
                    {JSON.stringify(selectedExif, null, 2)}
                  </pre>
                ) : (
                  <div className="text-fg-muted">Sem dados EXIF adicionais.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <SmartBackupSettingsModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </div>
  );
}

