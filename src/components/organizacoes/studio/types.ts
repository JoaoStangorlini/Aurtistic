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

export interface CurvePoint {
  x: number; // 0..255 (estritamente monotônico)
  y: number; // 0..255
}

export type ArtisticFilterPreset =
  | 'original'
  | 'labdiv-clean'
  | 'quantum-cyan'
  | 'tri-x-mono'
  | 'sepia-vintage'
  | 'matrix-hs'
  | 'nature-editorial'
  | 'dark-moody';

export type StudioBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

export interface StudioLayerFilterConfig {
  brightness: number;   // 0..200 (100 = default)
  contrast: number;     // 0..200 (100 = default)
  saturation: number;   // 0..200 (100 = default)
  blur: number;         // 0..50 (0 = default)
  grayscale: number;    // 0..100 (0 = default)
  sepia: number;        // 0..100 (0 = default)
  overlayDark: number;  // 0..85 — overlay escuro sobre a imagem/camada
  temperature: number;  // -50..50 (negativo=frio/azul, positivo=quente/laranja)
  vignette: number;     // 0..100 — vinheta de borda
  exposure?: number;    // -100..100 — exposição luminosa
  luminance?: number;   // -100..100 — luminância
  highlights?: number;  // -100..100 — destaques
  shadows?: number;     // -100..100 — sombras
  whitePoint?: number;  // -50..50 — ponto branco
  blackPoint?: number;  // -50..50 — ponto negro
  curves?: {
    rgb: CurvePoint[];
    r: CurvePoint[];
    g: CurvePoint[];
    b: CurvePoint[];
  };
  tint?: number;        // -50..50 (verde <-> magenta)
  vibrance?: number;    // -100..100 — vivacidade seletiva
  bwDesaturate?: boolean;
  hueTint?: number;     // 0..360
  hueTintIntensity?: number; // 0..100
  splitHighlightsColor?: string;
  splitShadowsColor?: string;
  splitBalance?: number; // -50..50
  bokehEnabled?: boolean;
  bokehRadius?: number;  // 0..50
  bokehFeather?: number; // 0..120
  bokehShape?: 'radial' | 'linear';
  bokehFocalX?: number;  // 0..1
  bokehFocalY?: number;  // 0..1
  grain?: number;        // 0..100
  clarity?: number;      // 0..100
  artisticFilter?: ArtisticFilterPreset;
  filterOpacity?: number; // 0..100
  blendMode?: StudioBlendMode;
  targetMaskAreaOnly?: boolean;
  isCutoutMask?: boolean; // true = recorte total, false = edição seletiva
}

export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 85, y: 85 },
  { x: 170, y: 170 },
  { x: 255, y: 255 },
];

export const DEFAULT_FILTERS: StudioLayerFilterConfig = {
  brightness: 100, contrast: 100, saturation: 100, blur: 0,
  grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0,
  exposure: 0, luminance: 0, highlights: 0, shadows: 0, whitePoint: 0, blackPoint: 0,
  tint: 0, vibrance: 0, bwDesaturate: false, hueTint: 0, hueTintIntensity: 0,
  splitHighlightsColor: '#FFCC00', splitShadowsColor: '#1F9FCF', splitBalance: 0,
  bokehEnabled: false, bokehRadius: 18, bokehFeather: 60, bokehShape: 'radial',
  bokehFocalX: 0.5, bokehFocalY: 0.5,
  grain: 0, clarity: 0, artisticFilter: 'original', filterOpacity: 100, blendMode: 'source-over',
  targetMaskAreaOnly: false, isCutoutMask: false,
};

export interface StudioLayerFolder {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  visible: boolean;
  locked: boolean;
  isGroup?: boolean;
}

export interface StudioLayerBase {
  id: string;
  name: string;
  folderId?: string | null;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  x: number; // 0..1 normalizado relativo ao Canvas
  y: number; // 0..1 normalizado relativo ao Canvas
  width: number; // 0..1 normalizado relativo ao Canvas
  height: number; // 0..1 normalizado relativo ao Canvas
  rotation: number; // em graus -180..180
  flipH?: boolean;
  flipV?: boolean;
  skewX?: number; // -45..45 deg
  skewY?: number; // -45..45 deg
  cropRect?: {
    active: boolean;
    aspect: 'free' | '1:1' | '4:5' | '16:9';
    x: number; // 0..1
    y: number; // 0..1
    width: number; // 0..1
    height: number; // 0..1
  };
  filters?: StudioLayerFilterConfig;
  maskDataUrl?: string; // Máscara offscreen monocromática em dataUrl
  maskStrokes?: Array<{ x: number; y: number; r: number; mode: 'add' | 'erase' }>;
}

