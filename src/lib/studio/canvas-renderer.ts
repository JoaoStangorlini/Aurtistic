// Este programa é um software livre (Licença AGPLv3)
import type {
  StudioSlide, StudioImageLayer, StudioTextLayer, StudioShapeLayer,
  StudioLogoLayer, StudioMathLayer, StudioLayerFilterConfig
} from '@/components/organizacoes/studio/types';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';

const resolvedImageCache = new Map<string, HTMLImageElement>();
const inFlightPromises = new Map<string, Promise<HTMLImageElement>>();

export function getImageSync(src: string): HTMLImageElement | null { return resolvedImageCache.get(src) || null; }

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
  const p: string[] = [];
  if (filters.brightness !== 100) p.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast !== 100) p.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation !== 100) p.push(`saturate(${filters.saturation}%)`);
  if (filters.blur > 0) p.push(`blur(${filters.blur}px)`);
  if (filters.grayscale > 0) p.push(`grayscale(${filters.grayscale}%)`);
  if (filters.sepia > 0) p.push(`sepia(${filters.sepia}%)`);
  return p.length > 0 ? p.join(' ') : 'none';
}

function applyPostEffects(ctx: CanvasRenderingContext2D, f: StudioLayerFilterConfig | undefined, x: number, y: number, w: number, h: number) {
  if (!f) return;
  if (f.overlayDark && f.overlayDark > 0) {
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${f.overlayDark / 100})`; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (f.temperature && f.temperature !== 0) {
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = f.temperature > 0 ? `rgba(255,140,0,${f.temperature / 200})` : `rgba(0,100,255,${-f.temperature / 200})`;
    ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (f.vignette && f.vignette > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.max(w, h) * 0.1, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, `rgba(0,0,0,${f.vignette / 100})`);
    ctx.fillStyle = grad; ctx.fillRect(x, y, w, h); ctx.restore();
  }
}

function renderImageWithMask(ctx: CanvasRenderingContext2D, layer: StudioImageLayer, img: HTMLImageElement, maskImg: HTMLImageElement | null, canvasW: number, canvasH: number) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  const zoom = Math.max(1, layer.zoom || 1), zW = w * zoom, zH = h * zoom;
  const selectiveEdit = layer.filters?.targetMaskAreaOnly && layer.filters?.isCutoutMask === false && maskImg;

  if (selectiveEdit) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity; ctx.drawImage(img, -zW / 2, -zH / 2, zW, zH); ctx.restore();

    const off = document.createElement('canvas'); off.width = canvasW; off.height = canvasH;
    const offCtx = off.getContext('2d');
    if (offCtx) {
      offCtx.save(); offCtx.translate(x + w / 2, y + h / 2);
      if (layer.rotation) offCtx.rotate((layer.rotation * Math.PI) / 180);
      offCtx.filter = buildCssFilter(layer.filters); offCtx.globalAlpha = layer.opacity;
      offCtx.drawImage(img, -zW / 2, -zH / 2, zW, zH); offCtx.restore();
      offCtx.save(); offCtx.globalCompositeOperation = 'destination-in'; offCtx.drawImage(maskImg, x, y, w, h); offCtx.restore();
      ctx.drawImage(off, 0, 0);
    }
  } else {
    const off = document.createElement('canvas'); off.width = canvasW; off.height = canvasH;
    const offCtx = off.getContext('2d');
    if (offCtx) {
      offCtx.save(); offCtx.translate(x + w / 2, y + h / 2);
      if (layer.rotation) offCtx.rotate((layer.rotation * Math.PI) / 180);
      offCtx.filter = buildCssFilter(layer.filters); offCtx.globalAlpha = layer.opacity;
      offCtx.drawImage(img, -zW / 2, -zH / 2, zW, zH); offCtx.restore();
      if (maskImg) { offCtx.save(); offCtx.globalCompositeOperation = 'destination-in'; offCtx.drawImage(maskImg, x, y, w, h); offCtx.restore(); }
      ctx.drawImage(off, 0, 0);
    }
  }
  applyPostEffects(ctx, layer.filters, x, y, w, h);
}

function renderVectorShape(ctx: CanvasRenderingContext2D, layer: StudioShapeLayer, canvasW: number, canvasH: number) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  ctx.save(); ctx.globalAlpha = layer.opacity; ctx.fillStyle = layer.fillColor || '#ffffff'; ctx.strokeStyle = layer.strokeColor || '#FFCC00';
  ctx.lineWidth = layer.strokeWidth || 3;
  const t = layer.shapeType;

  if (t === 'circle') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); if (layer.strokeWidth) ctx.stroke(); }
  else if (t === 'triangle') { ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); if (layer.strokeWidth) ctx.stroke(); }
  else if (t === 'hexagon') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; const px = x + w / 2 + (w / 2) * Math.cos(a); const py = y + h / 2 + (h / 2) * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath(); ctx.fill(); if (layer.strokeWidth) ctx.stroke();
  }
  else if (t === 'callout') {
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h * 0.8, 12) : ctx.rect(x, y, w, h * 0.8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.8); ctx.lineTo(x + w * 0.35, y + h); ctx.lineTo(x + w * 0.45, y + h * 0.8); ctx.closePath(); ctx.fill();
    if (layer.strokeWidth) ctx.stroke();
  }
  else if (t === 'arrow' || t === 'arrow-double' || t === 'arrow-curved') {
    ctx.beginPath(); ctx.moveTo(x, y + h / 2);
    if (t === 'arrow-curved') ctx.quadraticCurveTo(x + w * 0.5, y, x + w - 16, y + h / 2);
    else ctx.lineTo(x + w - 16, y + h / 2);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, y + h / 2); ctx.lineTo(x + w - 18, y + h / 2 - 12); ctx.lineTo(x + w - 18, y + h / 2 + 12); ctx.closePath(); ctx.fill();
    if (t === 'arrow-double') { ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + 18, y + h / 2 - 12); ctx.lineTo(x + 18, y + h / 2 + 12); ctx.closePath(); ctx.fill(); }
  }
  else if (t === 'science-atom') {
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate((i * Math.PI) / 3); ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  }
  else if (t === 'science-wave') {
    ctx.beginPath();
    for (let i = 0; i <= w; i += 4) { const wy = y + h / 2 + (h / 3) * Math.sin((i / w) * Math.PI * 4); if (i === 0) ctx.moveTo(x + i, wy); else ctx.lineTo(x + i, wy); }
    ctx.stroke();
  }
  else {
    ctx.fillRect(x, y, w, h); if (layer.strokeWidth) ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

function renderLogoLayer(ctx: CanvasRenderingContext2D, layer: StudioLogoLayer, canvasW: number, canvasH: number, onNeedRepaint?: () => void) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  const srcUrl = layer.src || (layer.preset === 'org-logo' ? '/labdiv-logo.png' : null);
  ctx.save(); ctx.globalAlpha = layer.opacity;

  if (srcUrl) {
    const img = getImageSync(srcUrl);
    if (!img) { preloadImage(srcUrl).then(() => onNeedRepaint?.()).catch(() => {}); }
    else {
      let dW = w, dH = h;
      if (layer.preserveAspect) { const r = Math.min(w / img.naturalWidth, h / img.naturalHeight); dW = img.naturalWidth * r; dH = img.naturalHeight * r; }
      ctx.drawImage(img, x + (w - dW) / 2, y + (h - dH) / 2, dW, dH);
    }
  } else {
    ctx.fillStyle = layer.tintColor || '#FFCC00'; ctx.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(layer.preset.toUpperCase(), x + w / 2, y + h / 2);
  }
  ctx.restore();
}

export function renderSlideToCanvas(
  ctx: CanvasRenderingContext2D, slide: StudioSlide, canvasW: number, canvasH: number, tokens?: OrgBrandTokens, options?: { onNeedRepaint?: () => void }
): void {
  ctx.save(); ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = slide.backgroundGradient || slide.backgroundColor || tokens?.bgApp || '#07090e';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Modo Split-Screen 50/50 (Antes vs Depois)
  if (slide.splitScreen && slide.splitScreen !== 'none') {
    const ratio = slide.splitRatio ?? 0.5;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.06)';
    if (slide.splitScreen === 'vertical') {
      ctx.fillRect(canvasW * ratio, 0, canvasW * (1 - ratio), canvasH);
      ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(canvasW * ratio, 0); ctx.lineTo(canvasW * ratio, canvasH); ctx.stroke();
    } else {
      ctx.fillRect(0, canvasH * ratio, canvasW, canvasH * (1 - ratio));
      ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, canvasH * ratio); ctx.lineTo(canvasW, canvasH * ratio); ctx.stroke();
    }
    ctx.restore();
  }
  applyPostEffects(ctx, slide.globalFilters, 0, 0, canvasW, canvasH);

  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    ctx.save();
    if (layer.type === 'image') {
      const imgLayer = layer as StudioImageLayer; const img = getImageSync(imgLayer.src);
      const maskImg = imgLayer.maskDataUrl ? getImageSync(imgLayer.maskDataUrl) : null;
      if (!img) { preloadImage(imgLayer.src).then(() => options?.onNeedRepaint?.()).catch(() => {}); }
      else {
        if (imgLayer.maskDataUrl && !maskImg) { preloadImage(imgLayer.maskDataUrl).then(() => options?.onNeedRepaint?.()).catch(() => {}); }
        renderImageWithMask(ctx, imgLayer, img, maskImg, canvasW, canvasH);
      }
    } else if (layer.type === 'text') {
      const textLayer = layer as StudioTextLayer; ctx.globalAlpha = textLayer.opacity;
      const boxCenterX = (textLayer.x + textLayer.width / 2) * canvasW, boxTopY = textLayer.y * canvasH, maxBoxWidth = textLayer.width * canvasW;
      if (tokens) {
        renderTokenizedRichTextCanvas(ctx, {
          text: textLayer.text, mode: 'body', tokens, boxCenterX, boxTopY, maxBoxWidth, fontSize: textLayer.fontSize, align: textLayer.align, customColorOverride: textLayer.color,
        });
      } else {
        ctx.font = `${textLayer.bold ? 'bold ' : ''}${textLayer.fontSize}px ${textLayer.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = textLayer.color || '#ffffff'; ctx.textAlign = textLayer.align || 'center'; ctx.fillText(textLayer.text, boxCenterX, boxTopY + textLayer.fontSize);
      }
    } else if (layer.type === 'shape') {
      renderVectorShape(ctx, layer as StudioShapeLayer, canvasW, canvasH);
    } else if (layer.type === 'logo') {
      renderLogoLayer(ctx, layer as StudioLogoLayer, canvasW, canvasH, options?.onNeedRepaint);
    } else if (layer.type === 'math') {
      const mathLayer = layer as StudioMathLayer; ctx.globalAlpha = mathLayer.opacity;
      const mx = mathLayer.x * canvasW, my = mathLayer.y * canvasH; ctx.fillStyle = mathLayer.color || '#ffffff';
      ctx.font = `italic bold ${Math.round(mathLayer.height * canvasH * 0.55)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(mathLayer.latex || 'E = mc²', mx + (mathLayer.width * canvasW) / 2, my + (mathLayer.height * canvasH) / 2);
    }
    ctx.restore();
  }

  if (slide.showBrandBadge && tokens) {
    ctx.save(); ctx.font = `700 22px ${tokens.fontDisplay || 'sans-serif'}`; ctx.fillStyle = tokens.textMuted || 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center'; ctx.fillText(slide.brandBadgeText || tokens.badgeTag || '', canvasW / 2, canvasH - 52); ctx.restore();
  }
  ctx.restore();
}
