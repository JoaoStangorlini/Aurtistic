// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioInstagramPreviewModal } from './StudioInstagramPreviewModal';
import {
  exportSlideToPngDataUrl,
  exportSingleSlideDownload,
  exportCarouselToZip,
  exportCarouselToPdf,
  generatePostCaptionAndAlt,
  saveToOrgVaultAction,
  type StudioExportFormat,
} from '@/lib/studio/studio-exporter';

export function StudioPublishModal({ orgSlug }: { orgSlug?: string | null }) {
  const { stage, setStage, slides, aspectRatio, scope } = useStudio();
  const { tokens } = useOrganizationBrand();
  const isPersonal = scope === 'personal';

  const [previewMode, setPreviewMode] = useState<'feed' | 'stories'>('feed');
  const [igSimulatorOpen, setIgSimulatorOpen] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedAlt, setCopiedAlt] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<StudioExportFormat>('png');
  const [exportQuality, setExportQuality] = useState<number>(92);
  const [exportScale, setExportScale] = useState<1 | 2>(1);
  const [isExporting, setIsExporting] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const effectiveSlug = orgSlug || tokens.themeId;

  useEffect(() => {
    if (stage !== 'publish' || !slides[0]) return;
    let cancelled = false;
    const renderPreview = async () => {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready.catch(() => {});
      }
      if (cancelled) return;
      setPreviewUrl(exportSlideToPngDataUrl(slides[0], aspectRatio, 1, tokens));
    };
    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [stage, slides, aspectRatio, tokens]);

  if (stage !== 'publish') return null;

  const { caption, altText } = generatePostCaptionAndAlt(slides, effectiveSlug, tokens);
  const previewPng = previewUrl || exportSlideToPngDataUrl(slides[0], aspectRatio, 1, tokens);

  const handleDownloadSlides = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        await exportSingleSlideDownload(slides[i], i, aspectRatio, {
          orgSlug: effectiveSlug,
          format: exportFormat,
          quality: exportQuality / 100,
          scale: exportScale,
          tokens,
        });
        if (i < slides.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao exportar slides. Tente novamente em 1x.');
      setTimeout(() => setNotice(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadZip = async () => {
    if (isExporting || zipProgress) return;
    setIsExporting(true);
    setZipProgress({ current: 1, total: slides.length });
    try {
      await exportCarouselToZip(slides, aspectRatio, {
        orgSlug: effectiveSlug,
        format: exportFormat,
        quality: exportQuality / 100,
        scale: exportScale,
        tokens,
        onProgress: (current, total) => setZipProgress({ current, total }),
      });
      setNotice(`Pacote ZIP (${slides.length} slides em ${exportFormat.toUpperCase()}) baixado com sucesso!`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao gerar ZIP. Verifique a memória ou use resolução 1x.');
      setTimeout(() => setNotice(null), 5000);
    } finally {
      setZipProgress(null);
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      await exportCarouselToPdf(slides, aspectRatio, tokens);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSaveVault = async (type: 'prontos' | 'modelos') => {
    setPublishing(true);
    const isPersonal = scope === 'personal' || effectiveSlug === 'personal';
    const res = await saveToOrgVaultAction(type, effectiveSlug, {
      title: slides[0]?.title || 'Post do Studio',
      slides,
      aspectRatio,
      previewDataUrl: previewPng,
    }, isPersonal ? 'personal' : 'org');
    setPublishing(false);
    if (res.ok) {
      const folderPath = isPersonal ? `/studio/${type}` : `/orgs/${effectiveSlug}/studio/${type}`;
      setNotice(`Salvo com sucesso na pasta ${folderPath}!`);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const handleSendToHub = () => {
    setPublishing(true);
    const payload = {
      title: slides[0]?.title || 'Post Studio',
      body: caption,
      orgSlug: effectiveSlug,
      aspect: aspectRatio,
      brandDisplayName: tokens.displayName,
      badgeTag: tokens.badgeTag,
      primaryColor: tokens.primaryColor,
      imageDataUrl: previewPng,
      slidesCount: slides.length,
    };
    const isInsideIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
    if (isInsideIframe) {
      let targetOrigin = '*';
      if (document.referrer) {
        try { targetOrigin = new URL(document.referrer).origin; } catch {}
      }
      window.parent.postMessage({ type: 'AURTISTIC_STUDIO_PUBLISH_HUB', payload }, targetOrigin);
      setNotice('Post enviado com sucesso para o feed do HUB LabDiv!');
    } else {
      setNotice('Post pronto para o feed da organização!');
    }
    setPublishing(false);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-surface border border-border-subtle rounded-3xl p-5 max-w-4xl w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto text-fg">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-amber-500 dark:text-[#FFCC00]">rocket_launch</span>
            <h3 className="text-base font-black text-fg">Central de Publicação, Cofre &amp; Exportação</h3>
          </div>
          <button
            type="button"
            onClick={() => setStage('editor')}
            className="p-1.5 text-fg-muted hover:text-fg rounded-xl hover:bg-surface-hover cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {notice && (
          <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 dark:text-emerald-200 text-xs text-center font-bold">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Mockup de Celular (Esquerda) */}
          <div className="md:col-span-5 flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-1 bg-elevated/70 p-1 rounded-xl border border-border-subtle text-xs">
              <button
                type="button"
                onClick={() => setPreviewMode('feed')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${previewMode === 'feed' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'}`}
              >
                Feed 1:1 / 4:5
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('stories')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${previewMode === 'stories' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'}`}
              >
                Stories 9:16
              </button>
            </div>

            {/* Carcaça de Celular */}
            <div className={`relative rounded-3xl border-4 border-border-subtle bg-black overflow-hidden shadow-2xl p-1 flex items-center justify-center ${previewMode === 'stories' ? 'w-[200px] h-[355px]' : 'w-[240px] h-[300px]'}`}>
              {previewPng && <img src={previewPng} alt="Preview Post" className="w-full h-full object-contain rounded-2xl" />}
            </div>

            <button
              type="button"
              onClick={() => setIgSimulatorOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-elevated hover:bg-surface-hover text-xs font-bold text-fg cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px] text-amber-500 dark:text-[#FFCC00]">smartphone</span>
              <span>Simular Grade 3×3 &amp; Reels</span>
            </button>

            <span className="text-[10px] text-fg-muted font-mono">Mockup em Tempo Real ({slides.length} Telas)</span>
          </div>

          {/* Legenda, Acessibilidade e Exportação (Direita) */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Legenda Automática */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-fg-secondary">Legenda Automática</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(caption); setCopiedCaption(true); setTimeout(() => setCopiedCaption(false), 2000); }}
                  className="text-amber-700 dark:text-amber-300 hover:underline font-bold text-[11px] cursor-pointer"
                >
                  {copiedCaption ? '✓ Copiado!' : 'Copiar Legenda'}
                </button>
              </div>
              <textarea readOnly rows={3} value={caption} className="w-full p-2.5 rounded-xl bg-elevated/70 border border-border-subtle text-xs text-fg" />
            </div>

            {/* Alt Text de Acessibilidade */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-fg-secondary">Alt-Text Acessível (Leitores de Tela)</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(altText); setCopiedAlt(true); setTimeout(() => setCopiedAlt(false), 2000); }}
                  className="text-amber-700 dark:text-amber-300 hover:underline font-bold text-[11px] cursor-pointer"
                >
                  {copiedAlt ? '✓ Copiado!' : 'Copiar Alt'}
                </button>
              </div>
              <input readOnly type="text" value={altText} className="w-full p-2 rounded-xl bg-elevated/70 border border-border-subtle text-[11px] text-fg-secondary" />
            </div>

            {/* Ações de Envio e Salvamento no Cofre */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button" disabled={publishing} onClick={() => handleSaveVault('prontos')}
                className="py-2.5 px-3 rounded-xl border border-border-subtle bg-elevated/60 hover:bg-elevated text-xs font-bold text-fg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                <span>Salvar no Cofre</span>
              </button>
              <button
                type="button" disabled={publishing} onClick={() => handleSaveVault('modelos')}
                className="py-2.5 px-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
                <span>Salvar como Modelo</span>
              </button>
            </div>

            {/* Exportação Pro (S8: PNG / WebP / JPEG + Qualidade + 1x/2x + ZIP fflate) */}
            <div className="p-3 rounded-2xl border border-border-subtle bg-elevated/50 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-border-subtle text-[11px]">
                  {(['png', 'webp', 'jpeg'] as StudioExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`px-2.5 py-1 rounded-lg font-bold uppercase cursor-pointer ${
                        exportFormat === fmt ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {fmt === 'jpeg' ? 'JPG' : fmt}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-border-subtle text-[11px]">
                  {([1, 2] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setExportScale(sc)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        exportScale === sc ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {sc}x ({sc === 1 ? '1080px' : '2160px'})
                    </button>
                  ))}
                </div>
              </div>

              {exportFormat !== 'png' && (
                <StudioLiveSlider
                  id="export-quality-slider"
                  label={`Qualidade ${exportFormat === 'jpeg' ? 'JPG' : 'WebP'}`}
                  value={exportQuality}
                  min={60}
                  max={100}
                  step={1}
                  unit="%"
                  transparentScrub={false}
                  onChange={setExportQuality}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isExporting || Boolean(zipProgress)}
                  onClick={handleDownloadSlides}
                  className="py-2 px-2.5 rounded-xl border border-border-subtle bg-surface text-xs font-bold text-fg-secondary hover:text-fg hover:bg-surface-hover text-center cursor-pointer disabled:opacity-50"
                >
                  {isExporting && !zipProgress ? 'Exportando…' : `Baixar ${exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase()} (${exportScale}x)`}
                </button>
                <button
                  type="button"
                  disabled={isExporting || Boolean(zipProgress)}
                  onClick={handleDownloadZip}
                  className="py-2 px-2.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-xs font-bold text-amber-800 dark:text-amber-300 text-center cursor-pointer disabled:opacity-60"
                >
                  {zipProgress
                    ? `Exportando slide ${zipProgress.current} de ${zipProgress.total}...`
                    : `Baixar .ZIP (${slides.length} telas)`}
                </button>
                <button
                  type="button"
                  disabled={pdfLoading || isExporting || Boolean(zipProgress)}
                  onClick={handleDownloadPdf}
                  className="py-2 px-2.5 rounded-xl border border-border-subtle bg-surface text-xs font-bold text-fg-secondary hover:text-fg hover:bg-surface-hover text-center cursor-pointer disabled:opacity-50"
                >
                  {pdfLoading ? 'Gerando…' : `PDF (${slides.length} pág.)`}
                </button>
              </div>
            </div>

            {/* Enviar ao Feed do HUB (somente no escopo de organização) */}
            {!isPersonal && (
              <button
                type="button" disabled={publishing} onClick={handleSendToHub}
                className="w-full py-3 rounded-xl bg-[#FFCC00] text-black font-black text-xs hover:bg-[#FFD633] transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>Enviar para o Feed do HUB LabDiv</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <StudioInstagramPreviewModal
        open={igSimulatorOpen}
        onClose={() => setIgSimulatorOpen(false)}
      />
    </div>
  );
}
