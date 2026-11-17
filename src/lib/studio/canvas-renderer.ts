// Este programa é um software livre (Licença AGPLv3)
import type { StudioSlide, StudioImageLayer, StudioTextLayer, StudioShapeLayer, StudioLayerFilterConfig } from '@/components/organizacoes/studio/types';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';

// Cache síncrono em RAM para 60 FPS sem flicker
const resolvedImageCache = new Map<string, HTMLImageElement>();
const inFlightPromises = new Map<string, Promise<HTMLImageElement>>();

export function getImageSync(src: string): HTMLImageElement | null {
  return resolvedImageCache.get(src) || null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = resolvedImageCache.get(src);
  if (cached) return Promise.resolve(cached);

  const existingPromise = inFlightPromises.get(src);
  if (existingPromise) return existingPromise;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolvedImageCache.set(src, img);
      inFlightPromises.delete(src);
      resolve(img);
    };
    img.onerror = (err) => {
      inFlightPromises.delete(src);
      reject(err);
    };
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

function renderImageWithMask(
  ctx: CanvasRenderingContext2D,
  layer: StudioImageLayer,
  img: HTMLImageElement,
  maskImg: HTMLImageElement | null,
  canvasW: number,
  canvasH: number
) {
  const x = layer.x * canvasW;
  const y = layer.y * canvasH;
  const w = layer.width * canvasW;
  const h = layer.height * canvasH;

  const off = document.createElement('canvas');
  off.width = canvasW;
  off.height = canvasH;
  const offCtx = off.getContext('2d');
  if (!offCtx) return;

  offCtx.save();
  offCtx.translate(x + w / 2, y + h / 2);
  if (layer.rotation) offCtx.rotate((layer.rotation * Math.PI) / 180);
  offCtx.filter = buildCssFilter(layer.filters);
  offCtx.globalAlpha = layer.opacity;

  const zoom = Math.max(1, layer.zoom || 1);
  const zW = w * zoom;
  const zH = h * zoom;
  offCtx.drawImage(img, -zW / 2, -zH / 2, zW, zH);
  offCtx.restore();

  if (maskImg) {
    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.drawImage(maskImg, 0, 0, canvasW, canvasH);
    offCtx.restore();
  }

  if (layer.filters?.targetMaskAreaOnly && maskImg) {
    // Desenha base sem filtro e adiciona máscara filtrada por cima
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(img, -zW / 2, -zH / 2, zW, zH);
    ctx.restore();
  }

  ctx.drawImage(off, 0, 0);
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
  if (slide.backgroundGradient) {
    ctx.fillStyle = slide.backgroundGradient;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else {
    ctx.fillStyle = slide.backgroundColor || tokens?.bgApp || '#07090e';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 2. Camadas ordenadas por Z-index
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
      const boxCenterX = (textLayer.x + textLayer.width / 2) * canvasW;
      const boxTopY = textLayer.y * canvasH;
      const maxBoxWidth = textLayer.width * canvasW;

      if (tokens) {
        renderTokenizedRichTextCanvas(ctx, {
          text: textLayer.text,
          mode: 'body',
          tokens,
          boxCenterX,
          boxTopY,
          maxBoxWidth,
          fontSize: textLayer.fontSize,
          align: textLayer.align,
          customColorOverride: textLayer.color,
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
      const sx = shapeLayer.x * canvasW;
      const sy = shapeLayer.y * canvasH;
      const sw = shapeLayer.width * canvasW;
      const sh = shapeLayer.height * canvasH;

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
    }

    ctx.restore();
  }

  // 3. Selo institucional de rodapé
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
