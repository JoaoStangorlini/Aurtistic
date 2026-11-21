// Este programa é um software livre (Licença AGPLv3)
import { zipSync } from 'fflate';
import type { StudioSlide, AspectRatioKey } from '@/components/organizacoes/studio/types';
import { ASPECT_DIMENSIONS } from '@/components/organizacoes/studio/types';
import { renderSlideToCanvas, preloadSlideAssets } from './canvas-renderer';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';

export type StudioExportFormat = 'png' | 'webp' | 'jpeg';

function formatToMime(format: StudioExportFormat): string {
  if (format === 'webp') return 'image/webp';
  if (format === 'jpeg') return 'image/jpeg';
  return 'image/png';
}

function formatToExt(format: StudioExportFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

async function ensureFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignora erro de fonte externa e segue exportação
    }
  }
}

function renderSlideIntoOffscreen(
  off: HTMLCanvasElement,
  slide: StudioSlide,
  aspectRatio: AspectRatioKey,
  scale: number,
  format: StudioExportFormat,
  tokens?: OrgBrandTokens
): boolean {
  const dims = ASPECT_DIMENSIONS[aspectRatio];
  off.width = dims.width * scale;
  off.height = dims.height * scale;
  const ctx = off.getContext('2d');
  if (!ctx) return false;

  ctx.clearRect(0, 0, off.width, off.height);
  if (format === 'jpeg') {
    ctx.fillStyle = slide.backgroundColor || '#0A0D14';
    ctx.fillRect(0, 0, off.width, off.height);
  }

  ctx.save();
  if (scale !== 1) ctx.scale(scale, scale);
  renderSlideToCanvas(ctx, slide, dims.width, dims.height, tokens);
  ctx.restore();
  return true;
}

export async function exportSlideToBlob(
  slide: StudioSlide,
  aspectRatio: AspectRatioKey,
  options: {
    format?: StudioExportFormat;
    quality?: number;
    scale?: number;
    tokens?: OrgBrandTokens;
    reusableCanvas?: HTMLCanvasElement;
  } = {}
): Promise<Blob | null> {
  await ensureFontsReady();
  await preloadSlideAssets(slide);
  const format = options.format ?? 'png';
  const scale = options.scale ?? 1;
  const quality = Math.max(0.6, Math.min(1, options.quality ?? 0.92));
  const off = options.reusableCanvas ?? document.createElement('canvas');

  const ok = renderSlideIntoOffscreen(off, slide, aspectRatio, scale, format, options.tokens);
  if (!ok) return null;

  const mime = formatToMime(format);
  return new Promise<Blob | null>((resolve) => {
    off.toBlob(
      (blob) => resolve(blob),
      mime,
      format === 'png' ? undefined : quality
    );
  });
}

