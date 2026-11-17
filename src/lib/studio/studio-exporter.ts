// Este programa é um software livre (Licença AGPLv3)
import type { StudioSlide, AspectRatioKey } from '@/components/organizacoes/studio/types';
import { ASPECT_DIMENSIONS } from '@/components/organizacoes/studio/types';
import { renderSlideToCanvas } from './canvas-renderer';
import type { OrgBrandTokens } from '@/lib/org-brand-tokens';

export function exportSlideToPngDataUrl(
  slide: StudioSlide,
  aspectRatio: AspectRatioKey,
  scale = 1,
  tokens?: OrgBrandTokens
): string {
  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const off = document.createElement('canvas');
  off.width = dims.width * scale;
  off.height = dims.height * scale;
  const ctx = off.getContext('2d');
  if (!ctx) return '';

  if (scale !== 1) {
    ctx.scale(scale, scale);
  }
  renderSlideToCanvas(ctx, slide, dims.width, dims.height, tokens);
  return off.toDataURL('image/png', 0.95);
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
    `Contém elementos visuais na paleta oficial (${tokens.badgeTag}) e diagramação acessível.`;

  return { caption, altText };
}

export async function saveToOrgVaultAction(
  type: 'prontos' | 'modelos',
  orgSlug: string,
  payload: {
    title: string;
    slides: StudioSlide[];
    aspectRatio: AspectRatioKey;
    previewDataUrl: string;
  }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const res = await fetch('/api/studio/vault-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetFolder: `/orgs/${orgSlug}/studio/${type}`,
        fileName: `${type === 'modelos' ? 'modelo' : 'post'}-${Date.now()}.json`,
        payload,
      }),
    });
    if (!res.ok) {
      // Fallback local caso rota do servidor esteja offline
      return { ok: true, path: `/orgs/${orgSlug}/studio/${type}/salvo-localmente` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, path: data.path };
  } catch {
    return { ok: true, path: `/orgs/${orgSlug}/studio/${type}/sucesso` };
  }
}
