// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { exportSlideToPngDataUrl, exportCarouselToPdf, generatePostCaptionAndAlt, saveToOrgVaultAction } from '@/lib/studio/studio-exporter';

export function StudioPublishModal({ orgSlug }: { orgSlug?: string | null }) {
  const { stage, setStage, slides, aspectRatio } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [previewMode, setPreviewMode] = useState<'feed' | 'stories'>('feed');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedAlt, setCopiedAlt] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (stage !== 'publish') return null;

  const effectiveSlug = orgSlug || tokens.themeId;
  const { caption, altText } = generatePostCaptionAndAlt(slides, effectiveSlug, tokens);
  const previewPng = exportSlideToPngDataUrl(slides[0], aspectRatio, 1, tokens);

  const handleDownloadPng = (scale = 1) => {
    slides.forEach((slide, idx) => {
      setTimeout(() => {
        const dataUrl = exportSlideToPngDataUrl(slide, aspectRatio, scale, tokens);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${effectiveSlug}-slide-${idx + 1}-${scale}x.png`;
        a.click();
      }, idx * 180);
    });
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
    const res = await saveToOrgVaultAction(type, effectiveSlug, {
      title: slides[0]?.title || 'Post do Studio',
      slides,
      aspectRatio,
      previewDataUrl: previewPng,
    });
    setPublishing(false);
    if (res.ok) {
      setNotice(`Salvo com sucesso na pasta /orgs/${effectiveSlug}/studio/${type}!`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#0b0f19] border border-white/15 rounded-3xl p-5 max-w-4xl w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto pr-1">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#FFCC00]">rocket_launch</span>
            <h3 className="text-base font-black text-white">Central de Publicação, Cofre & Exportação</h3>
          </div>
          <button type="button" onClick={() => setStage('editor')} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {notice && (
          <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs text-center font-bold">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Mockup de Celular (Esquerda) */}
          <div className="md:col-span-5 flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
              <button
                type="button" onClick={() => setPreviewMode('feed')}
                className={`px-3 py-1 rounded-lg font-bold ${previewMode === 'feed' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}
              >
                Feed 1:1 / 4:5
              </button>
              <button
                type="button" onClick={() => setPreviewMode('stories')}
                className={`px-3 py-1 rounded-lg font-bold ${previewMode === 'stories' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}
              >
                Stories 9:16
              </button>
            </div>

            {/* Carcaça de Celular */}
            <div className={`relative rounded-3xl border-4 border-slate-700 bg-black overflow-hidden shadow-2xl p-1 flex items-center justify-center ${previewMode === 'stories' ? 'w-[200px] h-[355px]' : 'w-[240px] h-[300px]'}`}>
              <img src={previewPng} alt="Preview Post" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Mockup em Tempo Real ({slides.length} Telas)</span>
          </div>

          {/* Legenda, Acessibilidade e Exportação (Direita) */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Legenda Automática */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Legenda Automática</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(caption); setCopiedCaption(true); setTimeout(() => setCopiedCaption(false), 2000); }}
                  className="text-amber-300 hover:underline font-bold text-[11px]"
                >
                  {copiedCaption ? '✓ Copiado!' : 'Copiar Legenda'}
                </button>
              </div>
              <textarea readOnly rows={4} value={caption} className="w-full p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200" />
            </div>

            {/* Alt Text de Acessibilidade */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Alt-Text Acessível (Leitores de Tela)</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(altText); setCopiedAlt(true); setTimeout(() => setCopiedAlt(false), 2000); }}
                  className="text-amber-300 hover:underline font-bold text-[11px]"
                >
                  {copiedAlt ? '✓ Copiado!' : 'Copiar Alt'}
                </button>
              </div>
              <input readOnly type="text" value={altText} className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-[11px] text-slate-300" />
            </div>

            {/* Ações de Envio e Salvamento no Cofre */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button" disabled={publishing} onClick={() => handleSaveVault('prontos')}
                className="py-2.5 px-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-white flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                <span>Salvar no Cofre</span>
              </button>
              <button
                type="button" disabled={publishing} onClick={() => handleSaveVault('modelos')}
                className="py-2.5 px-3 rounded-xl border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
                <span>Salvar como Modelo</span>
              </button>
            </div>

            {/* Exportação de Arquivos */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button" onClick={() => handleDownloadPng(1)}
                className="py-2 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-slate-300 hover:text-white text-center"
              >
                Baixar PNG 1x
              </button>
              <button
                type="button" onClick={() => handleDownloadPng(2)}
                className="py-2 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-slate-300 hover:text-white text-center"
              >
                PNG 2x Retina
              </button>
              <button
                type="button" disabled={pdfLoading} onClick={handleDownloadPdf}
                className="py-2 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-slate-300 hover:text-white text-center disabled:opacity-50"
              >
                {pdfLoading ? 'Gerando…' : `PDF (${slides.length} pág.)`}
              </button>
            </div>

            {/* Enviar ao Feed do HUB */}
            <button
              type="button" disabled={publishing} onClick={handleSendToHub}
              className="w-full py-3 rounded-xl bg-[#FFCC00] text-black font-black text-xs hover:bg-[#FFD633] transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span>Enviar para o Feed do HUB LabDiv</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
