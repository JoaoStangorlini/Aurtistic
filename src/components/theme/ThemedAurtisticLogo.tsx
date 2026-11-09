// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from './ThemeProvider';

export interface ThemedAurtisticLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
  linkToHome?: boolean;
  iconOnly?: boolean;
}

/**
 * Logotipo autêntico da identidade visual Aurtistic (ícone cerebral + tipografia + caixa de marcação).
 * Adapta-se 100% dinamicamente à paleta bicolor ativa (Roxo/Dourado, Azul/Vermelho, Rosa/Verde, etc.)
 * e ao modo Claro/Escuro do sistema ou preferência do usuário.
 */
export function ThemedAurtisticLogo({
  size = 'md',
  showTagline = false,
  className = '',
  linkToHome = false,
  iconOnly = false,
}: ThemedAurtisticLogoProps) {
  const { palette, resolvedMode } = useTheme();
  const currentPalette = palette || 'purple-gold';
  const currentMode = resolvedMode || 'dark';

  // Modo somente ícone (circular / 1:1, ideal para avatares, spinners de carregamento e atalhos)
  if (iconOnly) {
    const iconSizeMap = {
      sm: { size: 32, className: 'w-7 h-7' },
      md: { size: 48, className: 'w-10 h-10 md:w-12 md:h-12' },
      lg: { size: 96, className: 'w-20 h-20 md:w-24 md:h-24' },
      xl: { size: 128, className: 'w-28 h-28 md:w-32 md:h-32' },
    };
    const currentIconSize = iconSizeMap[size] || iconSizeMap.md;
    const iconSrc = `/icons/icon-${currentPalette}.png`;

    const iconContent = (
      <div className={`relative flex items-center justify-center select-none ${className}`}>
        <Image
          src={iconSrc}
          alt="Aurtistic Icon"
          width={currentIconSize.size}
          height={currentIconSize.size}
          className={`${currentIconSize.className} object-contain transition-opacity duration-200`}
          priority
          unoptimized
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            if (target && !target.src.endsWith('/aurtistic_app_icon_v12_black.png')) {
              target.src = '/aurtistic_app_icon_v12_black.png';
            }
          }}
        />
      </div>
    );

    if (linkToHome) {
      return (
        <Link href="/" className="group flex items-center" aria-label="Ir para a página inicial do Aurtistic">
          {iconContent}
        </Link>
      );
    }
    return iconContent;
  }

  const darkLogoSrc = `/logos/logo-${currentPalette}-dark.png`;
  const lightLogoSrc = `/logos/logo-${currentPalette}-light.png`;

  // Dimensões mantendo o aspect ratio original (938x214 = 4.383)
  const sizeMap = {
    sm: {
      width: 123,
      height: 28,
      className: 'h-7 w-auto',
      taglineSize: 'text-[9px]',
    },
    md: {
      width: 158,
      height: 36,
      className: 'h-8 md:h-9 w-auto',
      taglineSize: 'text-[11px]',
    },
    lg: {
      width: 210,
      height: 48,
      className: 'h-11 md:h-12 w-auto',
      taglineSize: 'text-xs',
    },
    xl: {
      width: 280,
      height: 64,
      className: 'h-14 md:h-16 w-auto',
      taglineSize: 'text-sm',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div className={`inline-flex flex-col select-none ${className}`}>
      <div className="flex items-center">
        {/* Renderiza exatamente 2 tags img alternadas via CSS para Zero-FOUC absoluto */}
        <img
          src={darkLogoSrc}
          alt="Aurtistic Logo"
          width={currentSize.width}
          height={currentSize.height}
          decoding="sync"
          className={`aurtistic-logo-dark ${currentSize.className} object-contain transition-opacity duration-200 group-hover:opacity-90`}
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            if (target && !target.src.endsWith('/aurtistic_logo_white_v3.png')) {
              target.src = '/aurtistic_logo_white_v3.png';
            }
          }}
        />
        <img
          src={lightLogoSrc}
          alt="Aurtistic Logo"
          width={currentSize.width}
          height={currentSize.height}
          decoding="sync"
          className={`aurtistic-logo-light ${currentSize.className} object-contain transition-opacity duration-200 group-hover:opacity-90`}
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            if (target && !target.src.endsWith('/aurtistic_logo_white_v3.png')) {
              target.src = '/aurtistic_logo_white_v3.png';
            }
          }}
        />
      </div>
      {showTagline && (
        <span
          className={`font-sans font-bold tracking-wider uppercase text-[var(--accent-secondary)] ${currentSize.taglineSize} opacity-90 pl-1 mt-0.5`}
        >
          creative manager
        </span>
      )}
    </div>
  );

  if (linkToHome) {
    return (
      <Link href="/" className="group flex items-center" aria-label="Ir para a página inicial do Aurtistic">
        {content}
      </Link>
    );
  }

  return content;
}
