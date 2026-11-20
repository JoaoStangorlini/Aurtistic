// Este programa é um software livre (Licença AGPLv3)
import type {
  StudioSlide, StudioImageLayer, StudioTextLayer, StudioShapeLayer,
  StudioLogoLayer, StudioMathLayer, StudioLayerFilterConfig, StudioMaskPresetConfig, StudioDrawingLayer
} from '@/components/organizacoes/studio/types';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';
import { renderLatexFormula } from '@/lib/studio/latex-canvas-renderer';
import { renderDrawingLayer } from '@/lib/studio/drawing-renderer';
import {
  buildCompositeLut,
  applyCompositeLutToContext,
  getReusableCanvas,
  getCachedLayerCanvas,
  setCachedLayerCanvas,
} from './lut-processor';

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
  const expFactor = 1 + (filters.exposure ?? 0) / 150 + (filters.luminance ?? 0) / 200;
  const b = (filters.brightness ?? 100) * Math.max(0.2, expFactor);
  if (Math.round(b) !== 100) p.push(`brightness(${Math.round(b)}%)`);
  if (filters.contrast !== 100) p.push(`contrast(${filters.contrast}%)`);
  const satMult = 1 + (filters.vibrance ?? 0) / 150;
  const s = filters.bwDesaturate ? 0 : (filters.saturation ?? 100) * Math.max(0, satMult);
  if (Math.round(s) !== 100) p.push(`saturate(${Math.round(s)}%)`);
  if (filters.blur > 0) p.push(`blur(${filters.blur}px)`);
  if (filters.grayscale > 0) p.push(`grayscale(${filters.grayscale}%)`);
  if (filters.sepia > 0) p.push(`sepia(${filters.sepia}%)`);
  if (filters.hueTint && filters.hueTintIntensity && filters.hueTintIntensity > 0) {
    p.push(`hue-rotate(${Math.round((filters.hueTint * filters.hueTintIntensity) / 100)}deg)`);
  }

  // Submenu 13: Presets de Filtros Artísticos
  const preset = filters.artisticFilter;
  if (preset && preset !== 'original') {
    if (preset === 'labdiv-clean') p.push('contrast(108%) saturate(112%)');
    else if (preset === 'quantum-cyan') p.push('contrast(115%) saturate(125%) hue-rotate(175deg)');
    else if (preset === 'tri-x-mono') p.push('grayscale(100%) contrast(135%)');
    else if (preset === 'sepia-vintage') p.push('sepia(75%) contrast(105%) brightness(96%)');
    else if (preset === 'matrix-hs') p.push('contrast(125%) saturate(140%) hue-rotate(85deg)');
    else if (preset === 'nature-editorial') p.push('saturate(118%) contrast(106%) brightness(103%)');
    else if (preset === 'dark-moody') p.push('brightness(85%) contrast(125%) saturate(80%)');
  }

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
  if (f.tint && f.tint !== 0) {
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = f.tint > 0 ? `rgba(236,72,153,${f.tint / 220})` : `rgba(34,197,94,${-f.tint / 220})`;
    ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (f.vignette && f.vignette > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.max(w, h) * 0.1, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, `rgba(0,0,0,${f.vignette / 100})`);
    ctx.fillStyle = grad; ctx.fillRect(x, y, w, h); ctx.restore();
  }
}