export async function exportSingleSlideDownload(
  slide: StudioSlide,
  slideIndex: number,
  aspectRatio: AspectRatioKey,
  options: {
    orgSlug: string;
    format: StudioExportFormat;
    quality: number;
    scale: 1 | 2;
    tokens?: OrgBrandTokens;
  }
): Promise<void> {
  const blob = await exportSlideToBlob(slide, aspectRatio, options);
  if (!blob) {
    throw new Error('Não foi possível renderizar o slide (verifique CORS das imagens ou reduza a escala para 1x).');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ext = formatToExt(options.format);
  a.href = url;
  a.download = `${options.orgSlug}-slide-${String(slideIndex + 1).padStart(2, '0')}-${options.scale}x.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export async function exportCarouselToZip(
  slides: StudioSlide[],
  aspectRatio: AspectRatioKey,
  options: {
    orgSlug: string;
    format: StudioExportFormat;
    quality: number;
    scale: 1 | 2;
    tokens?: OrgBrandTokens;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<void> {
  await ensureFontsReady();
  const reusableCanvas = document.createElement('canvas');
  const files: Record<string, Uint8Array> = {};
  const ext = formatToExt(options.format);

  for (let i = 0; i < slides.length; i++) {
    options.onProgress?.(i + 1, slides.length);
    await new Promise((r) => setTimeout(r, 0));

    const blob = await exportSlideToBlob(slides[i], aspectRatio, {
      format: options.format,
      quality: options.quality,
      scale: options.scale,
      tokens: options.tokens,
      reusableCanvas,
    });
    if (!blob) {
      reusableCanvas.width = 0;
      reusableCanvas.height = 0;
      throw new Error(`Falha ao gerar o slide ${i + 1} (verifique CORS ou tente resolução 1x).`);
    }

    const buf = await blob.arrayBuffer();
    const filename = `${options.orgSlug}-slide-${String(i + 1).padStart(2, '0')}.${ext}`;
    files[filename] = new Uint8Array(buf);
  }

  reusableCanvas.width = 0;
  reusableCanvas.height = 0;

  const zipped = zipSync(files, { level: 6 });
  const zipBuffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
  const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.orgSlug}-carrossel-${options.scale}x.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function exportSlideToPngDataUrl(
  slide: StudioSlide,
  aspectRatio: AspectRatioKey,
  scale = 1,
  tokens?: OrgBrandTokens
): string {
  const off = document.createElement('canvas');
  const ok = renderSlideIntoOffscreen(off, slide, aspectRatio, scale, 'png', tokens);
  if (!ok) return '';
  return off.toDataURL('image/png', 0.95);
}

export async function exportCarouselToPdf(
  slides: StudioSlide[],
  aspectRatio: AspectRatioKey,
  tokens?: OrgBrandTokens
): Promise<void> {
  await ensureFontsReady();
  const { jsPDF } = await import('jspdf');
  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const mmW = 210;
  const mmH = Math.round((dims.height / dims.width) * mmW);
  const orientation = mmW >= mmH ? 'l' : 'p';
  const doc = new jsPDF({ orientation, unit: 'mm', format: [mmW, mmH] });
  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage([mmW, mmH], orientation);
    const dataUrl = exportSlideToPngDataUrl(slides[i], aspectRatio, 2, tokens);
    doc.addImage(dataUrl, 'PNG', 0, 0, mmW, mmH, undefined, 'FAST');
  }
  doc.save(`carrossel-studio-${Date.now()}.pdf`);
}

export function generatePostCaptionAndAlt(
  slides: StudioSlide[],
  orgSlug: string,
  tokens: OrgBrandTokens
): { caption: string; altText: string } {
  const firstSlide = slides[0];
  const textLayers = firstSlide?.layers.filter((l) => l.type === 'text') || [];
  const mainTitle = textLayers[0] && 'text' in textLayers[0] ? (textLayers[0] as any).text : tokens.defaultPostTitle;
  const caption = `${mainTitle}\n\n` +
    `Post oficial da equipe ${tokens.displayName}.\n\n` +
    `Acompanhe as nossas novidades, atividades científicas e divulgações acadêmicas.\n\n` +
    `#${orgSlug} #LabDiv #IFUSP #Física #Ciência #UniversidadeDeSãoPaulo`;
  const altText = `Imagem informativa da organização ${tokens.displayName} com o título: "${mainTitle}". ` +
    `Contém ${slides.length} tela(s) de carrossel na paleta oficial (${tokens.badgeTag}).`;
  return { caption, altText };
}

export async function saveToOrgVaultAction(
  type: 'prontos' | 'modelos',
  orgSlug: string,
  payload: { title: string; slides: StudioSlide[]; aspectRatio: AspectRatioKey; previewDataUrl: string; },
  scope: 'personal' | 'org' = 'org'
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const targetFolder = scope === 'personal' || orgSlug === 'personal'
      ? `studio/${type}`
      : `/orgs/${orgSlug}/studio/${type}`;
    const res = await fetch('/api/studio/vault-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetFolder,
        fileName: `${type === 'modelos' ? 'modelo' : 'post'}-${Date.now()}.json`,
        orgSlug: scope === 'personal' ? 'personal' : orgSlug,
        scope,
        payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Falha ao salvar no cofre (${res.status}).` };
    }
    return { ok: true, path: data.path };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha de rede ao salvar no cofre.' };
  }
}
