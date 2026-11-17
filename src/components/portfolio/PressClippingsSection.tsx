// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useMemo, useState } from 'react';
import type { PressClippingItem } from '@/types/portfolio';
import type { PhotoInspectItem } from './PhotoInspectModal';
import { buildTenantThumbUrl } from '@/lib/edge-urls';

interface PressClippingsSectionProps {
  clippings: PressClippingItem[];
  portfolioPhotos?: PhotoInspectItem[];
  serverUrl?: string;
  ticket?: string;
  isOwner: boolean;
  onSaveClippings: (next: PressClippingItem[]) => Promise<void>;
}

function resolveDisplaySrc(
  signedUrl?: string,
  rawUrl?: string,
  serverUrl?: string,
  ticket?: string
): string {
  if (signedUrl) return signedUrl;
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  if (ticket) {
    return buildTenantThumbUrl(trimmed, ticket, { serverUrl });
  }
  return '';
}

interface PressClippingFormState extends Omit<PressClippingItem, 'id' | 'displayOrder'> {
  signedPhysicalPageUrl?: string;
  signedOriginalPhotoUrl?: string;
  hidden?: boolean;
}

const EMPTY_FORM: PressClippingFormState = {
  title: '',
  newspaperName: '',
  publicationDate: new Date().toISOString().slice(0, 10),
  editionOrSection: '',
  contextDescription: '',
  physicalPagePhotoUrl: '',
  originalPhotoUrl: '',
  signedPhysicalPageUrl: '',
  signedOriginalPhotoUrl: '',
  originalFileId: null,
  externalArticleUrl: '',
  featured: false,
  hidden: false,
};