export interface StudioVaultRef {
  scopeType: 'org' | 'user';
  orgSlug?: string;
  organizationId?: string;
  relativePath: string;
}

export interface StudioMaskPresetConfig {
  shape: 'none' | 'circle' | 'oval' | 'rounded' | 'hexagon' | 'star' | 'arch' | 'linear-fade' | 'radial-fade';
  feather: number; // 0..80
  invert?: boolean;
  angle?: number; // 0..360 (linear-fade)
  position?: number; // 10..90 (%)
}

export interface StudioImageLayer extends StudioLayerBase {
  type: 'image';
  src: string;
  resolvedUrl?: string; // URL hidratada em runtime (não persiste)
  fallbackUrl?: string; // URL alternativa (ex.: miniatura pré-gerada caso o stream falhe)
  naturalWidth?: number;
  naturalHeight?: number;
  zoom: number; // 1..3
  cropX: number; // 0..1
  cropY: number; // 0..1
  cropWidth: number; // 0..1
  cropHeight: number; // 0..1
  aspectFit?: 'cover' | 'contain' | 'custom';
  offsetX?: number;
  offsetY?: number;
  maskPreset?: StudioMaskPresetConfig;
  vaultRelativePath?: string;
  vaultRef?: StudioVaultRef;
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
  textKind?: 'title' | 'subtitle' | 'body' | 'label' | 'callout';
  uppercase?: boolean;
  pillBgColor?: string;
  pillBgOpacity?: number; // 0..100
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
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
  frameClip?: {
    src: string;
    resolvedUrl?: string;
    zoom: number; // 1..3
    panX: number; // -0.5..0.5
    panY: number; // -0.5..0.5
  };
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
  sealPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  monochrome?: boolean;
}

export type StudioBrushKind = 'pen' | 'marker' | 'highlighter' | 'neon' | 'spray' | 'dashed' | 'eraser';

export interface StudioBrushStroke {
  id: string;
  brush: StudioBrushKind;
  color: string;
  size: number; // px na escala canônica (1080px)
  opacity: number; // 0..1
  points: { x: number; y: number }[]; // normalizados 0..1 relativos à camada de desenho
  seed?: number; // semente determinística para Spray
}

export interface StudioDrawingLayer extends StudioLayerBase {
  type: 'drawing';
  strokes: StudioBrushStroke[];
}

export type StudioLayer =
  | StudioImageLayer
  | StudioTextLayer
  | StudioShapeLayer
  | StudioMathLayer
  | StudioLogoLayer
  | StudioDrawingLayer;

export type StudioGuideOverlayMode =
  | 'none'
  | 'thirds'
  | 'diagonals'
  | 'safe_area'
  | 'golden_spiral'
  | 'golden_grid';

export interface StudioSlide {
  id: string;
  title: string;
  aspectRatio: AspectRatioKey;
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImageUrl?: string;
  globalFilters: StudioLayerFilterConfig;
  folders?: StudioLayerFolder[];
  layers: StudioLayer[];
  showBrandBadge: boolean;
  brandBadgeText?: string;
}

export interface StudioDraft {
  id: string;
  slotIndex: 1 | 2 | 3;
  storageKey?: string;
  scopeKey?: string;
  scope?: 'personal' | 'org';
  orgSlug?: string;
  title: string;
  aspectRatio: AspectRatioKey;
  updatedAt: string;
  slides: StudioSlide[];
  thumbnailDataUrl?: string;
}

export interface StudioTemplate {
  id: string;
  title: string;
  category: 'modelo' | 'pronto' | 'equipe';
  orgSlug: string;
  aspectRatio: AspectRatioKey;
  previewUrl: string;
  slides: StudioSlide[];
  badgeTag?: string;
  description?: string;
}

export type StudioStage = 'launcher' | 'editor' | 'publish';
export type StudioActiveTab = 'images' | 'edition' | 'masks' | 'brush' | 'texts' | 'elements' | 'palette' | 'layers';

export interface StudioPublishPayload {
  title: string;
  body: string;
  slidesCount: number;
  aspectRatio: AspectRatioKey;
  imageDataUrls: string[];
  pdfDataUrl?: string;
  orgSlug: string;
}

