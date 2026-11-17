// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zipSync } from 'fflate';
import { useOrganizationBrand } from '@/components/organizacoes/OrganizationBrandProvider';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';
import {
  getStudioGalleryMediaAction,
  type StudioGalleryMediaItem,
} from '@/app/(dashboard)/organizacoes/studio-actions';

type AspectRatioKey = '1:1' | '4:5' | '9:16';

const ASPECT_DIMENSIONS: Record<AspectRatioKey, { width: number; height: number; label: string }> = {
  '1:1': { width: 1080, height: 1080, label: '1:1 Feed' },
  '4:5': { width: 1080, height: 1350, label: '4:5 Retrato' },
  '9:16': { width: 1080, height: 1920, label: '9:16 Stories' },
};

interface PostSlide {
  id: string;
  titleText: string;
  bodyText: string;
  activeBlock: 'title' | 'body';
  titleSize: number;
  bodySize: number;
  titleXRatio: number;
  titleYRatio: number;
  bodyXRatio: number;
  bodyYRatio: number;
  titleColor: string;
  bodyColor: string;
  tricolorTitle: boolean;
  imageUrl: string | null;
  imageZoom?: number; // 1.0 .. 3.0 (corte e aproximação)
  imageOffsetX?: number; // -100 .. 100 (% enquadramento X)
  imageOffsetY?: number; // -100 .. 100 (% enquadramento Y)
}

interface ImageAdjustments {
  exposure: number; // -50..50
  contrast: number; // 50..160
  saturation: number; // 0..200
  vibrance: number; // 0..100
  overlayDark: number; // 0..85
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  exposure: 0,
  contrast: 105,
  saturation: 105,
  vibrance: 15,
  overlayDark: 45,
};

interface StudioSliderControlProps {
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  isSigned?: boolean;
  onChange: (val: number) => void;
  accentColor?: string;
}