function renderImageWithMask(
  ctx: CanvasRenderingContext2D,
  layer: StudioImageLayer,
  img: HTMLImageElement,
  maskImg: HTMLImageElement | null,
  canvasW: number,
  canvasH: number,
  interactive = false
) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  const zoom = Math.max(1, layer.zoom || 1);
  let sx = (layer.cropX || 0) * img.naturalWidth;
  let sy = (layer.cropY || 0) * img.naturalHeight;
  let sw = Math.max(1, (layer.cropWidth || 1) * img.naturalWidth);
  let sh = Math.max(1, (layer.cropHeight || 1) * img.naturalHeight);
  let drawW = w * zoom;
  let drawH = h * zoom;

  const fitMode = layer.aspectFit || 'cover';
  if (fitMode !== 'custom' && sw > 0 && sh > 0 && w > 0 && h > 0) {
    const boxRatio = w / h;
    const srcRatio = sw / sh;
    if (fitMode === 'cover') {
      if (srcRatio > boxRatio) {
        const nextSw = sh * boxRatio;
        const maxShift = (sw - nextSw) / 2;
        sx += maxShift + (layer.offsetX || 0) * maxShift;
        sw = nextSw;
      } else if (srcRatio < boxRatio) {
        const nextSh = sw / boxRatio;
        const maxShift = (sh - nextSh) / 2;
        sy += maxShift + (layer.offsetY || 0) * maxShift;
        sh = nextSh;
      }
    } else if (fitMode === 'contain') {
      if (srcRatio > boxRatio) {
        drawH = drawW / srcRatio;
      } else {
        drawW = drawH * srcRatio;
      }
    }
  }
  const zW = drawW;
  const zH = drawH;
  const f = layer.filters;
  const selectiveEdit = f?.targetMaskAreaOnly && f?.isCutoutMask === false && maskImg;

  // Escala reduzida (0.35x) no pointermove contínuo para manter 60 FPS
  const scale = interactive ? 0.35 : 1;
  const bufW = Math.max(1, Math.round(canvasW * scale));
  const bufH = Math.max(1, Math.round(canvasH * scale));

  const applyGeom = (targetCtx: CanvasRenderingContext2D, s = 1) => {
    targetCtx.translate((x + w / 2) * s, (y + h / 2) * s);
    if (layer.rotation) targetCtx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.flipH || layer.flipV) targetCtx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
    if (layer.skewX || layer.skewY) {
      targetCtx.transform(
        1,
        Math.tan(((layer.skewY || 0) * Math.PI) / 180),
        Math.tan(((layer.skewX || 0) * Math.PI) / 180),
        1,
        0,
        0
      );
    }
  };

  // Passo 1: Se edição seletiva via máscara, desenha base nítida antes (respeitando maskPreset se ativo)
  if (selectiveEdit) {
    if (layer.maskPreset && layer.maskPreset.shape !== 'none') {
      const { canvas: baseOff, ctx: baseCtx } = getReusableCanvas('blur', bufW, bufH);
      if (baseCtx) {
        baseCtx.save();
        applyGeom(baseCtx, scale);
        baseCtx.globalAlpha = layer.opacity;
        baseCtx.drawImage(img, sx, sy, sw, sh, (-zW * scale) / 2, (-zH * scale) / 2, zW * scale, zH * scale);
        baseCtx.restore();
        applyMaskPresetToContext(baseCtx, layer.maskPreset, x * scale, y * scale, w * scale, h * scale, bufW, bufH, scale);
        ctx.drawImage(baseOff, 0, 0, canvasW, canvasH);
      }
    } else {
      ctx.save();
      applyGeom(ctx, 1);
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(img, sx, sy, sw, sh, -zW / 2, -zH / 2, zW, zH);
      ctx.restore();
    }
  }

  // Dirty Flag / Cache por camada: se assinatura não mudou, reaproveita buffer sem recalcular LUT/blur
  const sig = JSON.stringify([
    img.src, sx, sy, sw, sh, x, y, w, h, zW, zH, zoom, layer.aspectFit || 'cover',
    layer.rotation, layer.flipH, layer.flipV, layer.skewX, layer.skewY,
    layer.opacity, scale, layer.maskDataUrl || '', layer.maskPreset || null, f || null,
  ]);
  const cachedCanvas = getCachedLayerCanvas(layer.id, sig);
  const filterAlpha = (f?.filterOpacity ?? 100) / 100;

  if (cachedCanvas) {
    if (filterAlpha < 1) {
      ctx.save();
      applyGeom(ctx, 1);
      ctx.globalAlpha = layer.opacity * (1 - filterAlpha);
      ctx.drawImage(img, sx, sy, sw, sh, -zW / 2, -zH / 2, zW, zH);
      ctx.restore();
    }
    ctx.save();
    if (f?.blendMode && f.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = f.blendMode;
    }
    ctx.globalAlpha = filterAlpha;
    ctx.drawImage(cachedCanvas, 0, 0, canvasW, canvasH);
    ctx.restore();
    return;
  }

  // Passo 2 (Multi-Pass Isolado com Pool Reaproveitável): Processa imagem + Bokeh + LUT única
  const { canvas: off, ctx: offCtx } = getReusableCanvas('blur', bufW, bufH);
  if (offCtx) {
    const bokehActive = Boolean(f?.bokehEnabled && (f?.bokehRadius ?? 0) > 0);
    const bokehRadius = (f?.bokehRadius ?? 0) * scale;

    offCtx.save();
    applyGeom(offCtx, scale);
    const baseFilterConfig = bokehActive && f
      ? { ...f, blur: (f.blur || 0) * scale + bokehRadius }
      : f ? { ...f, blur: (f.blur || 0) * scale } : undefined;
    offCtx.filter = buildCssFilter(baseFilterConfig);
    offCtx.globalAlpha = layer.opacity;
    offCtx.drawImage(img, sx, sy, sw, sh, (-zW * scale) / 2, (-zH * scale) / 2, zW * scale, zH * scale);
    offCtx.restore();

    if (bokehActive && f) {
      const { canvas: sharpOff, ctx: sharpCtx } = getReusableCanvas('sharp', bufW, bufH);
      if (sharpCtx) {
        sharpCtx.save();
        applyGeom(sharpCtx, scale);
        sharpCtx.filter = buildCssFilter(f ? { ...f, blur: (f.blur || 0) * scale } : undefined);
        sharpCtx.globalAlpha = layer.opacity;
        sharpCtx.drawImage(img, sx, sy, sw, sh, (-zW * scale) / 2, (-zH * scale) / 2, zW * scale, zH * scale);
        sharpCtx.restore();

        const focalX = (x + (f.bokehFocalX ?? 0.5) * w) * scale;
        const focalY = (y + (f.bokehFocalY ?? 0.5) * h) * scale;
        const featherPx = Math.max(12, (f.bokehFeather ?? 60) * (Math.max(w, h) / 400)) * scale;

        sharpCtx.save();
        sharpCtx.globalCompositeOperation = 'destination-in';
        if (f.bokehShape === 'linear') {
          const halfSpan = Math.max(w, h) * 0.16 * scale + featherPx;
          const linGrad = sharpCtx.createLinearGradient(focalX, focalY - halfSpan, focalX, focalY + halfSpan);
          linGrad.addColorStop(0, 'rgba(0,0,0,0)');
          linGrad.addColorStop(0.35, 'rgba(0,0,0,1)');
          linGrad.addColorStop(0.65, 'rgba(0,0,0,1)');
          linGrad.addColorStop(1, 'rgba(0,0,0,0)');
          sharpCtx.fillStyle = linGrad;
        } else {
          const rInner = Math.max(w, h) * 0.14 * scale;
          const rOuter = rInner + featherPx * 1.8;
          const radGrad = sharpCtx.createRadialGradient(focalX, focalY, rInner, focalX, focalY, rOuter);
          radGrad.addColorStop(0, 'rgba(0,0,0,1)');
          radGrad.addColorStop(1, 'rgba(0,0,0,0)');
          sharpCtx.fillStyle = radGrad;
        }
        sharpCtx.fillRect(0, 0, bufW, bufH);
        sharpCtx.restore();

        offCtx.drawImage(sharpOff, 0, 0);
      }
    }

    // LUT única composta (Uint8Array(256) por canal) aplicada em O(1) por pixel
    const lut = buildCompositeLut(f);
    applyCompositeLutToContext(offCtx, bufW, bufH, lut);

    // Efeitos pós-processamento confinados ao buffer offscreen da camada
    applyPostEffects(offCtx, f, x * scale, y * scale, w * scale, h * scale);

    // Passo 2 do pipeline: maskPreset (formas ou gradientes + feather + inversão)
    if (layer.maskPreset && layer.maskPreset.shape !== 'none') {
      applyMaskPresetToContext(offCtx, layer.maskPreset, x * scale, y * scale, w * scale, h * scale, bufW, bufH, scale);
    }

    // Passo 3 do pipeline: maskDataUrl (combinável com maskPreset)
    if (maskImg) {
      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.drawImage(maskImg, x * scale, y * scale, w * scale, h * scale);
      offCtx.restore();
    }

    // Armazena resultado no cache por camada (Dirty Flag)
    setCachedLayerCanvas(layer.id, sig, off);

    if (filterAlpha < 1) {
      ctx.save();
      applyGeom(ctx, 1);
      ctx.globalAlpha = layer.opacity * (1 - filterAlpha);
      ctx.drawImage(img, sx, sy, sw, sh, -zW / 2, -zH / 2, zW, zH);
      ctx.restore();
    }

    ctx.save();
    if (f?.blendMode && f.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = f.blendMode;
    }
    ctx.globalAlpha = filterAlpha;
    ctx.drawImage(off, 0, 0, canvasW, canvasH);
    ctx.restore();
  }
}

