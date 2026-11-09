// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCoachMarks } from './CoachMarksProvider';

interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  isCenteredFallback: boolean;
}

export function CoachMarksOverlay() {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    tourTitle,
    closeTour,
    nextStep,
    prevStep,
  } = useCoachMarks();

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [cutout, setCutout] = useState<CutoutRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 100,
    left: 20,
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  // Encontra o elemento visível correspondente ao seletor
  const locateTargetElement = useCallback((): HTMLElement | null => {
    if (!currentStep) return null;
    const elements = Array.from(document.querySelectorAll<HTMLElement>(currentStep.selector));
    if (elements.length === 0) return null;

    // Se múltiplos elementos existirem (ex: tabs desktop vs mobile), escolhe o visível no viewport
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      ) {
        return el;
      }
    }
    return elements[0] || null;
  }, [currentStep]);

  // Atualiza coordenadas do recorte e do popover
  const updatePositions = useCallback(() => {
    const el = locateTargetElement();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!el) {
      // Fallback: centraliza o card no meio da tela
      setCutout({
        x: vw / 2 - 10,
        y: vh / 2 - 10,
        width: 20,
        height: 20,
        isCenteredFallback: true,
      });
      setPopoverPos({
        top: Math.max(30, vh / 2 - 120),
        left: Math.max(16, vw / 2 - 170),
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    const cutoutX = Math.max(4, rect.left - pad);
    const cutoutY = Math.max(4, rect.top - pad);
    const cutoutW = Math.min(vw - cutoutX - 4, rect.width + pad * 2);
    const cutoutH = Math.min(vh - cutoutY - 4, rect.height + pad * 2);

    setCutout({
      x: cutoutX,
      y: cutoutY,
      width: cutoutW,
      height: cutoutH,
      isCenteredFallback: false,
    });

    // Calcula a posição do popover flutuante
    const cardWidth = Math.min(360, vw - 32);
    const cardHeight = 220; // Estimativa segura

    let targetTop = cutoutY + cutoutH + 12;
    let targetLeft = cutoutX + cutoutW / 2 - cardWidth / 2;

    // Se não couber embaixo, posiciona em cima
    const mobileBottomNavBuffer = 90;
    if (targetTop + cardHeight > vh - mobileBottomNavBuffer) {
      if (cutoutY - cardHeight - 12 > 10) {
        targetTop = cutoutY - cardHeight - 12;
      } else {
        // Centraliza verticalmente na área restante
        targetTop = Math.max(16, (vh - cardHeight) / 2);
      }
    }

    // Clamping horizontal
    targetLeft = Math.max(16, Math.min(vw - cardWidth - 16, targetLeft));

    setPopoverPos({
      top: targetTop,
      left: targetLeft,
    });
  }, [locateTargetElement]);

  // Scroll suave até o elemento-alvo ao mudar de passo
  useEffect(() => {
    const el = locateTargetElement();
    if (el) {
      const rect = el.getBoundingClientRect();
      const inView =
        rect.top >= 50 &&
        rect.bottom <= window.innerHeight - 80 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth;
      if (!inView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    // Aguarda término do scroll suave para posicionamento perfeito
    const timer = setTimeout(updatePositions, 150);
    return () => clearTimeout(timer);
  }, [locateTargetElement, updatePositions, currentStepIndex]);

  // Listeners de Redimensionamento e Teclado
  useEffect(() => {
    const handleResize = () => updatePositions();
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName) || target.isContentEditable);
      if (isTyping) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [updatePositions, closeTour, nextStep, prevStep]);

  if (!mounted || !currentStep || !cutout) return null;

  const isLastStep = currentStepIndex + 1 === totalSteps;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={currentStep.title}
    >
      {/* SVG com Máscara de Recorte Spotlight */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={closeTour}>
        <defs>
          <mask id="coach-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {!cutout.isCenteredFallback && (
              <rect
                x={cutout.x}
                y={cutout.y}
                width={cutout.width}
                height={cutout.height}
                rx="12"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.78)"
          mask="url(#coach-spotlight-mask)"
        />
      </svg>

      {/* Anel de Foco e Destaque sobre o Elemento-Alvo */}
      {!cutout.isCenteredFallback && (
        <div
          className="absolute rounded-xl pointer-events-none border-2 border-[#FFCC00] shadow-[0_0_24px_rgba(255,204,0,0.45)] transition-all duration-300 ease-out"
          style={{
            top: cutout.y,
            left: cutout.x,
            width: cutout.width,
            height: cutout.height,
          }}
        />
      )}

      {/* Popover Explicativo Clamped */}
      <div
        ref={popoverRef}
        className="absolute w-[calc(100vw-32px)] max-w-sm bg-surface border border-border-subtle rounded-2xl p-5 shadow-2xl backdrop-blur-xl pointer-events-auto transition-all duration-200 ease-out animate-in fade-in zoom-in-95 duration-150"
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo: Título da Sessão + Contador + Fechar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#FFCC00]/15 text-[#FFCC00] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">
                {currentStep.icon || 'help'}
              </span>
            </span>
            <span className="text-[11px] font-bold text-fg-secondary uppercase tracking-wider truncate max-w-[170px]">
              {tourTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#FFCC00] bg-[#FFCC00]/10 px-2 py-0.5 rounded-full border border-[#FFCC00]/20">
              {currentStepIndex + 1} / {totalSteps}
            </span>
            <button
              type="button"
              onClick={closeTour}
              className="text-fg-muted hover:text-white p-1 rounded-md transition-colors"
              title="Fechar tutorial (Esc)"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="space-y-1.5 mb-5">
          <h3 className="text-base font-bold text-white leading-snug">{currentStep.title}</h3>
          <p className="text-xs text-fg-secondary leading-relaxed">{currentStep.description}</p>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={closeTour}
            className="text-xs text-fg-muted hover:text-white transition-colors px-2 py-1"
          >
            Pular
          </button>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-fg-secondary hover:text-white bg-surface-hover hover:bg-surface-hover border border-border-subtle transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Anterior
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] transition-colors flex items-center gap-1 shadow-md shadow-[#FFCC00]/10"
            >
              {isLastStep ? 'Concluir' : 'Próximo'}
              {!isLastStep && (
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