export function PressClippingsSection({
  clippings,
  portfolioPhotos = [],
  serverUrl,
  ticket,
  isOwner,
  onSaveClippings,
}: PressClippingsSectionProps) {
  const sorted = useMemo(
    () => [...clippings].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [clippings]
  );

  const visibleItems = useMemo(() => {
    if (isOwner) return sorted;
    return sorted.filter((c) => !c.hidden);
  }, [sorted, isOwner]);

  // Modo de visualização por card: 'split' (lado a lado) | 'newspaper' | 'original'
  const [cardModes, setCardModes] = useState<Record<string, 'split' | 'newspaper' | 'original'>>({});
  const [lightboxItem, setLightboxItem] = useState<PressClippingItem | null>(null);
  const [lightboxView, setLightboxView] = useState<'newspaper' | 'original'>('newspaper');
  const [zoomScale, setZoomScale] = useState<1 | 1.5 | 2>(1);

  // Modal CRUD (apenas dono)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'physical' | 'original' | null>(null);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPickerTarget(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PressClippingItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      newspaperName: item.newspaperName,
      publicationDate: item.publicationDate,
      editionOrSection: item.editionOrSection || '',
      contextDescription: item.contextDescription,
      physicalPagePhotoUrl: item.physicalPagePhotoUrl,
      originalPhotoUrl: item.originalPhotoUrl || '',
      signedPhysicalPageUrl: item.signedPhysicalPageUrl || '',
      signedOriginalPhotoUrl: item.signedOriginalPhotoUrl || '',
      originalFileId: item.originalFileId || null,
      externalArticleUrl: item.externalArticleUrl || '',
      featured: Boolean(item.featured),
      hidden: Boolean(item.hidden),
    });
    setPickerTarget(null);
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.newspaperName.trim() || !form.physicalPagePhotoUrl.trim()) {
      alert('Preencha Título, Nome do Jornal e a Foto da Página Física.');
      return;
    }
    setSaving(true);
    try {
      const resolvedSignedPhysical =
        form.signedPhysicalPageUrl ||
        portfolioPhotos.find((p) => p.relative_path === form.physicalPagePhotoUrl)?.signedStreamUrl ||
        portfolioPhotos.find((p) => p.relative_path === form.physicalPagePhotoUrl)?.signedThumbUrl ||
        (ticket && !form.physicalPagePhotoUrl.startsWith('http')
          ? buildTenantThumbUrl(form.physicalPagePhotoUrl, ticket, { serverUrl })
          : undefined);

      const resolvedSignedOriginal =
        form.signedOriginalPhotoUrl ||
        portfolioPhotos.find((p) => p.relative_path === form.originalPhotoUrl)?.signedStreamUrl ||
        portfolioPhotos.find((p) => p.relative_path === form.originalPhotoUrl)?.signedThumbUrl ||
        (ticket && form.originalPhotoUrl && !form.originalPhotoUrl.startsWith('http')
          ? buildTenantThumbUrl(form.originalPhotoUrl, ticket, { serverUrl })
          : undefined);

      const nextItem: PressClippingItem = {
        id: editingId || `press_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: form.title.trim(),
        newspaperName: form.newspaperName.trim(),
        publicationDate: form.publicationDate,
        editionOrSection: form.editionOrSection?.trim() || '',
        contextDescription: form.contextDescription.trim(),
        physicalPagePhotoUrl: form.physicalPagePhotoUrl.trim(),
        originalPhotoUrl: form.originalPhotoUrl?.trim() || '',
        signedPhysicalPageUrl: resolvedSignedPhysical,
        signedOriginalPhotoUrl: resolvedSignedOriginal,
        originalFileId: form.originalFileId || null,
        externalArticleUrl: form.externalArticleUrl?.trim() || '',
        featured: Boolean(form.featured),
        hidden: Boolean(form.hidden),
        displayOrder: editingId
          ? clippings.find((c) => c.id === editingId)?.displayOrder ?? sorted.length
          : sorted.length,
      };

      const nextList = editingId
        ? sorted.map((c) => (c.id === editingId ? nextItem : c))
        : [...sorted, nextItem];

      await onSaveClippings(nextList.map((item, idx) => ({ ...item, displayOrder: idx })));
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este recorte de jornal do portfólio?')) return;
    const nextList = sorted
      .filter((c) => c.id !== id)
      .map((item, idx) => ({ ...item, displayOrder: idx }));
    await onSaveClippings(nextList);
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const next = [...sorted];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    await onSaveClippings(next.map((item, idx) => ({ ...item, displayOrder: idx })));
  };

  return (
    <section className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-5">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#FFCC00]">
            <span className="material-symbols-outlined text-[16px]">newspaper</span>
            Na Mídia &amp; Jornal Impresso
          </span>
          <h2 className="text-xl md:text-2xl font-black text-fg mt-1">
            Fotografias Publicadas na Imprensa
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Compare a página física impressa no jornal com a fotografia original autoral.
          </p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#FFCC00] text-[#121212] hover:bg-[#FFCC00]/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
            Adicionar Recorte de Jornal
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="text-center py-14 px-6 bg-surface border border-dashed border-border-subtle rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-fg-muted mb-2 block">
            newspaper
          </span>
          <p className="text-sm font-semibold text-fg">Nenhum recorte de jornal publicado ainda.</p>
          {isOwner && (
            <p className="text-xs text-fg-muted mt-1">
              Clique em &quot;Adicionar Recorte de Jornal&quot; para destacar suas fotos impressas na mídia.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {visibleItems.map((item, idx) => {
            const mode = cardModes[item.id] || (item.originalPhotoUrl ? 'split' : 'newspaper');
            const physicalSrc = resolveDisplaySrc(
              item.signedPhysicalPageUrl,
              item.physicalPagePhotoUrl,
              serverUrl,
              ticket
            );
            const originalSrc = resolveDisplaySrc(
              item.signedOriginalPhotoUrl,
              item.originalPhotoUrl,
              serverUrl,
              ticket
            );

            return (
              <article
                key={item.id}
                className={`bg-surface border rounded-2xl overflow-hidden transition-colors ${
                  item.hidden
                    ? 'border-dashed border-amber-500/40 opacity-80'
                    : item.featured
                    ? 'border-[#FFCC00]/50 shadow-lg shadow-[#FFCC00]/5'
                    : 'border-border-subtle'
                }`}
              >
                {/* Barra Editorial do Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-border-subtle bg-black/20">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {item.hidden && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                        Oculto
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-[#FFCC00]/15 text-[#FFCC00] text-[11px] font-bold uppercase tracking-wider">
                      {item.newspaperName}
                    </span>
                    <span className="text-xs text-fg-muted font-mono">{item.publicationDate}</span>
                    {item.editionOrSection && (
                      <span className="text-xs text-fg-secondary">• {item.editionOrSection}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {originalSrc && (
                      <div className="flex items-center rounded-lg border border-border-subtle bg-app p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setCardModes((p) => ({ ...p, [item.id]: 'split' }))}
                          className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                            mode === 'split' ? 'bg-[#FFCC00] text-black' : 'text-fg-secondary'
                          }`}
                        >
                          Lado a Lado
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardModes((p) => ({ ...p, [item.id]: 'newspaper' }))}
                          className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                            mode === 'newspaper' ? 'bg-[#FFCC00] text-black' : 'text-fg-secondary'
                          }`}
                        >
                          Jornal
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardModes((p) => ({ ...p, [item.id]: 'original' }))}
                          className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                            mode === 'original' ? 'bg-[#FFCC00] text-black' : 'text-fg-secondary'
                          }`}
                        >
                          Original
                        </button>
                      </div>
                    )}

                    {isOwner && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMove(idx, -1)}
                          className="p-1.5 rounded-lg border border-border-subtle text-fg-secondary hover:text-fg disabled:opacity-30 cursor-pointer"
                          title="Mover para cima"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          disabled={idx === sorted.length - 1}
                          onClick={() => void handleMove(idx, 1)}
                          className="p-1.5 rounded-lg border border-border-subtle text-fg-secondary hover:text-fg disabled:opacity-30 cursor-pointer"
                          title="Mover para baixo"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg border border-border-subtle text-fg-secondary hover:text-[#FFCC00] cursor-pointer"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Excluir"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Conteúdo Comparativo + Contexto */}
                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-fg">{item.title}</h3>
                    {item.contextDescription && (
                      <p className="text-sm text-fg-secondary mt-1.5 leading-relaxed">
                        {item.contextDescription}
                      </p>
                    )}
                  </div>

                  <div
                    className={`grid gap-4 ${
                      mode === 'split' && originalSrc ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {(mode === 'split' || mode === 'newspaper') && (
                      <button
                        type="button"
                        onClick={() => {
                          setLightboxItem(item);
                          setLightboxView('newspaper');
                          setZoomScale(1);
                        }}
                        className="group relative rounded-xl overflow-hidden border border-border-subtle bg-black/40 text-left cursor-zoom-in"
                      >
                        <div className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-md bg-black/75 text-[11px] font-bold text-white border border-white/10">
                          Página Física do Jornal
                        </div>
                        {physicalSrc ? (
                          <img
                            src={physicalSrc}
                            alt={`Página física - ${item.title}`}
                            loading="lazy"
                            className="w-full h-72 md:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          <div className="h-72 flex items-center justify-center text-xs text-fg-muted">
                            Imagem do jornal indisponível
                          </div>
                        )}
                      </button>
                    )}

                    {(mode === 'split' || mode === 'original') && originalSrc && (
                      <button
                        type="button"
                        onClick={() => {
                          setLightboxItem(item);
                          setLightboxView('original');
                          setZoomScale(1);
                        }}
                        className="group relative rounded-xl overflow-hidden border border-border-subtle bg-black/40 text-left cursor-zoom-in"
                      >
                        <div className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-md bg-[#FFCC00] text-[11px] font-bold text-black">
                          Fotografia Original Autoral
                        </div>
                        <img
                          src={originalSrc}
                          alt={`Foto original - ${item.title}`}
                          loading="lazy"
                          className="w-full h-72 md:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      </button>
                    )}
                  </div>

                  {item.externalArticleUrl && (
                    <div className="pt-1">
                      <a
                        href={item.externalArticleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FFCC00] hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        Ler matéria online
                      </a>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Lightbox com Zoom & Alternância Rápida */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex flex-col p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 pb-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h4 className="text-sm font-bold">{lightboxItem.title}</h4>
              <p className="text-xs text-white/60">
                {lightboxItem.newspaperName} • {lightboxItem.publicationDate}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lightboxItem.originalPhotoUrl && (
                <div className="flex items-center rounded-lg bg-white/10 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setLightboxView('newspaper')}
                    className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                      lightboxView === 'newspaper' ? 'bg-[#FFCC00] text-black' : 'text-white'
                    }`}
                  >
                    Jornal
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxView('original')}
                    className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                      lightboxView === 'original' ? 'bg-[#FFCC00] text-black' : 'text-white'
                    }`}
                  >
                    Original
                  </button>
                </div>
              )}

              {([1, 1.5, 2] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoomScale(z)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    zoomScale === z ? 'bg-white text-black' : 'bg-white/10 text-white'
                  }`}
                >
                  {z}x
                </button>
              ))}

              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold hover:bg-white/20 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={
                lightboxView === 'original' && lightboxItem.originalPhotoUrl
                  ? resolveDisplaySrc(
                      lightboxItem.signedOriginalPhotoUrl,
                      lightboxItem.originalPhotoUrl,
                      serverUrl,
                      ticket
                    )
                  : resolveDisplaySrc(
                      lightboxItem.signedPhysicalPageUrl,
                      lightboxItem.physicalPagePhotoUrl,
                      serverUrl,
                      ticket
                    )
              }
              alt={lightboxItem.title}
              style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}
              className="max-h-[82vh] w-auto object-contain transition-transform duration-200"
            />
          </div>
        </div>
      )}

      {/* Modal CRUD (Apenas Dono) */}
      {isModalOpen && isOwner && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSaveForm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="text-lg font-bold text-fg">
                {editingId ? 'Editar Recorte de Jornal' : 'Novo Recorte de Jornal'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-fg-muted hover:text-fg cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-fg-muted block mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Destaque no Jornal da USP — Show da Física"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Nome do Jornal / Veículo *
                </label>
                <input
                  type="text"
                  required
                  value={form.newspaperName}
                  onChange={(e) => setForm({ ...form, newspaperName: e.target.value })}
                  placeholder="Ex: Jornal da USP"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Data da Publicação *
                </label>
                <input
                  type="date"
                  required
                  value={form.publicationDate}
                  onChange={(e) => setForm({ ...form, publicationDate: e.target.value })}
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Caderno / Página
                </label>
                <input
                  type="text"
                  value={form.editionOrSection || ''}
                  onChange={(e) => setForm({ ...form, editionOrSection: e.target.value })}
                  placeholder="Ex: Caderno Ciência & Educação, pág. A12"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Link da Matéria Online (Opcional)
                </label>
                <input
                  type="url"
                  value={form.externalArticleUrl || ''}
                  onChange={(e) => setForm({ ...form, externalArticleUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-fg-muted">
                    Foto da Página Física do Jornal (relative_path ou URL) *
                  </label>
                  {portfolioPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPickerTarget(pickerTarget === 'physical' ? null : 'physical')
                      }
                      className="text-[11px] font-bold text-[#FFCC00] hover:underline cursor-pointer"
                    >
                      {pickerTarget === 'physical' ? 'Fechar Acervo' : 'Escolher do Acervo'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={form.physicalPagePhotoUrl}
                  onChange={(e) => setForm({ ...form, physicalPagePhotoUrl: e.target.value })}
                  placeholder="Portfolio/JORNAL/pagina.jpg ou https://..."
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-fg-muted">
                    Foto Original Autoral (Opcional — para comparação)
                  </label>
                  {portfolioPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPickerTarget(pickerTarget === 'original' ? null : 'original')
                      }
                      className="text-[11px] font-bold text-[#FFCC00] hover:underline cursor-pointer"
                    >
                      {pickerTarget === 'original' ? 'Fechar Acervo' : 'Escolher do Acervo'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={form.originalPhotoUrl || ''}
                  onChange={(e) => setForm({ ...form, originalPhotoUrl: e.target.value })}
                  placeholder="Portfolio/SHOW/foto_original.jpg ou https://..."
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg font-mono"
                />
              </div>

              {pickerTarget && portfolioPhotos.length > 0 && (
                <div className="md:col-span-2 bg-app border border-border-subtle rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-fg-muted">
                    Selecione uma foto do acervo para{' '}
                    {pickerTarget === 'physical' ? 'Página Física do Jornal' : 'Foto Original'}:
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-44 overflow-y-auto">
                    {portfolioPhotos.slice(0, 48).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const chosenSignedUrl =
                            p.signedStreamUrl ||
                            p.signedThumbUrl ||
                            (ticket ? buildTenantThumbUrl(p.relative_path, ticket, { serverUrl }) : '');

                          if (pickerTarget === 'physical') {
                            setForm((prev) => ({
                              ...prev,
                              physicalPagePhotoUrl: p.relative_path,
                              signedPhysicalPageUrl: chosenSignedUrl,
                            }));
                          } else {
                            setForm((prev) => ({
                              ...prev,
                              originalPhotoUrl: p.relative_path,
                              originalFileId: p.id,
                              signedOriginalPhotoUrl: chosenSignedUrl,
                            }));
                          }
                          setPickerTarget(null);
                        }}
                        className="aspect-square rounded-lg overflow-hidden border border-border-subtle hover:border-[#FFCC00] cursor-pointer"
                        title={p.filename}
                      >
                        <img
                          src={
                            p.signedThumbUrl ||
                            (ticket ? buildTenantThumbUrl(p.relative_path, ticket, { serverUrl }) : '')
                          }
                          alt={p.filename}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  Descrição / Contexto
                </label>
                <textarea
                  rows={3}
                  value={form.contextDescription}
                  onChange={(e) => setForm({ ...form, contextDescription: e.target.value })}
                  placeholder="Descreva a reportagem, o evento fotografado e a repercussão..."
                  className="w-full bg-app border border-border-subtle rounded-xl px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.featured)}
                    onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    className="accent-[#FFCC00]"
                  />
                  Destacar este recorte de jornal
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.hidden)}
                    onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
                    className="accent-[#FFCC00]"
                  />
                  <span>Ocultar do portfólio público</span>
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
                {saving ? 'Salvando...' : 'Salvar Recorte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

