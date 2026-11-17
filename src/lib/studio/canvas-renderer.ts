// Este programa é um software livre (Licença AGPLv3)
import type {
  StudioSlide, StudioImageLayer, StudioTextLayer, StudioShapeLayer,
  StudioLogoLayer, StudioMathLayer, StudioLayerFilterConfig
} from '@/components/organizacoes/studio/types';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';

const resolvedImageCache = new Map<string, HTMLImageElement>();
const inFlightPromises = new Map<string, Promise<HTMLImageElement>>();

export function getImageSync(src: string): HTMLImageElement | null {
  return resolvedImageCache.get(src) || null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = resolvedImageCache.get(src);
  if (cached) return Promise.resolve(cached);
  const existing = inFlightPromises.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { resolvedImageCache.set(src, img); inFlightPromises.delete(src); resolve(img); };
    img.onerror = (e) => { inFlightPromises.delete(src); reject(e); };
    img.src = src;
  });
  inFlightPromises.set(src, promise);
  return promise;
}

export function buildCssFilter(filters?: StudioLayerFilterConfig): string {
  if (!filters) return 'none';
  const parts: string[] = [];
  if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast !== 100) parts.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation !== 100) parts.push(`saturate(${filters.saturation}%)`);
  if (filters.blur > 0) parts.push(`blur(${filters.blur}px)`);
  if (filters.grayscale > 0) parts.push(`grayscale(${filters.grayscale}%)`);
  if (filters.sepia > 0) parts.push(`sepia(${filters.sepia}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function applyPostEffects(ctx: CanvasRenderingContext2D, f: StudioLayerFilterConfig | undefined, x: number, y: number, w: number, h: number) {
  if (!f) return;
  if (f.overlayDark && f.overlayDark > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${f.overlayDark / 100})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (f.temperature && f.temperature !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = f.temperature > 0 ? `rgba(255,140,0,${f.temperature / 200})` : `rgba(0,100,255,${-f.temperature / 200})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (f.vignette && f.vignette > 0) {
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${f.vignette / 100})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

function renderImageWithMask(ctx: CanvasRenderingContext2D, layer: StudioImageLayer, img: HTMLImageElement, maskImg: HTMLImageElement | null, canvasW: number, canvasH: number) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  const zoom = Math.max(1, layer.zoom || 1), zW = w * zoom, zH = h * zoom;
  const selectiveEdit = layer.filters?.targetMaskAreaOnly && layer.filters?.isCutoutMask === false && maskImg;

  if (selectiveEdit) {
    // 1. Imagem normal sem filtros
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(img, -zW / 2, -zH / 2, zW, zH);
    ctx.restore();

    // 2. Versão com filtro recortada pela máscara desenhada por cima
    const off = document.createElement('canvas');
    off.width = canvasW; off.height = canvasH;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.save();
    offCtx.translate(x + w / 2, y + h / 2);
    if (layer.rotation) offCtx.rotate((layer.rotation * Math.PI) / 180);
    offCtx.filter = buildCssFilter(layer.filters);
    offCtx.globalAlpha = layer.opacity;
    offCtx.drawImage(img, -zW / 2, -zH / 2, zW, zH);
    offCtx.restore();
    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.drawImage(maskImg, x, y, w, h);
    offCtx.restore();
    ctx.drawImage(off, 0, 0);
  } else {
    // Recorte total ou imagem com filtros
    const off = document.createElement('canvas');
    off.width = canvasW; off.height = canvasH;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.save();
    offCtx.translate(x + w / 2, y + h / 2);
    if (layer.rotation) offCtx.rotate((layer.rotation * Math.PI) / 180);
    offCtx.filter = buildCssFilter(layer.filters);
    offCtx.globalAlpha = layer.opacity;
    offCtx.drawImage(img, -zW / 2, -zH / 2, zW, zH);
    offCtx.restore();
    if (maskImg) {
      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.drawImage(maskImg, x, y, w, h);
      offCtx.restore();
    }
    ctx.drawImage(off, 0, 0);
  }
  applyPostEffects(ctx, layer.filters, x, y, w, h);
}

function renderLogoLayer(ctx: CanvasRenderingContext2D, layer: StudioLogoLayer, canvasW: number, canvasH: number, onNeedRepaint?: () => void) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  const srcUrl = layer.src || (layer.preset === 'org-logo' ? '/labdiv-logo.png' : null);
  ctx.save();
  ctx.globalAlpha = layer.opacity;

  if (srcUrl) {
    const img = getImageSync(srcUrl);
    if (!img) { preloadImage(srcUrl).then(() => onNeedRepaint?.()).catch(() => {}); }
    else {
      let dW = w, dH = h;
      if (layer.preserveAspect) {
        const r = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        dW = img.naturalWidth * r; dH = img.naturalHeight * r;
      }
      ctx.drawImage(img, x + (w - dW) / 2, y + (h - dH) / 2, dW, dH);
    }
  } else {
    ctx.fillStyle = layer.tintColor || '#FFCC00';
    ctx.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(layer.preset.toUpperCase(), x + w / 2, y + h / 2);
  }
  ctx.restore();
}

