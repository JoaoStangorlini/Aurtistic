// Este programa é um software livre (Licença AGPLv3)
export type AspectRatioKey = '1:1' | '4:5' | '9:16' | '16:9';

export interface AspectDimension {
  width: number;
  height: number;
  label: string;
  cssAspect: string;
}

export const ASPECT_DIMENSIONS: Record<AspectRatioKey, AspectDimension> = {
  '1:1': { width: 1080, height: 1080, label: '1:1 Feed', cssAspect: '1 / 1' },
  '4:5': { width: 1080, height: 1350, label: '4:5 Retrato', cssAspect: '4 / 5' },
  '9:16': { width: 1080, height: 1920, label: '9:16 Reels/Story', cssAspect: '9 / 16' },
  '16:9': { width: 1920, height: 1080, label: '16:9 Paisagem', cssAspect: '16 / 9' },
};

export interface StudioLayerFilterConfig {
  brightness: number;   // 0..200 (100 = default)
  contrast: number;     // 0..200 (100 = default)
  saturation: number;   // 0..200 (100 = default)
  blur: number;         // 0..50 (0 = default)
  grayscale: number;    // 0..100 (0 = default)
  sepia: number;        // 0..100 (0 = default)
  overlayDark: number;  // 0..85 — overlay escuro sobre a imagem/camada
  temperature: number;  // -50..50 (negativo=frio/azul, positivo=quente/laranja)
  vignette: number;     // 0..100 — vigência de borda
  targetMaskAreaOnly?: boolean;
  isCutoutMask?: boolean; // true = recorte total, false = edição seletiva
}

export const DEFAULT_FILTERS: StudioLayerFilterConfig = {
  brightness: 100, contrast: 100, saturation: 100, blur: 0,
  grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0,
  targetMaskAreaOnly: false, isCutoutMask: false,
};

export interface StudioLayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  x: number; // 0..1 normalizado relativo ao Canvas
  y: number; // 0..1 normalizado relativo ao Canvas
  width: number; // 0..1 normalizado relativo ao Canvas
  height: number; // 0..1 normalizado relativo ao Canvas
  rotation: number; // em graus 0..360
  filters?: StudioLayerFilterConfig;
  maskDataUrl?: string; // Máscara offscreen monocromática em dataUrl
}

export interface StudioImageLayer extends StudioLayerBase {
  type: 'image';
  src: string;
  naturalWidth?: number;
  naturalHeight?: number;
  zoom: number; // 1..3
  cropX: number; // 0..1
  cropY: number; // 0..1
  cropWidth: number; // 0..1
  cropHeight: number; // 0..1
  vaultRelativePath?: string;
}

export interface StudioTextLayer extends StudioLayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number; // em pixels relativos à escala canônica
  color: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}

export type StudioShapeType =
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'triangle'
  | 'hexagon'
  | 'callout'
  | 'arrow'
  | 'arrow-curved'
  | 'arrow-double'
  | 'science-atom'
  | 'science-wave'
  | 'science-lens'
  | 'science-micro'
  | 'science-dna';

export interface StudioShapeLayer extends StudioLayerBase {
  type: 'shape';
  shapeType: StudioShapeType;
  fillColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  tailDirection?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export interface StudioMathLayer extends StudioLayerBase {
  type: 'math';
  latex: string;
  svg?: string;
  color: string;
}

export type LogoPreset = 'show-da-fisica-tricolor' | 'ifusp' | 'org-logo' | 'custom';

export interface StudioLogoLayer extends StudioLayerBase {
  type: 'logo';
  preset: LogoPreset;
  src?: string;           // para 'custom'
  preserveAspect: boolean;
  tintColor?: string;
}

export type StudioLayer =
  | StudioImageLayer
  | StudioTextLayer
  | StudioShapeLayer
  | StudioMathLayer
  | StudioLogoLayer;

export interface StudioSlide {
  id: string;
  title: string;
  aspectRatio: AspectRatioKey;
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImageUrl?: string;
  globalFilters: StudioLayerFilterConfig;
  layers: StudioLayer[];
  showBrandBadge: boolean;
  brandBadgeText?: string;
  splitScreen?: 'none' | 'vertical' | 'horizontal';
  splitRatio?: number; // padrão 0.5
}

export interface StudioDraft {
  id: string;
  slotIndex: 1 | 2 | 3;
  title: string;
  aspectRatio: AspectRatioKey;
  updatedAt: string;
  slides: StudioSlide[];
  thumbnailDataUrl?: string;
}

export interface StudioTemplate {
  id: string;
  title: string;
  category: 'modelo' | 'pronto';
  orgSlug: string;
  aspectRatio: AspectRatioKey;
  previewUrl: string;
  slides: StudioSlide[];
  badgeTag?: string;
}

export type StudioStage = 'launcher' | 'editor' | 'publish';
export type StudioActiveTab = 'images' | 'edition' | 'texts' | 'layers';

export interface StudioPublishPayload {
  title: string;
  body: string;
  slidesCount: number;
  aspectRatio: AspectRatioKey;
  imageDataUrls: string[];
  pdfDataUrl?: string;
  orgSlug: string;
}

