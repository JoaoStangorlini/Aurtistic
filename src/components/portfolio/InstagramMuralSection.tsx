// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { InstagramMentionEmbed } from '@/types/portfolio';
import type { PhotoInspectItem } from './PhotoInspectModal';

interface InstagramMuralSectionProps {
  embeds: InstagramMentionEmbed[];
  portfolioPhotos?: PhotoInspectItem[];
  isOwner: boolean;
  onSaveEmbeds: (next: InstagramMentionEmbed[]) => Promise<void>;
}

const INSTAGRAM_URL_REGEX =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]+)(?:\/|\?|$)/i;

export function parseInstagramPostUrl(rawUrl: string): {
  postType: 'p' | 'reel' | 'tv';
  shortcode: string;
  canonicalUrl: string;
} | null {
  const trimmed = rawUrl.trim();
  const match = INSTAGRAM_URL_REGEX.exec(trimmed);
  if (!match) return null;
  const rawType = match[1].toLowerCase();
  const postType: 'p' | 'reel' | 'tv' =
    rawType === 'reel' ? 'reel' : rawType === 'tv' ? 'tv' : 'p';
  const shortcode = match[2];
  return {
    postType,
    shortcode,
    canonicalUrl: `https://www.instagram.com/${postType}/${shortcode}/`,
  };
}

function buildInstagramEmbedSrc(embed: InstagramMentionEmbed): string {
  const mode = embed.includeCaption === false ? 'embed' : 'embed/captioned';
  return `https://www.instagram.com/${embed.postType}/${embed.shortcode}/${mode}/?cr=1&v=14`;
}

