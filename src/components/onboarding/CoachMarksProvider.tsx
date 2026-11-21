// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  type CoachMarkStep,
  type CoachMarksTour,
  getCoachMarksForPathname,
} from '@/lib/coach-marks-steps';
import { CoachMarksOverlay } from './CoachMarksOverlay';

interface CoachMarksContextType {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: CoachMarkStep | null;
  totalSteps: number;
  tourTitle: string;
  startTour: () => void;
  closeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
}

const CoachMarksContext = createContext<CoachMarksContextType | undefined>(undefined);

export function CoachMarksProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tour, setTour] = useState<CoachMarksTour>(() => getCoachMarksForPathname(pathname));
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Fecha o tour se a rota mudar durante a exibição (Padrão oficial React 19: Ajuste de estado durante render)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (isActive) {
      setIsActive(false);
      setCurrentStepIndex(0);
    }
  }

  const startTour = useCallback(() => {
    const currentTour = getCoachMarksForPathname(pathname);
    setTour(currentTour);
    setCurrentStepIndex(0);
    setIsActive(true);
  }, [pathname]);

  const closeTour = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurtistic:close-self-care-if-temporary'));
      window.dispatchEvent(new CustomEvent('aurtistic:close-quick-filters-if-temporary'));
      window.dispatchEvent(new CustomEvent('aurtistic:close-quick-links-if-temporary'));
    }
    setIsActive(false);
    setCurrentStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    let willFinish = false;
    setCurrentStepIndex((prev) => {
      if (prev + 1 >= tour.steps.length) {
        willFinish = true;
        return 0;
      }
      return prev + 1;
    });
    // Side-effects fora do updater funcional do React (garantindo pureza do render)
    if (willFinish) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aurtistic:close-self-care-if-temporary'));
        window.dispatchEvent(new CustomEvent('aurtistic:close-quick-filters-if-temporary'));
        window.dispatchEvent(new CustomEvent('aurtistic:close-quick-links-if-temporary'));
      }
      setIsActive(false);
    }
  }, [tour.steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const currentStep = isActive && tour.steps[currentStepIndex] ? tour.steps[currentStepIndex] : null;

  // Suporte a pending-tour armazenado em sessionStorage (ex: pós-redirecionamento ou tour pendente)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const pendingTour = sessionStorage.getItem('aurtistic_pending_tour');
    if (pendingTour) {
      sessionStorage.removeItem('aurtistic_pending_tour');
      startTour();
    }
  }, [startTour]);

  // Auto-Abertura Dinâmica de Painéis para o Spotlight
  React.useEffect(() => {
    if (typeof window === 'undefined' || !isActive || !currentStep) return;

    if (currentStep.id === 'self-care-hub') {
      window.dispatchEvent(new CustomEvent('aurtistic:ensure-self-care-open', { detail: { isTour: true } }));
    } else {
      window.dispatchEvent(new CustomEvent('aurtistic:close-self-care-if-temporary'));
    }

    if (currentStep.id === 'tasks-quick-filters') {
      window.dispatchEvent(new CustomEvent('aurtistic:ensure-quick-filters-open', { detail: { isTour: true } }));
    } else {
      window.dispatchEvent(new CustomEvent('aurtistic:close-quick-filters-if-temporary'));
    }

    if (currentStep.id === 'quick-links-hub' || currentStep.id === 'quick-links') {
      window.dispatchEvent(new CustomEvent('aurtistic:ensure-quick-links-open', { detail: { isTour: true } }));
    } else {
      window.dispatchEvent(new CustomEvent('aurtistic:close-quick-links-if-temporary'));
    }

    if (currentStep.id === 'vault-preview-pane') {
      window.dispatchEvent(new CustomEvent('aurtistic:ensure-preview-open'));
    }
    if (currentStep.id === 'portfolio-gallery' || currentStep.id === 'portfolio-albums') {
      window.dispatchEvent(new CustomEvent('aurtistic:ensure-portfolio-tab'));
    }
  }, [isActive, currentStep]);

  return (
    <CoachMarksContext.Provider
      value={{
        isActive,
        currentStepIndex,
        currentStep,
        totalSteps: tour.steps.length,
        tourTitle: tour.tourTitle,
        startTour,
        closeTour,
        nextStep,
        prevStep,
      }}
    >
      {children}
      {isActive && currentStep && <CoachMarksOverlay />}
    </CoachMarksContext.Provider>
  );
}

export function useCoachMarks() {
  const ctx = useContext(CoachMarksContext);
  if (!ctx) {
    throw new Error('useCoachMarks deve ser utilizado dentro de um <CoachMarksProvider>');
  }
  return ctx;
}
