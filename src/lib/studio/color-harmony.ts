// Este programa é um software livre (Licença AGPLv3)
// Motor de Harmonias de Cores em OKLCH sem dependências externas

export function hexToRgb(hex: string): [number, number, number] {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${cl(r)}${cl(g)}${cl(b)}`;
}

// Converte sRGB para linear
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Converte linear para sRGB
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

export function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bOklab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(a * a + bOklab * bOklab);
  let H = (Math.atan2(bOklab, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

export function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ * l_ * l_, m3 = m_ * m_ * m_, s3 = s_ * s_ * s_;
  const rLin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)];
}

export function oklchToHex(L: number, C: number, H: number): string {
  const [r, g, b] = oklchToRgb(L, C, H);
  return rgbToHex(r, g, b);
}

// Harmonias de Cor
export function getHarmonies(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const [L, C, H] = rgbToOklch(r, g, b);
  const wrap = (deg: number) => (deg + 360) % 360;

  return {
    complementary: [hex, oklchToHex(L, C, wrap(H + 180))],
    analogous: [hex, oklchToHex(L, C, wrap(H - 30)), oklchToHex(L, C, wrap(H + 30))],
    triadic: [hex, oklchToHex(L, C, wrap(H + 120)), oklchToHex(L, C, wrap(H + 240))],
    tetradic: [hex, oklchToHex(L, C, wrap(H + 90)), oklchToHex(L, C, wrap(H + 180)), oklchToHex(L, C, wrap(H + 270))],
    monochromatic: [
      oklchToHex(Math.min(1, L * 1.3), C * 0.7, H),
      hex,
      oklchToHex(L * 0.75, C * 0.9, H),
      oklchToHex(L * 0.5, C * 0.8, H),
    ],
  };
}

// Estilos de Paleta
export function applyPaletteStyle(hex: string, style: 'neon' | 'pastel' | 'dark' | 'metallic' | 'earthy'): string {
  const [r, g, b] = hexToRgb(hex);
  const [L, C, H] = rgbToOklch(r, g, b);

  switch (style) {
    case 'neon': return oklchToHex(Math.min(0.92, L + 0.15), Math.min(0.35, C * 1.5 + 0.08), H);
    case 'pastel': return oklchToHex(Math.min(0.94, L + 0.25), Math.max(0.04, C * 0.4), H);
    case 'dark': return oklchToHex(Math.max(0.18, L * 0.45), Math.max(0.03, C * 0.7), H);
    case 'metallic': return oklchToHex(0.68, 0.05, H);
    case 'earthy': return oklchToHex(Math.max(0.35, L * 0.8), Math.max(0.06, C * 0.55), (H + 15) % 360);
  }
}

// Contraste WCAG 2.1
export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// Busca rápida de cores por keyword (suporta múltiplos termos: 'azul + dourado')
export function searchPaletteByKeyword(keyword: string): string[] {
  const map: Record<string, string[]> = {
    azul: ['#0066FF', '#00D4FF', '#0A2540', '#60A5FA'],
    dourado: ['#FFCC00', '#F59E0B', '#D97706', '#FEF3C7'],
    amarelo: ['#FFCC00', '#F59E0B', '#FBBF24'],
    vermelho: ['#FF1E1E', '#DC2626', '#991B1B', '#F87171'],
    verde: ['#00FF66', '#10B981', '#064E3B', '#34D399'],
    roxo: ['#9D4EDD', '#7C3AED', '#4C1D95', '#C084FC'],
    laranja: ['#F97316', '#EA580C', '#FFEDD5', '#FB923C'],
    show: ['#FF1E1E', '#0066FF', '#00FF66', '#FFCC00'],
    labdiv: ['#0F4780', '#1F9FCF', '#F14343', '#FFCC00'],
  };

  const tokens = keyword.toLowerCase().split(/[\s,+]+/).filter(Boolean);
  const matched: string[] = [];
  for (const t of tokens) {
    for (const [k, colors] of Object.entries(map)) {
      if (k.includes(t) || t.includes(k)) {
        colors.forEach((c) => { if (!matched.includes(c)) matched.push(c); });
      }
    }
  }
  return matched.length > 0 ? matched.slice(0, 8) : ['#0F4780', '#1F9FCF', '#FFCC00', '#9D4EDD', '#00FF66'];
}

