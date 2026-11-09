// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { THEME_PALETTES, type ThemePaletteId } from '@/lib/theme-config';

export async function GET(request: NextRequest) {
  const rawPalette = request.nextUrl.searchParams.get('palette') as ThemePaletteId | null;
  const palette: ThemePaletteId =
    rawPalette && THEME_PALETTES[rawPalette] ? rawPalette : 'purple-gold';
  const mode = request.nextUrl.searchParams.get('mode') === 'light' ? 'light' : 'dark';
  const bg = mode === 'light' ? '#F4F5F8' : '#121212';

  return NextResponse.json(
    {
      name: 'Aurtistic',
      short_name: 'Aurtistic',
      description: 'Ecossistema Criativo, Científico e Neurodivergente',
      start_url: '/',
      display: 'standalone',
      background_color: bg,
      theme_color: bg,
      icons: [
        {
          src: `/icons/icon-${palette}.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}