function LazyInstagramEmbedFrame({
  embed,
  height,
  registerIframeRef,
}: {
  embed: InstagramMentionEmbed;
  height: number;
  registerIframeRef: (id: string, el: HTMLIFrameElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div ref={containerRef} className="w-full bg-white rounded-b-xl overflow-hidden">
      {isVisible ? (
        <iframe
          ref={(el) => registerIframeRef(embed.id, el)}
          src={buildInstagramEmbedSrc(embed)}
          title={`Publicação Instagram ${embed.accountHandle}`}
          loading="lazy"
          scrolling="no"
          allowTransparency
          className="w-full border-0 block transition-[height] duration-200"
          style={{ height: `${height}px` }}
        />
      ) : (
        <div
          className="w-full flex items-center justify-center bg-surface text-xs text-fg-muted"
          style={{ height: `${height}px` }}
        >
          Carregando publicação do Instagram...
        </div>
      )}
    </div>
  );
}

export function InstagramMuralSection({
  embeds,
  portfolioPhotos = [],
  isOwner,
  onSaveEmbeds,
}: InstagramMuralSectionProps) {
  const sorted = useMemo(
    () => [...embeds].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [embeds]
  );

  const visibleItems = useMemo(() => {
    if (isOwner) return sorted;
    return sorted.filter((m) => !m.hidden);
  }, [sorted, isOwner]);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>({});

  // Listener postMessage com validação estrita de hostname do Instagram (MEASURE)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      let originHost = '';
      try {
        originHost = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (originHost !== 'instagram.com' && !originHost.endsWith('.instagram.com')) return;

      let payload: any = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (payload?.type === 'MEASURE' && typeof payload?.details?.height === 'number') {
        const nextHeight = Math.max(380, Math.min(1250, Math.ceil(payload.details.height) + 4));
        for (const [embedId, iframeEl] of Object.entries(iframeRefs.current)) {
          if (iframeEl && iframeEl.contentWindow === event.source) {
            setIframeHeights((prev) =>
              prev[embedId] === nextHeight ? prev : { ...prev, [embedId]: nextHeight }
            );
            break;
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Modal CRUD
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [accountHandle, setAccountHandle] = useState('');
  const [accountName, setAccountName] = useState('');
  const [photoCreditNote, setPhotoCreditNote] = useState('Fotografia autoral por João Paulo Stangorlini');
  const [eventOrContext, setEventOrContext] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [originalFileId, setOriginalFileId] = useState<string>('');
  const [includeCaption, setIncludeCaption] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setEditingId(null);
    setPostUrl('');
    setAccountHandle('');
    setAccountName('');
    setPhotoCreditNote('Fotografia autoral por João Paulo Stangorlini');
    setEventOrContext('');
    setPublishedAt('');
    setOriginalFileId('');
    setIncludeCaption(true);
    setHidden(false);
    setIsModalOpen(true);
  };

  const openEditModal = (item: InstagramMentionEmbed) => {
    setEditingId(item.id);
    setPostUrl(item.postUrl);
    setAccountHandle(item.accountHandle);
    setAccountName(item.accountName || '');
    setPhotoCreditNote(item.photoCreditNote);
    setEventOrContext(item.eventOrContext || '');
    setPublishedAt(item.publishedAt || '');
    setOriginalFileId(item.originalFileId || '');
    setIncludeCaption(item.includeCaption !== false);
    setHidden(Boolean(item.hidden));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInstagramPostUrl(postUrl);
    if (!parsed) {
      alert('URL do Instagram inválida. Use um link de /p/..., /reel/... ou /tv/...');
      return;
    }
    if (!accountHandle.trim() || !photoCreditNote.trim()) {
      alert('Informe o @perfil e a nota de crédito fotográfico.');
      return;
    }

    setSaving(true);
    try {
      const normalizedHandle = accountHandle.trim().startsWith('@')
        ? accountHandle.trim()
        : `@${accountHandle.trim()}`;

      const nextItem: InstagramMentionEmbed = {
        id: editingId || `ig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        postUrl: parsed.canonicalUrl,
        postType: parsed.postType,
        shortcode: parsed.shortcode,
        accountHandle: normalizedHandle,
        accountName: accountName.trim() || undefined,
        photoCreditNote: photoCreditNote.trim(),
        eventOrContext: eventOrContext.trim() || undefined,
        originalFileId: originalFileId || null,
        publishedAt: publishedAt || undefined,
        includeCaption,
        hidden: Boolean(hidden),
        displayOrder: editingId
          ? embeds.find((m) => m.id === editingId)?.displayOrder ?? sorted.length
          : sorted.length,
      };

      const nextList = editingId
        ? sorted.map((m) => (m.id === editingId ? nextItem : m))
        : [...sorted, nextItem];

      await onSaveEmbeds(nextList.map((item, idx) => ({ ...item, displayOrder: idx })));
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta publicação do mural?')) return;
    const nextList = sorted
      .filter((m) => m.id !== id)
      .map((item, idx) => ({ ...item, displayOrder: idx }));
    await onSaveEmbeds(nextList);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-5">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-pink-400">
            <span className="material-symbols-outlined text-[16px]">photo_library</span>
            Mural do Instagram
          </span>
          <h2 className="text-xl md:text-2xl font-black text-fg mt-1">
            Publicações de Terceiros com Minhas Fotografias
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Posts oficiais incorporados de perfis parceiros e veículos que publicaram registros de minha autoria.
          </p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#FFCC00] text-[#121212] hover:bg-[#FFCC00]/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_link</span>
            Adicionar Post do Instagram
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="text-center py-14 px-6 bg-surface border border-dashed border-border-subtle rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-fg-muted mb-2 block">
            photo_library
          </span>
          <p className="text-sm font-semibold text-fg">Nenhuma publicação adicionada ao mural ainda.</p>
          {isOwner && (
            <p className="text-xs text-fg-muted mt-1">
              Adicione links de posts ou reels de terceiros que utilizaram suas fotografias.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
          {visibleItems.map((item) => {
            const linkedPhoto = item.originalFileId
              ? portfolioPhotos.find((p) => p.id === item.originalFileId)
              : undefined;

            return (
              <article
                key={item.id}
                className={`bg-surface border rounded-2xl overflow-hidden flex flex-col ${
                  item.hidden
                    ? 'border-dashed border-amber-500/40 opacity-80'
                    : 'border-border-subtle'
                }`}
              >
                <div className="p-4 border-b border-border-subtle space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.hidden && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                            Oculto
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-300 text-[11px] font-bold">
                          {item.accountHandle}
                        </span>
                      </div>
                      {item.accountName && (
                        <p className="text-xs font-bold text-fg mt-1">{item.accountName}</p>
                      )}
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg border border-border-subtle text-fg-secondary hover:text-[#FFCC00] cursor-pointer"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Excluir"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-[#FFCC00]">{item.photoCreditNote}</p>
                  {item.eventOrContext && (
                    <p className="text-[11px] text-fg-muted">{item.eventOrContext}</p>
                  )}
                  {linkedPhoto && (
                    <p className="text-[11px] text-teal-300 truncate">
                      Acervo vinculado: {linkedPhoto.filename}
                    </p>
                  )}
                </div>

                <LazyInstagramEmbedFrame
                  embed={item}
                  height={iframeHeights[item.id] || 560}
                  registerIframeRef={(id, el) => {
                    iframeRefs.current[id] = el;
                  }}
                />
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && isOwner && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="text-lg font-bold text-fg">
                {editingId ? 'Editar Post do Instagram' : 'Adicionar Post ao Mural'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-fg-muted hover:text-fg cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Link do Post / Reel no Instagram *
                </label>
                <input
                  type="url"
                  required
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://www.instagram.com/p/Cxyz12345/"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-fg-muted block mb-1">
                    @Perfil que publicou *
                  </label>
                  <input
                    type="text"
                    required
                    value={accountHandle}
                    onChange={(e) => setAccountHandle(e.target.value)}
                    placeholder="@showdafisica.ifusp"
                    className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-muted block mb-1">
                    Nome do Perfil (Opcional)
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Show de Física IFUSP"
                    className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Nota de Crédito Autoral *
                </label>
                <input
                  type="text"
                  required
                  value={photoCreditNote}
                  onChange={(e) => setPhotoCreditNote(e.target.value)}
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Evento / Contexto (Opcional)
                </label>
                <input
                  type="text"
                  value={eventOrContext}
                  onChange={(e) => setEventOrContext(e.target.value)}
                  placeholder="Sessão Especial — Instituto de Física da USP"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              {portfolioPhotos.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-fg-muted block mb-1">
                    Vincular Foto Original do Acervo (Opcional)
                  </label>
                  <select
                    value={originalFileId}
                    onChange={(e) => setOriginalFileId(e.target.value)}
                    className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                  >
                    <option value="">Sem vínculo</option>
                    {portfolioPhotos.slice(0, 100).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.filename} ({p.relative_path})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCaption}
                    onChange={(e) => setIncludeCaption(e.target.checked)}
                    className="accent-[#FFCC00]"
                  />
                  Exibir legenda original do post (`/embed/captioned/`)
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hidden}
                    onChange={(e) => setHidden(e.target.checked)}
                    className="accent-[#FFCC00]"
                  />
                  <span>Ocultar do mural público</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle text-fg-secondary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#FFCC00] text-black hover:bg-[#FFCC00]/90 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Salvar no Mural'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

