// Este programa é um software livre (Licença AGPLv3)
import { ASPECT_DIMENSIONS, type AspectRatioKey, type StudioLayer, type StudioSlide } from './types';
import type { useOrganizationBrand } from '../OrganizationBrandProvider';

export function computeInitialTextBoxHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  aspect: AspectRatioKey
): number {
  const dims = ASPECT_DIMENSIONS[aspect] || ASPECT_DIMENSIONS['1:1'];
  const lines = Math.max(1, String(text || '').split('\n').length);
  const contentPx = lines * fontSize * (lineHeight || 1.2);
  const padPx = Math.max(18, fontSize * 0.42);
  return Math.min(0.45, Math.max(0.055, Number(((contentPx + padPx) / dims.height).toFixed(3))));
}

export function createDefaultSlide(
  id: string,
  aspect: AspectRatioKey,
  brand: ReturnType<typeof useOrganizationBrand>['tokens']
): StudioSlide {
  const defaultTitle = brand.defaultPostTitle || 'NOVIDADE NA EQUIPE';
  const defaultFontSize = 64;
  const defaultLineHeight = 1.2;
  return {
    id,
    title: 'Tela 1',
    aspectRatio: aspect,
    backgroundColor: brand.bgApp || '#07090e',
    globalFilters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 },
    showBrandBadge: true,
    brandBadgeText: brand.badgeTag,
    layers: [
      {
        id: `text-${Date.now()}-title`,
        type: 'text',
        name: 'Título Principal',
        visible: true,
        locked: false,
        opacity: 1,
        x: 0.1,
        y: aspect === '9:16' ? 0.20 : 0.12,
        width: 0.8,
        height: computeInitialTextBoxHeight(defaultTitle, defaultFontSize, defaultLineHeight, aspect),
        rotation: 0,
        text: defaultTitle,
        fontFamily: brand.fontDisplay,
        fontSize: defaultFontSize,
        color: brand.textPrimary || '#ffffff',
        align: 'center',
        bold: true,
        italic: false,
        lineHeight: defaultLineHeight,
        letterSpacing: 0,
      },
    ],
  };
}

export function adaptSlideLayersForAspect(layers: StudioLayer[], newAspect: AspectRatioKey): StudioLayer[] {
  return layers.map((layer) => {
    let y = layer.y;
    let x = layer.x;
    if (newAspect === '9:16') {
      // Safe zone 9:16 (Stories/Reels): 15% topo e 20% base
      if (layer.type === 'text' || layer.name.toLowerCase().includes('selo') || layer.name.toLowerCase().includes('logo')) {
        y = Math.max(0.15, Math.min(0.78, y));
      }
    } else if (newAspect === '16:9') {
      // Safe zone 16:9: manter dentro de 5% de margem
      y = Math.max(0.05, Math.min(0.85, y));
      x = Math.max(0.05, Math.min(0.85, x));
    }
    return { ...layer, x, y };
  });
}
