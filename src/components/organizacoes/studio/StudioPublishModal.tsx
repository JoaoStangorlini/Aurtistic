// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { ASPECT_DIMENSIONS } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';

export function StudioPublishModal({ orgSlug }: { orgSlug?: string | null }) {
  const { stage, setStage, slides, aspectRatio } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (stage !== 'publish') return null;

  const effectiveSlug = orgSlug || tokens.themeId;
  const dims = ASPECT_DIMENSIONS[aspectRatio];

  const handleDownloadAllPNG = async () => {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const off = document.createElement('canvas');
      off.width = dims.width;
      off.height = dims.height;
      const ctx = off.getContext('2d');
      if (!ctx) continue;
      renderSlideToCanvas(ctx, slide, dims.width, dims.height, tokens);
      const url = off.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${effectiveSlug}-slide-${i + 1}-${Date.now()}.png`;
      a.click();
    }
  };

  const handleSendToHub = async () => {
    setPublishing(true);
    try {
      // Gera dataUrl do primeiro slide
      const off = document.createElement('canvas');
      off.width = dims.width;
      off.height = dims.height;
      const ctx = off.getContext('2d');
      if (ctx && slides[0]) {
        renderSlideToCanvas(ctx, slides[0], dims.width, dims.height, tokens);
      }
      const previewDataUrl = off.toDataURL('image/png');

      const titleLayer = slides[0]?.layers.find((l) => l.type === 'text');
      const title = titleLayer && 'text' in titleLayer ? (titleLayer as any).text : 'Post do Studio';

      const payload = {
        title,
        body: `Post automático criado no HUB Studio (${tokens.badgeTag}).`,
        orgSlug: effectiveSlug,
        aspect: aspectRatio,
        brandDisplayName: tokens.displayName,
        badgeTag: tokens.badgeTag,
        primaryColor: tokens.primaryColor,
        imageDataUrl: previewDataUrl,
        slidesCount: slides.length,
      };

      const isInsideIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
      if (isInsideIframe) {
        window.parent.postMessage({ type: 'AURTISTIC_STUDIO_PUBLISH_HUB', payload }, '*');
        setNotice('Post enviado com sucesso ao modal do HUB LabDiv!');
      } else {
        setNotice('Post pronto! No modo embed, este post seria enviado diretamente para aprovação no HUB.');
      }
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#0b0f19] border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#FFCC00]">rocket_launch</span>
            <h3 className="text-base font-black text-white">Publicar & Exportar Post</h3>
          </div>
          <button
            type="button"
            onClick={() => setStage('editor')}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Organização:</span>
            <span className="font-bold text-white uppercase">{effectiveSlug}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total de Telas:</span>
            <span className="font-bold text-white">{slides.length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Formato:</span>
            <span className="font-bold text-amber-300 font-mono">{aspectRatio}</span>
          </div>
        </div>

        {notice && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold text-center">
            {notice}
          </div>
        )}

        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={publishing}
            onClick={handleSendToHub}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FFCC00] text-[#121212] font-black text-xs hover:bg-[#FFD633] transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>{publishing ? 'Enviando...' : 'Enviar para o Feed do HUB LabDiv'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAllPNG}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white font-bold text-xs hover:bg-white/10 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Baixar Todas as Telas em PNG (1080p)</span>
          </button>
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setStage('editor')}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            ← Voltar e Continuar Editando
          </button>
        </div>
      </div>
    </div>
  );
}