export function renderSlideToCanvas(
  ctx: CanvasRenderingContext2D,
  slide: StudioSlide,
  canvasW: number,
  canvasH: number,
  tokens?: OrgBrandTokens,
  options?: { onNeedRepaint?: () => void }
): void {
  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 1. Fundo
  ctx.fillStyle = slide.backgroundGradient || slide.backgroundColor || tokens?.bgApp || '#07090e';
  ctx.fillRect(0, 0, canvasW, canvasH);
  applyPostEffects(ctx, slide.globalFilters, 0, 0, canvasW, canvasH);

  // 2. Camadas
  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    ctx.save();

    if (layer.type === 'image') {
      const imgLayer = layer as StudioImageLayer;
      const img = getImageSync(imgLayer.src);
      const maskImg = imgLayer.maskDataUrl ? getImageSync(imgLayer.maskDataUrl) : null;
      if (!img) {
        preloadImage(imgLayer.src).then(() => options?.onNeedRepaint?.()).catch(() => {});
      } else {
        if (imgLayer.maskDataUrl && !maskImg) {
          preloadImage(imgLayer.maskDataUrl).then(() => options?.onNeedRepaint?.()).catch(() => {});
        }
        renderImageWithMask(ctx, imgLayer, img, maskImg, canvasW, canvasH);
      }
    } else if (layer.type === 'text') {
      const textLayer = layer as StudioTextLayer;
      ctx.globalAlpha = textLayer.opacity;
      const boxCenterX = (textLayer.x + textLayer.width / 2) * canvasW, boxTopY = textLayer.y * canvasH, maxBoxWidth = textLayer.width * canvasW;
      if (tokens) {
        renderTokenizedRichTextCanvas(ctx, {
          text: textLayer.text, mode: 'body', tokens, boxCenterX, boxTopY, maxBoxWidth,
          fontSize: textLayer.fontSize, align: textLayer.align, customColorOverride: textLayer.color,
        });
      } else {
        ctx.font = `${textLayer.bold ? 'bold ' : ''}${textLayer.fontSize}px ${textLayer.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = textLayer.color || '#ffffff';
        ctx.textAlign = textLayer.align || 'center';
        ctx.fillText(textLayer.text, boxCenterX, boxTopY + textLayer.fontSize);
      }
    } else if (layer.type === 'shape') {
      const shapeLayer = layer as StudioShapeLayer;
      ctx.globalAlpha = shapeLayer.opacity;
      const sx = shapeLayer.x * canvasW, sy = shapeLayer.y * canvasH, sw = shapeLayer.width * canvasW, sh = shapeLayer.height * canvasH;
      ctx.fillStyle = shapeLayer.fillColor || '#ffffff';
      if (shapeLayer.shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(sx, sy, sw, sh);
      }
      if (shapeLayer.strokeColor && shapeLayer.strokeWidth) {
        ctx.strokeStyle = shapeLayer.strokeColor;
        ctx.lineWidth = shapeLayer.strokeWidth;
        ctx.strokeRect(sx, sy, sw, sh);
      }
    } else if (layer.type === 'logo') {
      renderLogoLayer(ctx, layer as StudioLogoLayer, canvasW, canvasH, options?.onNeedRepaint);
    } else if (layer.type === 'math') {
      const mathLayer = layer as StudioMathLayer;
      ctx.globalAlpha = mathLayer.opacity;
      const mx = mathLayer.x * canvasW, my = mathLayer.y * canvasH;
      ctx.fillStyle = mathLayer.color || '#ffffff';
      ctx.font = `italic ${Math.round(mathLayer.height * canvasH * 0.6)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(mathLayer.latex || 'E = mc²', mx + (mathLayer.width * canvasW) / 2, my + (mathLayer.height * canvasH) / 2);
    }

    ctx.restore();
  }

  // 3. Selo de rodapé
  if (slide.showBrandBadge && tokens) {
    ctx.save();
    ctx.font = `700 22px ${tokens.fontDisplay || 'sans-serif'}`;
    ctx.fillStyle = tokens.textMuted || 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(slide.brandBadgeText || tokens.badgeTag || '', canvasW / 2, canvasH - 52);
    ctx.restore();
  }

  ctx.restore();
}