function applyMaskPresetToContext(
  targetCtx: CanvasRenderingContext2D,
  preset: StudioMaskPresetConfig,
  x: number,
  y: number,
  w: number,
  h: number,
  bufW: number,
  bufH: number,
  scale: number
) {
  const { canvas: maskBuf, ctx: mCtx } = getReusableCanvas('sharp', bufW, bufH);
  if (!mCtx) return;

  mCtx.save();
  mCtx.clearRect(0, 0, bufW, bufH);
  const featherPx = Math.max(0, (preset.feather || 0) * scale);
  mCtx.filter = featherPx > 0 ? `blur(${featherPx}px)` : 'none';
  mCtx.fillStyle = '#ffffff';

  const cx = x + w / 2;
  const cy = y + h / 2;

  if (preset.shape === 'linear-fade') {
    const rad = (((preset.angle ?? 180) - 90) * Math.PI) / 180;
    const halfLen = Math.max(w, h) * 0.5;
    const posRatio = Math.max(0.1, Math.min(0.9, (preset.position ?? 50) / 100));
    const gx0 = cx - Math.cos(rad) * halfLen;
    const gy0 = cy - Math.sin(rad) * halfLen;
    const gx1 = cx + Math.cos(rad) * halfLen;
    const gy1 = cy + Math.sin(rad) * halfLen;
    const grad = mCtx.createLinearGradient(gx0, gy0, gx1, gy1);
    const soft = Math.max(0.05, Math.min(0.45, featherPx / Math.max(100, halfLen * 2) + 0.12));
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(Math.max(0.01, posRatio - soft), 'rgba(255,255,255,1)');
    grad.addColorStop(Math.min(0.99, posRatio + soft), 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    mCtx.filter = 'none';
    mCtx.fillStyle = grad;
    mCtx.fillRect(x, y, w, h);
  } else if (preset.shape === 'radial-fade') {
    const posRatio = Math.max(0.15, Math.min(0.95, (preset.position ?? 55) / 100));
    const maxR = Math.min(w, h) * 0.5;
    const rInner = maxR * posRatio * 0.65;
    const rOuter = Math.max(rInner + 4, maxR * (posRatio + 0.25));
    const grad = mCtx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    mCtx.filter = 'none';
    mCtx.fillStyle = grad;
    mCtx.fillRect(x, y, w, h);
  } else {
    mCtx.beginPath();
    if (preset.shape === 'circle') {
      const r = Math.min(w, h) / 2;
      mCtx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (preset.shape === 'oval') {
      mCtx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (preset.shape === 'rounded') {
      const rad = Math.min(w, h) * 0.16;
      if (mCtx.roundRect) mCtx.roundRect(x, y, w, h, rad);
      else mCtx.rect(x, y, w, h);
    } else if (preset.shape === 'hexagon') {
      const r = Math.min(w, h) / 2;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 2;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i === 0) mCtx.moveTo(px, py);
        else mCtx.lineTo(px, py);
      }
      mCtx.closePath();
    } else if (preset.shape === 'star') {
      const outer = Math.min(w, h) / 2;
      const inner = outer * 0.45;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i === 0) mCtx.moveTo(px, py);
        else mCtx.lineTo(px, py);
      }
      mCtx.closePath();
    } else if (preset.shape === 'arch') {
      const r = w / 2;
      mCtx.moveTo(x, y + h);
      mCtx.lineTo(x, y + r);
      mCtx.arc(cx, y + r, r, Math.PI, 0, false);
      mCtx.lineTo(x + w, y + h);
      mCtx.closePath();
    }
    mCtx.fill();
  }
  mCtx.restore();

  targetCtx.save();
  targetCtx.globalCompositeOperation = preset.invert ? 'destination-out' : 'destination-in';
  targetCtx.drawImage(maskBuf, 0, 0);
  targetCtx.restore();
}