function StudioSliderControl({
  label,
  icon,
  value,
  min,
  max,
  defaultValue,
  unit = '',
  isSigned = false,
  onChange,
  accentColor,
}: StudioSliderControlProps) {
  const pct = Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
  const isModified = value !== defaultValue;
  const formattedValue = isSigned && value > 0 ? `+${value}${unit}` : `${value}${unit}`;

  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all duration-200 group">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <span
            className="material-symbols-outlined text-[16px] transition-colors"
            style={{ color: accentColor || 'var(--org-primary, #049FFF)' }}
          >
            {icon}
          </span>
          <span className="tracking-tight text-[11px] sm:text-xs">{label}</span>
        </span>

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-accent-primary shadow-inner">
            {formattedValue}
          </span>
          {isModified && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              title="Restaurar padrão"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative flex items-center h-4">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="studio-range-slider w-full h-1.5 rounded-full appearance-none cursor-pointer focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--org-primary, #049FFF) 0%, var(--org-secondary, #FFCC00) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export interface OrganizationPostStudioProps {
  organizationId?: string | null;
  orgSlug?: string | null;
}

export function OrganizationPostStudio({ organizationId, orgSlug }: OrganizationPostStudioProps) {
  const router = useRouter();
  const { tokens } = useOrganizationBrand();
  const effectiveOrgSlug = orgSlug || tokens.themeId;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const draggingRef = useRef<'title' | 'body' | null>(null);

  const [aspect, setAspect] = useState<AspectRatioKey>('4:5');
  const [slides, setSlides] = useState<PostSlide[]>(() => [
    {
      id: 'slide-1',
      titleText: tokens.defaultPostTitle,
      bodyText: tokens.defaultPostBody,
      activeBlock: 'body',
      titleSize: 64,
      bodySize: 40,
      titleXRatio: 0.5,
      titleYRatio: 0.14,
      bodyXRatio: 0.5,
      bodyYRatio: 0.68,
      titleColor: '',
      bodyColor: '',
      tricolorTitle: tokens.tricolorTitlePreset,
      imageUrl: null,
      imageZoom: 1.0,
      imageOffsetX: 0,
      imageOffsetY: 0,
    },
  ]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
    exposure: 0,
    contrast: 105,
    saturation: 105,
    vibrance: 15,
    overlayDark: 45,
  });

  // Estados expansíveis e passos do estúdio (Frente 2.6)
  const [studioStep, setStudioStep] = useState<'media' | 'text' | 'adjustments'>('media');
  const [isCropExpanded, setIsCropExpanded] = useState(true);
  const [isVisualsExpanded, setIsVisualsExpanded] = useState(true);
  const [isTextExpanded, setIsTextExpanded] = useState(true);

  const [galleryItems, setGalleryItems] = useState<StudioGalleryMediaItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'org' | 'server'>('org');
  const [galleryCategory, setGalleryCategory] = useState<string>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [publishingHub, setPublishingHub] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const activeSlide = slides[activeSlideIdx] || slides[0];
  const dims = ASPECT_DIMENSIONS[aspect];

  const updateActiveSlide = useCallback(
    (patch: Partial<PostSlide>) => {
      setSlides((prev) =>
        prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, ...patch } : s))
      );
    },
    [activeSlideIdx]
  );

  // Sincroniza defaults quando o usuário troca de organização no workspace
  useEffect(() => {
    setSlides((prev) =>
      prev.map((s, idx) =>
        idx === 0 && !s.imageUrl
          ? {
              ...s,
              titleText: tokens.defaultPostTitle,
              bodyText: tokens.defaultPostBody,
              tricolorTitle: tokens.tricolorTitlePreset,
            }
          : s
      )
    );
  }, [tokens.themeId, tokens.defaultPostTitle, tokens.defaultPostBody, tokens.tricolorTitlePreset]);

  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    const cached = imageCacheRef.current.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith('blob:') && !url.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        imageCacheRef.current.set(url, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem CORS no Canvas.'));
      img.src = url;
    });
  }, []);

  const drawSlideToCanvas = useCallback(
    async (ctx: CanvasRenderingContext2D, slide: PostSlide, width: number, height: number) => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Fundo padrão da IDV
      ctx.fillStyle = tokens.bgApp;
      ctx.fillRect(0, 0, width, height);

      // Foto com enquadramento, corte (zoom) e filtros em tempo real
      if (slide.imageUrl) {
        try {
          const img = await loadImage(slide.imageUrl);
          const baseScale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
          const zoom = Math.max(1, slide.imageZoom ?? 1.0);
          const scale = baseScale * zoom;
          const drawW = img.naturalWidth * scale;
          const drawH = img.naturalHeight * scale;

          const offsetXRatio = (slide.imageOffsetX ?? 0) / 100;
          const offsetYRatio = (slide.imageOffsetY ?? 0) / 100;

          // Permite mover a imagem mantendo cobertura dinâmica no frame
          const shiftLimitX = Math.max(width * 0.5, (drawW - width) / 2);
          const shiftLimitY = Math.max(height * 0.5, (drawH - height) / 2);

          const dx = (width - drawW) / 2 + (offsetXRatio * shiftLimitX);
          const dy = (height - drawH) / 2 + (offsetYRatio * shiftLimitY);

          const brightness = 100 + adjustments.exposure;
          const sat = adjustments.saturation + adjustments.vibrance * 0.5;
          ctx.save();
          ctx.filter = `brightness(${brightness}%) contrast(${adjustments.contrast}%) saturate(${sat}%)`;
          ctx.drawImage(img, dx, dy, drawW, drawH);
          ctx.restore();

          // Realce sutil de vibração protegido contra Tainted Canvas
          if (adjustments.vibrance > 0) {
            try {
              ctx.getImageData(0, 0, 1, 1);
            } catch {
              // Ignora silenciosamente se imagem não tiver headers CORS
            }
          }
        } catch {
          // Mantém fundo da IDV se imagem falhar
        }
      }

      // Overlay escuro para legibilidade
      if (adjustments.overlayDark > 0) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        const alpha = adjustments.overlayDark / 100;
        grad.addColorStop(0, `rgba(7, 9, 14, ${(alpha * 0.65).toFixed(2)})`);
        grad.addColorStop(0.5, `rgba(7, 9, 14, ${(alpha * 0.45).toFixed(2)})`);
        grad.addColorStop(1, `rgba(7, 9, 14, ${Math.min(0.95, alpha * 1.15).toFixed(2)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Moldura / Borda Neon da IDV
      ctx.save();
      ctx.filter = 'none';
      ctx.strokeStyle = tokens.primaryColor;
      ctx.lineWidth = tokens.themeId === 'show-da-fisica' ? 6 : 3;
      if (tokens.glowIntensity > 0.5) {
        ctx.shadowColor = tokens.primaryColor;
        ctx.shadowBlur = 20 * tokens.glowIntensity;
      }
      ctx.strokeRect(24, 24, width - 48, height - 48);
      ctx.restore();

      // Renderização Tokenizada de Título e Corpo (ctx.filter = 'none' interno)
      if (slide.titleText.trim()) {
        renderTokenizedRichTextCanvas(ctx, {
          text: slide.titleText,
          mode: 'title',
          tokens,
          boxCenterX: slide.titleXRatio * width,
          boxTopY: slide.titleYRatio * height,
          maxBoxWidth: width * 0.82,
          fontSize: slide.titleSize,
          customColorOverride: slide.titleColor || null,
          tricolorAuto: slide.tricolorTitle,
        });
      }

      if (slide.bodyText.trim()) {
        renderTokenizedRichTextCanvas(ctx, {
          text: slide.bodyText,
          mode: 'body',
          tokens,
          boxCenterX: slide.bodyXRatio * width,
          boxTopY: slide.bodyYRatio * height,
          maxBoxWidth: width * 0.84,
          fontSize: slide.bodySize,
          customColorOverride: slide.bodyColor || null,
        });
      }

      // Assinatura institucional discreta no rodapé
      ctx.save();
      ctx.filter = 'none';
      ctx.font = `700 22px ${tokens.fontDisplay}`;
      ctx.fillStyle = tokens.textMuted;
      ctx.textAlign = 'center';
      ctx.fillText(tokens.badgeTag, width / 2, height - 52);
      ctx.restore();

      ctx.restore();
    },
    [tokens, adjustments, loadImage]
  );

  // Renderização contínua do preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSlide) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    void drawSlideToCanvas(ctx, activeSlide, dims.width, dims.height);
  }, [activeSlide, dims.width, dims.height, drawSlideToCanvas]);

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    updateActiveSlide({ imageUrl: blobUrl });
    e.target.value = '';
  };

  // Limpa o cache da galeria quando a organização ativa mudar
  useEffect(() => {
    setGalleryItems([]);
  }, [effectiveOrgSlug, organizationId]);

  const handleOpenGallery = async (initialFilter: 'all' | 'org' | 'server' = 'org') => {
    setGalleryFilter(initialFilter);
    setGalleryCategory('all');
    setGalleryOpen(true);
    if (galleryItems.length > 0) return;
    setGalleryLoading(true);
    try {
      const res = await getStudioGalleryMediaAction({
        organizationId,
        orgSlug: effectiveOrgSlug,
      });
      if (res.ok) setGalleryItems(res.items);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleRefreshGallery = async () => {
    setGalleryLoading(true);
    try {
      const res = await getStudioGalleryMediaAction({
        organizationId,
        orgSlug: effectiveOrgSlug,
      });
      if (res.ok) setGalleryItems(res.items);
    } finally {
      setGalleryLoading(false);
    }
  };

  const galleryCategories = useMemo(() => {
    const cats = new Set<string>();
    galleryItems.forEach((item) => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats);
  }, [galleryItems]);

  const filteredGalleryItems = useMemo(() => {
    return galleryItems.filter((item) => {
      if (galleryFilter === 'org' && item.source !== 'org_acervo' && item.source !== 'org_vault' && item.source !== 'org') {
        return false;
      }
      if (galleryFilter === 'server' && item.source !== 'org_vault' && item.source !== 'personal' && item.source !== 'portfolio') {
        return false;
      }
      if (galleryCategory !== 'all' && item.category !== galleryCategory) {
        return false;
      }
      if (gallerySearch.trim()) {
        const q = gallerySearch.toLowerCase();
        const matchesName = item.fileName.toLowerCase().includes(q);
        const matchesLabel = (item.label || '').toLowerCase().includes(q);
        const matchesCat = (item.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLabel && !matchesCat) return false;
      }
      return true;
    });
  }, [galleryItems, galleryFilter, galleryCategory, gallerySearch]);

  const activeImageMeta = useMemo(() => {
    if (!activeSlide.imageUrl) return null;
    return galleryItems.find(
      (item) => item.streamUrl === activeSlide.imageUrl || item.thumbUrl === activeSlide.imageUrl
    );
  }, [activeSlide.imageUrl, galleryItems]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const yRatio = (e.clientY - rect.top) / rect.height;
    const distTitle = Math.abs(yRatio - activeSlide.titleYRatio);
    const distBody = Math.abs(yRatio - activeSlide.bodyYRatio);
    draggingRef.current = distTitle < distBody ? 'title' : 'body';
    canvas.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xRatio = Math.max(0.15, Math.min(0.85, (e.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0.06, Math.min(0.88, (e.clientY - rect.top) / rect.height));
    if (draggingRef.current === 'title') {
      updateActiveSlide({ titleXRatio: xRatio, titleYRatio: yRatio, activeBlock: 'title' });
    } else {
      updateActiveSlide({ bodyXRatio: xRatio, bodyYRatio: yRatio, activeBlock: 'body' });
    }
  };

  const handleCanvasPointerUp = () => {
    draggingRef.current = null;
  };

  const handleAddSlide = () => {
    const nextIdx = slides.length;
    setSlides((prev) => [
      ...prev,
      {
        ...activeSlide,
        id: `slide-${Date.now()}`,
        bodyText: `Slide ${nextIdx + 1}: continue sua narrativa com *destaques* na IDV.`,
      },
    ]);
    setActiveSlideIdx(nextIdx);
  };

  const handleSplitTextCarousel = () => {
    const sentences = activeSlide.bodyText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 1) return;

    const generated = sentences.map((sentence, idx) => ({
      ...activeSlide,
      id: `slide-split-${Date.now()}-${idx}`,
      bodyText: sentence,
    }));
    setSlides(generated);
    setActiveSlideIdx(0);
  };

  const handleBackToOrg = () => {
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'AURTISTIC_STUDIO_BACK_TO_ORG', orgSlug: effectiveOrgSlug },
          '*'
        );
      }
    } catch {}

    const isEmbed = typeof window !== 'undefined' && window.location.pathname.startsWith('/embed');
    if (isEmbed) {
      router.push(`/embed/org/${effectiveOrgSlug}`);
    } else {
      router.push(`/labdiv?org=${effectiveOrgSlug}`);
    }
  };

  // Download do slide ativo individualmente (PNG)
  const handleDownloadCurrentSlide = async () => {
    setExporting(true);
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = dims.width;
      offscreen.height = dims.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Contexto 2D indisponível.');

      await drawSlideToCanvas(ctx, activeSlide, dims.width, dims.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        offscreen.toBlob(resolve, 'image/png')
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tokens.themeId}-slide-${String(activeSlideIdx + 1).padStart(2, '0')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } finally {
      setExporting(false);
    }
  };

  // Download de todos os slides do carrossel (.zip ou PNG se único)
  const handleDownloadAllCarousel = async () => {
    setExporting(true);
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = dims.width;
      offscreen.height = dims.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Contexto 2D indisponível.');

      const renderedBlobs: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < slides.length; i++) {
        await drawSlideToCanvas(ctx, slides[i], dims.width, dims.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          offscreen.toBlob(resolve, 'image/png')
        );
        if (blob) {
          renderedBlobs.push({
            name: `${tokens.themeId}-slide-${String(i + 1).padStart(2, '0')}.png`,
            blob,
          });
        }
      }

      if (renderedBlobs.length === 0) return;

      if (renderedBlobs.length === 1) {
        const url = URL.createObjectURL(renderedBlobs[0].blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = renderedBlobs[0].name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      } else {
        const filesMap: Record<string, Uint8Array> = {};
        for (const item of renderedBlobs) {
          filesMap[item.name] = new Uint8Array(await item.blob.arrayBuffer());
        }
        const zipped = zipSync(filesMap);
        const zipBlob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tokens.themeId}-carrossel-${renderedBlobs.length}-slides.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } finally {
      setExporting(false);
    }
  };

  // Envia o post/carrossel renderizado diretamente ao modal de publicação do HUB LabDiv
  const handlePublishToHub = async () => {
    setPublishingHub(true);
    setPublishNotice(null);
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = dims.width;
      offscreen.height = dims.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Contexto 2D indisponível.');

      const renderedDataUrls: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        await drawSlideToCanvas(ctx, slides[i], dims.width, dims.height);
        renderedDataUrls.push(offscreen.toDataURL('image/png'));
      }

      if (renderedDataUrls.length === 0) return;

      const payload = {
        orgSlug: effectiveOrgSlug,
        title: activeSlide.titleText,
        body: activeSlide.bodyText,
        imageDataUrl: renderedDataUrls[activeSlideIdx] || renderedDataUrls[0],
        images: renderedDataUrls,
        isCarousel: renderedDataUrls.length > 1,
        aspect,
        brandDisplayName: tokens.displayName,
        badgeTag: tokens.badgeTag,
        primaryColor: tokens.primaryColor,
      };

      const isInsideIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
      if (isInsideIframe) {
        window.parent.postMessage({ type: 'AURTISTIC_STUDIO_PUBLISH_HUB', payload }, '*');
        setPublishNotice('Post enviado ao modal de publicação do HUB LabDiv!');
      } else {
        setPublishNotice('Abra o HUB Studio dentro do HUB LabDiv (/gestao?tab=studio) para publicar diretamente no feed.');
      }
      setTimeout(() => setPublishNotice(null), 4500);
    } finally {
      setPublishingHub(false);
    }
  };

  const activeColorValue = useMemo(
    () => (activeSlide.activeBlock === 'title' ? activeSlide.titleColor : activeSlide.bodyColor),
    [activeSlide]
  );

  return (
    <div
      className="rounded-2xl border p-4 md:p-6 space-y-5"
      style={{ backgroundColor: tokens.bgSurface, border: tokens.borderStyleCss }}
    >
      {/* Barra superior de navegação e exportação */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToOrg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white transition-all cursor-pointer shadow-sm group"
            title={`Voltar para a gestão de operações de ${tokens.displayName}`}
          >
            <span className="material-symbols-outlined text-[16px] group-hover:-translate-x-0.5 transition-transform">
              arrow_back
            </span>
            <span>Voltar</span>
          </button>

          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: tokens.primaryColor }}>
              {tokens.badgeTag}
            </span>
            <h2 className="text-base md:text-lg font-black" style={{ fontFamily: tokens.fontDisplay }}>
              Studio de Posts Automáticos (IDV)
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setAspect(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                aspect === key
                  ? 'bg-white text-black border-white'
                  : 'border-white/20 text-slate-300 hover:text-white'
              }`}
            >
              {ASPECT_DIMENSIONS[key].label}
            </button>
          ))}

          {/* Publicar no HUB LabDiv */}
          <button
            type="button"
            onClick={handlePublishToHub}
            disabled={publishingHub || exporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black bg-accent-primary text-on-accent-primary hover:bg-accent-primary-hover cursor-pointer disabled:opacity-50 transition-all shadow-sm"
            title="Publicar post ou carrossel diretamente no Feed do HUB LabDiv"
          >
            <span className="material-symbols-outlined text-[15px]">
              {publishingHub ? 'sync' : 'publish'}
            </span>
            <span>{publishingHub ? 'Enviando...' : 'Publicar no HUB'}</span>
          </button>

          {/* Baixar Slide Atual (PNG) */}
          <button
            type="button"
            onClick={handleDownloadCurrentSlide}
            disabled={exporting || publishingHub}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer disabled:opacity-50 transition-all shadow-sm"
            title="Baixar apenas o slide atualmente em exibição em formato PNG"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            <span>
              {exporting
                ? 'Baixando...'
                : slides.length > 1
                  ? `Baixar Slide ${activeSlideIdx + 1} (PNG)`
                  : 'Exportar para Instagram (PNG)'}
            </span>
          </button>

          {/* Baixar Todos os Slides (Carrossel .zip) */}
          {slides.length > 1 && (
            <button
              type="button"
              onClick={handleDownloadAllCarousel}
              disabled={exporting || publishingHub}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black bg-accent-secondary text-on-accent-secondary hover:bg-accent-secondary-hover cursor-pointer disabled:opacity-50 transition-all shadow-sm"
              title="Baixar todos os slides do carrossel compactados em .zip"
            >
              <span className="material-symbols-outlined text-[15px]">folder_zip</span>
              <span>{exporting ? 'Compactando...' : `Exportar Carrossel (${slides.length} .zip)`}</span>
            </button>
          )}
        </div>
      </div>

      {publishNotice && (
        <div className="px-3.5 py-2 rounded-xl bg-accent-primary/15 border border-accent-primary/40 text-accent-primary text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">campaign</span>
          <span>{publishNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Preview Interativo Canvas 2D */}
        <div className="lg:col-span-6 flex flex-col items-center gap-3">
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className="w-full max-w-[440px] max-h-[620px] object-contain rounded-xl border border-white/15 shadow-2xl cursor-move touch-none"
          />
          <p className="text-[11px] text-slate-400">
            Arraste diretamente sobre o preview para reposicionar o Título ou o Texto Normal.
          </p>

          {/* Barra de Slides (Carrossel) */}
          <div className="w-full flex flex-wrap items-center gap-2 pt-2">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSlideIdx(idx)}
                className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                  idx === activeSlideIdx
                    ? 'border-[#FFCC00] bg-[#FFCC00]/20 text-[#FFCC00]'
                    : 'border-white/15 text-slate-300'
                }`}
              >
                Slide {idx + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAddSlide}
              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-white/20 text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              + Slide
            </button>
            <button
              type="button"
              onClick={handleSplitTextCarousel}
              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-white/20 text-teal-300 hover:bg-teal-500/10 cursor-pointer"
            >
              Dividir texto em Carrossel
            </button>
          </div>
        </div>

        {/* Controles do Post Automático & Foto em 3 Passos (Frente 2.6) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Navegação de 3 Passos do Studio */}
          <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setStudioStep('media')}
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                studioStep === 'media'
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">photo_library</span>
              <span className="truncate">1. Mídia</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioStep('text')}
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                studioStep === 'text'
                  ? 'bg-accent-secondary/20 text-accent-secondary border border-accent-secondary/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span>
              <span className="truncate">2. Textos</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioStep('adjustments')}
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                studioStep === 'adjustments'
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              <span className="truncate">3. Filtros</span>
            </button>
          </div>

          {/* PASSO 1: Seleção de Foto & Corte */}
          {studioStep === 'media' && (
            <>
              {/* Seleção de Foto */}
              <div className="p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-200 font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-accent-primary">photo_library</span>
                Imagem de Fundo — Slide {activeSlideIdx + 1}
              </span>
              {activeSlide.imageUrl ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Foto ativa
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-400">Padrão IDV</span>
              )}
            </div>

            {/* Ações principais de seleção de imagem */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleOpenGallery('org')}
                className="px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-sm group hover:scale-[1.02]"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderColor: tokens.primaryColor ? `${tokens.primaryColor}aa` : 'rgba(6,182,212,0.5)',
                  color: tokens.primaryColor || '#38bdf8',
                }}
              >
                <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">
                  collections
                </span>
                <span>Fotos da Org</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenGallery('server')}
                className="px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 transition-all cursor-pointer hover:scale-[1.02]"
              >
                <span className="material-symbols-outlined text-[18px] text-accent-primary">cloud</span>
                <span>Cofre / Servidor</span>
              </button>

              <label className="px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 transition-all cursor-pointer hover:scale-[1.02]">
                <span className="material-symbols-outlined text-[18px] text-amber-300">upload_file</span>
                <span>Upload Local</span>
                <input type="file" accept="image/*" onChange={handleLocalUpload} className="hidden" />
              </label>
            </div>

            {/* Mini preview do fundo selecionado (se houver) */}
            {activeSlide.imageUrl ? (
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-emerald-500/30 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0 bg-black">
                    <img
                      src={activeSlide.imageUrl}
                      alt="Fundo ativo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-100 truncate">
                      {activeImageMeta?.label || activeImageMeta?.fileName || 'Imagem Personalizada'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {activeImageMeta?.category ? `${activeImageMeta.category} • ` : ''}Fundo ativo no slide {activeSlideIdx + 1}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenGallery('org')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-white/20 hover:bg-white/10 text-slate-200 cursor-pointer"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveSlide({ imageUrl: null })}
                    className="p-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer"
                    title="Remover fundo"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-black/20 border border-dashed border-white/10 text-center">
                <p className="text-[11px] text-slate-400">
                  Nenhuma foto ativa. O slide usará as cores e moldura da IDV de <strong className="text-slate-200">{tokens.displayName}</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Corte & Enquadramento da Foto (quando houver imagem ativa) */}
          {activeSlide.imageUrl && (
            <div className="p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm space-y-3.5 shadow-xl">
              <button
                type="button"
                onClick={() => setIsCropExpanded(!isCropExpanded)}
                className="w-full flex items-center justify-between pb-1 border-b border-white/10 text-left cursor-pointer group"
              >
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-200 font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-400 group-hover:scale-110 transition-transform">
                    crop
                  </span>
                  <span>Corte & Enquadramento da Foto</span>
                  {activeSlide.imageZoom && activeSlide.imageZoom > 1 && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {activeSlide.imageZoom.toFixed(2)}x
                    </span>
                  )}
                </span>
                <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-white transition-transform">
                  {isCropExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {isCropExpanded && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <StudioSliderControl
                      label="Zoom (Corte)"
                      icon="zoom_in"
                      min={100}
                      max={300}
                      defaultValue={100}
                      value={Math.round((activeSlide.imageZoom ?? 1.0) * 100)}
                      unit="%"
                      accentColor="#f59e0b"
                      onChange={(val) => updateActiveSlide({ imageZoom: Number((val / 100).toFixed(2)) })}
                    />
                    <StudioSliderControl
                      label="Posição X"
                      icon="swap_horiz"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      value={activeSlide.imageOffsetX ?? 0}
                      isSigned={true}
                      unit="%"
                      accentColor="#f59e0b"
                      onChange={(val) => updateActiveSlide({ imageOffsetX: val })}
                    />
                    <StudioSliderControl
                      label="Posição Y"
                      icon="swap_vert"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      value={activeSlide.imageOffsetY ?? 0}
                      isSigned={true}
                      unit="%"
                      accentColor="#f59e0b"
                      onChange={(val) => updateActiveSlide({ imageOffsetY: val })}
                    />
                  </div>

                  {/* Presets Rápidos de Enquadramento */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Presets Rápidos:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateActiveSlide({ imageOffsetX: 0, imageOffsetY: 0 })}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
                      >
                        Centro
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveSlide({ imageOffsetX: 0, imageOffsetY: -45 })}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
                      >
                        Topo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveSlide({ imageOffsetX: 0, imageOffsetY: 45 })}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
                      >
                        Base
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveSlide({ imageZoom: 1.0, imageOffsetX: 0, imageOffsetY: 0 })
                        }
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer transition-all"
                        title="Restaurar zoom e enquadramento padrão"
                      >
                        Redefinir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}

          {/* PASSO 2: Edição de Textos & Tipografia */}
          {studioStep === 'text' && (
            <div className="p-3.5 rounded-xl border border-white/10 bg-black/30 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-white/10">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-200 font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-accent-primary">
                    edit_note
                  </span>
                  <span>Edição de Textos & Tipografia — Slide {activeSlideIdx + 1}</span>
                </span>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1 bg-black/50 p-1 rounded-lg border border-white/10">
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ activeBlock: 'title' })}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                        activeSlide.activeBlock === 'title' ? 'bg-white text-black' : 'text-slate-300'
                      }`}
                    >
                      Estilo Título
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ activeBlock: 'body' })}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                        activeSlide.activeBlock === 'body' ? 'bg-white text-black' : 'text-slate-300'
                      }`}
                    >
                      Texto Normal
                    </button>
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeSlide.tricolorTitle}
                      onChange={(e) => updateActiveSlide({ tricolorTitle: e.target.checked })}
                    />
                    Título Tricolor IDV
                  </label>
                </div>

                {tokens.themeId === 'show-da-fisica' && activeSlide.activeBlock === 'title' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ tricolorTitle: true, titleColor: '' })}
                      className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                        activeSlide.tricolorTitle && !activeSlide.titleColor
                          ? 'border-white bg-white/15 text-white'
                          : 'border-white/15 text-slate-300'
                      }`}
                    >
                      Tricolor Automático (RGB)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ tricolorTitle: false, titleColor: '#0066ff' })}
                      className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                        activeSlide.titleColor === '#0066ff'
                          ? 'border-[#0066ff] bg-[#0066ff]/20 text-[#60a5fa]'
                          : 'border-white/15 text-slate-300'
                      }`}
                    >
                      Neon Azul
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ tricolorTitle: false, titleColor: '#00ff44' })}
                      className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                        activeSlide.titleColor === '#00ff44'
                          ? 'border-[#00ff44] bg-[#00ff44]/20 text-[#4ade80]'
                          : 'border-white/15 text-slate-300'
                      }`}
                    >
                      Neon Verde
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ tricolorTitle: false, titleColor: '#ff1e1e' })}
                      className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                        activeSlide.titleColor === '#ff1e1e'
                          ? 'border-[#ff1e1e] bg-[#ff1e1e]/20 text-[#f87171]'
                          : 'border-white/15 text-slate-300'
                      }`}
                    >
                      Neon Vermelho
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Título (suporta [r:SHOW] [b:DE] [g:FÍSICA] ou *destaques*)
                  </label>
                  <input
                    type="text"
                    value={activeSlide.titleText}
                    onChange={(e) => updateActiveSlide({ titleText: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Texto Normal (use *palavra ou frase* para destacar na cor da IDV)
                  </label>
                  <textarea
                    rows={3}
                    value={activeSlide.bodyText}
                    onChange={(e) => updateActiveSlide({ bodyText: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white resize-y"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[220px]">
                    <StudioSliderControl
                      label={`Tamanho do ${activeSlide.activeBlock === 'title' ? 'Título' : 'Texto Normal'}`}
                      icon="format_size"
                      min={24}
                      max={110}
                      defaultValue={activeSlide.activeBlock === 'title' ? 64 : 40}
                      value={activeSlide.activeBlock === 'title' ? activeSlide.titleSize : activeSlide.bodySize}
                      unit="px"
                      onChange={(size) => {
                        updateActiveSlide(
                          activeSlide.activeBlock === 'title' ? { titleSize: size } : { bodySize: size }
                        );
                      }}
                    />
                  </div>
                  <label className="text-xs text-slate-300 flex flex-col gap-1">
                    <span>Cor</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activeColorValue || '#ffffff'}
                        onChange={(e) =>
                          updateActiveSlide(
                            activeSlide.activeBlock === 'title'
                              ? { titleColor: e.target.value }
                              : { bodyColor: e.target.value }
                          )
                        }
                        className="h-8 w-10 rounded-lg border border-white/20 bg-transparent cursor-pointer"
                      />
                      {activeColorValue && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveSlide(
                              activeSlide.activeBlock === 'title' ? { titleColor: '' } : { bodyColor: '' }
                            )
                          }
                          className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          IDV
                        </button>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: Ajustes Visuais & Filtros (Frente 2.6) */}
          {studioStep === 'adjustments' && (
            <div className="p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm space-y-3.5 shadow-xl">
              <div className="flex items-center justify-between pb-1 border-b border-white/10">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-200 font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-accent-primary">tune</span>
                  <span>Ajustes Visuais & Filtros — Slide {activeSlideIdx + 1}</span>
                </span>

                {Object.entries(DEFAULT_ADJUSTMENTS).some(
                  ([k, def]) => adjustments[k as keyof ImageAdjustments] !== def
                ) && (
                  <button
                    type="button"
                    onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer shrink-0 ml-2"
                    title="Restaurar todos os filtros para os valores padrão"
                  >
                    <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                    <span>Restaurar</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <StudioSliderControl
                  label="Exposição"
                  icon="light_mode"
                  min={-50}
                  max={50}
                  defaultValue={DEFAULT_ADJUSTMENTS.exposure}
                  value={adjustments.exposure}
                  isSigned={true}
                  onChange={(val) => setAdjustments((prev) => ({ ...prev, exposure: val }))}
                />
                <StudioSliderControl
                  label="Contraste"
                  icon="contrast"
                  min={50}
                  max={160}
                  defaultValue={DEFAULT_ADJUSTMENTS.contrast}
                  value={adjustments.contrast}
                  unit="%"
                  onChange={(val) => setAdjustments((prev) => ({ ...prev, contrast: val }))}
                />
                <StudioSliderControl
                  label="Saturação"
                  icon="palette"
                  min={0}
                  max={200}
                  defaultValue={DEFAULT_ADJUSTMENTS.saturation}
                  value={adjustments.saturation}
                  unit="%"
                  onChange={(val) => setAdjustments((prev) => ({ ...prev, saturation: val }))}
                />
                <StudioSliderControl
                  label="Vibração"
                  icon="auto_fix_high"
                  min={0}
                  max={100}
                  defaultValue={DEFAULT_ADJUSTMENTS.vibrance}
                  value={adjustments.vibrance}
                  unit="%"
                  onChange={(val) => setAdjustments((prev) => ({ ...prev, vibrance: val }))}
                />
                <div className="sm:col-span-2">
                  <StudioSliderControl
                    label="Overlay Escuro"
                    icon="dark_mode"
                    min={0}
                    max={85}
                    defaultValue={DEFAULT_ADJUSTMENTS.overlayDark}
                    value={adjustments.overlayDark}
                    unit="%"
                    onChange={(val) => setAdjustments((prev) => ({ ...prev, overlayDark: val }))}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal / Acervo de Fotos da Organização */}
      {galleryOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setGalleryOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-slate-950 border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
                  style={{
                    backgroundColor: tokens.primaryColor ? `${tokens.primaryColor}22` : 'rgba(6,182,212,0.15)',
                    color: tokens.primaryColor || '#38bdf8',
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">photo_library</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                    Acervo Fotográfico
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full border font-mono font-normal uppercase"
                      style={{
                        borderColor: tokens.primaryColor ? `${tokens.primaryColor}55` : 'rgba(255,255,255,0.2)',
                        color: tokens.primaryColor || '#38bdf8',
                      }}
                    >
                      {tokens.displayName}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Selecione uma foto para aplicar instantaneamente como imagem de fundo do Slide {activeSlideIdx + 1}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshGallery}
                  disabled={galleryLoading}
                  className="p-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors"
                  title="Recarregar fotos"
                >
                  <span className={`material-symbols-outlined text-[20px] ${galleryLoading ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryOpen(false)}
                  className="p-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition-colors"
                  title="Fechar"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="p-4 border-b border-white/10 bg-black/40 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                {/* Abas */}
                <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('org')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      galleryFilter === 'org'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Fotos da Organização
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      galleryFilter === 'all'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todas ({galleryItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('server')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      galleryFilter === 'server'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cofre / Servidor
                  </button>
                </div>

                {/* Campo de Busca */}
                <div className="relative flex-1 max-w-sm">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    placeholder="Filtrar por nome, aparato ou categoria..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-black/50 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent-primary"
                  />
                  {gallerySearch && (
                    <button
                      type="button"
                      onClick={() => setGallerySearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Categorias */}
              {galleryCategories.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] font-mono shrink-0 mr-1">
                    Categorias:
                  </span>
                  <button
                    type="button"
                    onClick={() => setGalleryCategory('all')}
                    className={`px-2.5 py-0.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      galleryCategory === 'all'
                        ? 'bg-white/20 text-white font-bold'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todas ({galleryItems.length})
                  </button>
                  {galleryCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGalleryCategory(cat)}
                      className={`px-2.5 py-0.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        galleryCategory === cat
                          ? 'bg-accent-primary/20 text-accent-primary font-bold border border-accent-primary/40'
                          : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid de Imagens */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[55vh]">
              {galleryLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-accent-primary border-t-transparent animate-spin" />
                  <p className="text-xs">Carregando fotos da organização...</p>
                </div>
              ) : filteredGalleryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 text-center">
                  <span className="material-symbols-outlined text-[36px] text-slate-600">image_not_supported</span>
                  <p className="text-xs font-bold text-slate-300">Nenhuma foto encontrada</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Tente alterar o filtro ou termo de busca, ou faça upload de uma foto local para utilizar no slide.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {filteredGalleryItems.map((item) => {
                    const isCurrent =
                      activeSlide.imageUrl === item.streamUrl || activeSlide.imageUrl === item.thumbUrl;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          updateActiveSlide({ imageUrl: item.streamUrl });
                          setGalleryOpen(false);
                        }}
                        className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col bg-slate-900/90 hover:shadow-lg ${
                          isCurrent
                            ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                            : 'border-white/10 hover:border-accent-primary hover:scale-[1.02]'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-[4/3] w-full overflow-hidden bg-black/60 relative">
                          <img
                            src={item.thumbUrl}
                            alt={item.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          {isCurrent && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] uppercase tracking-wider shadow">
                              Em Uso
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                            <span className="px-3 py-1.5 rounded-lg bg-accent-primary text-on-accent-primary text-xs font-bold shadow-lg flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px]">wallpaper</span>
                              Usar no Fundo
                            </span>
                          </div>
                        </div>

                        {/* Detalhes */}
                        <div className="p-2.5 flex flex-col gap-0.5 flex-1 justify-between">
                          <p
                            className="text-[11px] font-bold text-slate-200 line-clamp-1 group-hover:text-accent-primary transition-colors"
                            title={item.label || item.fileName}
                          >
                            {item.label || item.fileName}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-accent-primary/90 font-mono truncate max-w-[120px]">
                              {item.category || 'Geral'}
                            </span>
                            <span className="text-slate-500 text-[9px] uppercase tracking-wider">
                              {item.source === 'org_acervo' ? 'Oficial' : 'Cofre'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="px-5 py-3 border-t border-white/10 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
              <span>
                Exibindo <strong className="text-slate-200">{filteredGalleryItems.length}</strong> de{' '}
                <strong className="text-slate-200">{galleryItems.length}</strong> imagens disponíveis
              </span>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="px-4 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 font-bold transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