function buildShapePath(ctx: CanvasRenderingContext2D, layer: StudioShapeLayer, x: number, y: number, w: number, h: number) {
  const t = layer.shapeType;
  ctx.beginPath();
  if (t === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (t === 'triangle') {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  } else if (t === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = x + w / 2 + (w / 2) * Math.cos(a);
      const py = y + h / 2 + (h / 2) * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (t === 'callout') {
    if (ctx.roundRect) ctx.roundRect(x, y, w, h * 0.8, 12);
    else ctx.rect(x, y, w, h * 0.8);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function renderVectorShape(ctx: CanvasRenderingContext2D, layer: StudioShapeLayer, canvasW: number, canvasH: number, onNeedRepaint?: () => void) {
  const x = layer.x * canvasW, y = layer.y * canvasH, w = layer.width * canvasW, h = layer.height * canvasH;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  ctx.fillStyle = layer.fillColor || '#ffffff';
  ctx.strokeStyle = layer.strokeColor || '#FFCC00';
  ctx.lineWidth = layer.strokeWidth ?? 0;
  const t = layer.shapeType;

  if (t === 'arrow' || t === 'arrow-double' || t === 'arrow-curved') {
    ctx.lineWidth = layer.strokeWidth || 4;
    ctx.beginPath(); ctx.moveTo(x, y + h / 2);
    if (t === 'arrow-curved') ctx.quadraticCurveTo(x + w * 0.5, y, x + w - 16, y + h / 2);
    else ctx.lineTo(x + w - 16, y + h / 2);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, y + h / 2); ctx.lineTo(x + w - 18, y + h / 2 - 12); ctx.lineTo(x + w - 18, y + h / 2 + 12); ctx.closePath(); ctx.fill();
    if (t === 'arrow-double') { ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + 18, y + h / 2 - 12); ctx.lineTo(x + 18, y + h / 2 + 12); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    return;
  }

  if (t === 'science-wave') {
    ctx.lineWidth = layer.strokeWidth || 4;
    ctx.beginPath();
    for (let i = 0; i <= w; i += 4) { const wy = y + h / 2 + (h / 3) * Math.sin((i / w) * Math.PI * 4); if (i === 0) ctx.moveTo(x + i, wy); else ctx.lineTo(x + i, wy); }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Guardrail 6: Se houver frameClip, desenha foto dentro de ctx.save()->ctx.clip()->drawImage->ctx.restore()
  // e desenha o contorno (strokeWidth 0..40px) APÓS ctx.restore() para não cortar metade da borda!
  if (layer.frameClip?.src) {
    const clipSrc = layer.frameClip.resolvedUrl || layer.frameClip.src;
    const clipImg = getImageSync(clipSrc);
    if (!clipImg) {
      preloadImage(clipSrc).then(() => onNeedRepaint?.()).catch(() => {});
    }

    ctx.save();
    if (t === 'science-atom') {
      // Para o átomo com frameClip, recorta pelo círculo orbital central
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
    } else {
      buildShapePath(ctx, layer, x, y, w, h);
    }
    ctx.clip();
    if (clipImg) {
      const z = Math.max(1, layer.frameClip.zoom || 1);
      const dw = w * z;
      const dh = h * z;
      const dx = x + (w - dw) / 2 + (layer.frameClip.panX || 0) * w;
      const dy = y + (h - dh) / 2 + (layer.frameClip.panY || 0) * h;
      ctx.drawImage(clipImg, dx, dy, dw, dh);
    }
    ctx.restore();
  } else if (t !== 'science-atom') {
    buildShapePath(ctx, layer, x, y, w, h);
    ctx.fill();
  }

  // Desenho do contorno limpo após ctx.restore()
  if (t === 'science-atom') {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.lineWidth = layer.strokeWidth || 4;
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate((i * Math.PI) / 3); ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  } else if (layer.strokeWidth && layer.strokeWidth > 0) {
    buildShapePath(ctx, layer, x, y, w, h);
    ctx.stroke();
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

export function composePhotoFilters(
  globalF?: StudioLayerFilterConfig,
  layerF?: StudioLayerFilterConfig
): StudioLayerFilterConfig | undefined {
  if (!globalF && !layerF) return undefined;
  if (!globalF) return layerF;
  if (!layerF) return globalF;

  const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    ...globalF,
    ...layerF,
    brightness: clampNum(Math.round(((globalF.brightness ?? 100) / 100) * ((layerF.brightness ?? 100) / 100) * 100), 10, 300),
    contrast: clampNum(Math.round(((globalF.contrast ?? 100) / 100) * ((layerF.contrast ?? 100) / 100) * 100), 10, 300),
    saturation: clampNum(Math.round(((globalF.saturation ?? 100) / 100) * ((layerF.saturation ?? 100) / 100) * 100), 0, 300),
    blur: clampNum((globalF.blur ?? 0) + (layerF.blur ?? 0), 0, 50),
    grayscale: clampNum((globalF.grayscale ?? 0) + (layerF.grayscale ?? 0), 0, 100),
    sepia: clampNum((globalF.sepia ?? 0) + (layerF.sepia ?? 0), 0, 100),
    overlayDark: clampNum((globalF.overlayDark ?? 0) + (layerF.overlayDark ?? 0), 0, 85),
    temperature: clampNum((globalF.temperature ?? 0) + (layerF.temperature ?? 0), -50, 50),
    vignette: clampNum((globalF.vignette ?? 0) + (layerF.vignette ?? 0), 0, 100),
    exposure: clampNum((globalF.exposure ?? 0) + (layerF.exposure ?? 0), -100, 100),
    luminance: clampNum((globalF.luminance ?? 0) + (layerF.luminance ?? 0), -100, 100),
    highlights: clampNum((globalF.highlights ?? 0) + (layerF.highlights ?? 0), -100, 100),
    shadows: clampNum((globalF.shadows ?? 0) + (layerF.shadows ?? 0), -100, 100),
    whitePoint: clampNum((globalF.whitePoint ?? 0) + (layerF.whitePoint ?? 0), -50, 50),
    blackPoint: clampNum((globalF.blackPoint ?? 0) + (layerF.blackPoint ?? 0), -50, 50),
    tint: clampNum((globalF.tint ?? 0) + (layerF.tint ?? 0), -50, 50),
    vibrance: clampNum((globalF.vibrance ?? 0) + (layerF.vibrance ?? 0), -100, 100),
    clarity: clampNum((globalF.clarity ?? 0) + (layerF.clarity ?? 0), 0, 100),
    grain: clampNum((globalF.grain ?? 0) + (layerF.grain ?? 0), 0, 100),
    bwDesaturate: Boolean(layerF.bwDesaturate || globalF.bwDesaturate),
    artisticFilter:
      layerF.artisticFilter && layerF.artisticFilter !== 'original'
        ? layerF.artisticFilter
        : globalF.artisticFilter,
    blendMode:
      layerF.blendMode && layerF.blendMode !== 'source-over'
        ? layerF.blendMode
        : globalF.blendMode,
    filterOpacity: layerF.filterOpacity ?? globalF.filterOpacity ?? 100,
    curves: layerF.curves || globalF.curves,
  };
}

export function renderSlideToCanvas(
  ctx: CanvasRenderingContext2D,
  slide: StudioSlide,
  canvasW: number,
  canvasH: number,
  tokens?: OrgBrandTokens,
  options?: {
    onNeedRepaint?: () => void;
    interactive?: boolean;
    editingTextLayerId?: string | null;
    bypassPhotoFilters?: boolean;
    onTextHeightOverflow?: (layerId: string, requiredNormHeight: number) => void;
  }
): void {
  ctx.save(); ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = slide.backgroundGradient || slide.backgroundColor || tokens?.bgApp || '#07090e';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const hiddenFolderIds = new Set(
    (slide.folders || []).filter((f) => !f.visible).map((f) => f.id)
  );
  const hasVisibleImageLayer = slide.layers.some(
    (l) => l.type === 'image' && l.visible && !(l.folderId && hiddenFolderIds.has(l.folderId))
  );

  // Aplica efeitos pós-processamento globais no fundo somente quando não houver foto visível (evita aplicação dupla)
  if (!options?.bypassPhotoFilters && !hasVisibleImageLayer) {
    applyPostEffects(ctx, slide.globalFilters, 0, 0, canvasW, canvasH);
  }

  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    if (layer.folderId && hiddenFolderIds.has(layer.folderId)) continue;
    if (options?.editingTextLayerId && layer.id === options.editingTextLayerId) continue;
    ctx.save();
    if (layer.type === 'image') {
      const imgLayer = layer as StudioImageLayer;
      const effectiveSrc = imgLayer.resolvedUrl || imgLayer.src;
      const img =
        getImageSync(effectiveSrc) ||
        (imgLayer.src && imgLayer.src !== effectiveSrc ? getImageSync(imgLayer.src) : null) ||
        (imgLayer.fallbackUrl ? getImageSync(imgLayer.fallbackUrl) : null);
      const maskImg = imgLayer.maskDataUrl ? getImageSync(imgLayer.maskDataUrl) : null;
      if (!img) {
        preloadImage(effectiveSrc)
          .then(() => options?.onNeedRepaint?.())
          .catch(() => {
            if (imgLayer.src && imgLayer.src !== effectiveSrc) {
              return preloadImage(imgLayer.src)
                .then(() => options?.onNeedRepaint?.())
                .catch(() => {
                  if (imgLayer.fallbackUrl) {
                    return preloadImage(imgLayer.fallbackUrl).then(() => options?.onNeedRepaint?.()).catch(() => {});
                  }
                });
            }
            if (imgLayer.fallbackUrl) {
              return preloadImage(imgLayer.fallbackUrl).then(() => options?.onNeedRepaint?.()).catch(() => {});
            }
          });
      } else {
        if (imgLayer.maskDataUrl && !maskImg) { preloadImage(imgLayer.maskDataUrl).then(() => options?.onNeedRepaint?.()).catch(() => {}); }
        const effectiveImgLayer = options?.bypassPhotoFilters
          ? { ...imgLayer, filters: undefined }
          : { ...imgLayer, filters: composePhotoFilters(slide.globalFilters, imgLayer.filters) };
        renderImageWithMask(ctx, effectiveImgLayer, img, maskImg, canvasW, canvasH, options?.interactive);
      }
    } else if (layer.type === 'text') {
      const textLayer = layer as StudioTextLayer; ctx.globalAlpha = textLayer.opacity;
      const maxBoxWidth = textLayer.width * canvasW;
      const boxH = textLayer.height * canvasH;
      const cx = (textLayer.x + textLayer.width / 2) * canvasW;
      const cy = (textLayer.y + textLayer.height / 2) * canvasH;

      // Pivô único de rotação idêntico ao palco e editor inline: centro da caixa [x + w/2, y + h/2]
      ctx.translate(cx, cy);
      if (textLayer.rotation) ctx.rotate((textLayer.rotation * Math.PI) / 180);
      if (textLayer.flipH || textLayer.flipV) ctx.scale(textLayer.flipH ? -1 : 1, textLayer.flipV ? -1 : 1);

      const localX = -maxBoxWidth / 2;
      const localTopY = -boxH / 2;

      // Tarja Pill de Fundo (Submenu 20)
      if (textLayer.pillBgOpacity && textLayer.pillBgOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = (textLayer.opacity ?? 1) * (textLayer.pillBgOpacity / 100);
        ctx.fillStyle = textLayer.pillBgColor || '#1F9FCF';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(localX - 12, localTopY - 8, maxBoxWidth + 24, boxH + 16, 18);
        else ctx.rect(localX - 12, localTopY - 8, maxBoxWidth + 24, boxH + 16);
        ctx.fill();
        ctx.restore();
      }

      if (textLayer.shadowBlur && textLayer.shadowBlur > 0) {
        ctx.shadowColor = textLayer.shadowColor || 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = textLayer.shadowBlur;
        ctx.shadowOffsetX = textLayer.shadowOffsetX ?? 0;
        ctx.shadowOffsetY = textLayer.shadowOffsetY ?? 2;
      }

      let processed = (textLayer.text || '')
        .replace(/\{TITULO\}/g, slide.title || '')
        .replace(/\{ORG\}/g, tokens?.displayName || tokens?.badgeTag || '');
      if (textLayer.uppercase) processed = processed.toUpperCase();
      processed = processed.replace(/\{([A-Z0-9_]+)\}/g, '[y:{$1}]');

      if (tokens) {
        const { totalHeight } = renderTokenizedRichTextCanvas(ctx, {
          text: processed, mode: textLayer.textKind === 'title' ? 'title' : 'body',
          tokens, boxCenterX: 0, boxTopY: localTopY, maxBoxWidth, boxHeight: boxH, fontSize: textLayer.fontSize,
          align: textLayer.align, customColorOverride: textLayer.color,
          lineHeightMultiplier: textLayer.lineHeight || 1.24,
        });
        if (options?.onTextHeightOverflow && totalHeight > boxH + 6) {
          const requiredNormHeight = Math.min(0.95, Number(((totalHeight + 12) / canvasH).toFixed(3)));
          if (requiredNormHeight > textLayer.height + 0.012) {
            options.onTextHeightOverflow(textLayer.id, requiredNormHeight);
          }
        }
      } else {
        ctx.font = `${textLayer.italic ? 'italic ' : ''}${textLayer.bold ? 'bold ' : ''}${textLayer.fontSize}px ${textLayer.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = textLayer.color || '#ffffff'; ctx.textAlign = textLayer.align || 'center'; ctx.fillText(processed, 0, localTopY + textLayer.fontSize);
      }
    } else if (layer.type === 'shape') {
      renderVectorShape(ctx, layer as StudioShapeLayer, canvasW, canvasH, options?.onNeedRepaint);
    } else if (layer.type === 'logo') {
      renderLogoLayer(ctx, layer as StudioLogoLayer, canvasW, canvasH, options?.onNeedRepaint);
    } else if (layer.type === 'drawing') {
      renderDrawingLayer(ctx, layer as StudioDrawingLayer, canvasW, canvasH);
    } else if (layer.type === 'math') {
      const mathLayer = layer as StudioMathLayer;
      ctx.globalAlpha = mathLayer.opacity;
      const mw = mathLayer.width * canvasW;
      const mh = mathLayer.height * canvasH;
      const cx = (mathLayer.x + mathLayer.width / 2) * canvasW;
      const cy = (mathLayer.y + mathLayer.height / 2) * canvasH;
      ctx.translate(cx, cy);
      if (mathLayer.rotation) ctx.rotate((mathLayer.rotation * Math.PI) / 180);
      renderLatexFormula(
        ctx,
        mathLayer.latex || 'E = mc^2',
        0,
        mh * 0.15,
        Math.max(16, Math.round(mh * 0.48)),
        mathLayer.color || '#ffffff',
        'center'
      );
    }
    ctx.restore();
  }

  if (slide.showBrandBadge && tokens) {
    ctx.save(); ctx.font = `700 22px ${tokens.fontDisplay || 'sans-serif'}`; ctx.fillStyle = tokens.textMuted || 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center'; ctx.fillText(slide.brandBadgeText || tokens.badgeTag || '', canvasW / 2, canvasH - 52); ctx.restore();
  }
  ctx.restore();
}
