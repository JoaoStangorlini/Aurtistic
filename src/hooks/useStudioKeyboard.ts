// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useEffect, useRef } from 'react';
import type { StudioLayer } from '@/components/organizacoes/studio/types';

interface StudioKeyboardActions {
  selectedLayer: StudioLayer | null;
  isSelectedLocked?: boolean;
  isEditingText?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onMoveLayer: (id: string, dx: number, dy: number) => void;
  onReorderLayer: (up: boolean) => void;
  onSaveDraft: () => void;
  onClearSelection: () => void;
  onEscapeGlobal?: () => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onSelectAll?: () => void;
  onCopyLayers?: () => boolean;
  onPasteLayers?: () => string[];
  onSelectToolV?: () => void;
  onToggleBrush?: () => void;
  onSelectToolText?: () => void;
  onToggleEyedropper?: () => void;
  onToggleShortcuts?: () => void;
  onTempHandStart?: () => void;
  onTempHandEnd?: () => void;
}

export function useStudioKeyboard(actions: StudioKeyboardActions) {
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    const isTypingTarget = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const targetEl = e.target as HTMLElement | null;
      return Boolean(
        actions.isEditingText ||
        ['input', 'textarea', 'select'].includes(activeEl?.tagName?.toLowerCase() || '') ||
        ['input', 'textarea', 'select'].includes(targetEl?.tagName?.toLowerCase() || '') ||
        activeEl?.isContentEditable ||
        targetEl?.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = isTypingTarget(e);
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Se estiver digitando em campo de texto ou editor inline, NUNCA executa atalhos de canvas
      if (isInput) {
        if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
          e.preventDefault();
          actions.onSaveDraft();
        }
        return;
      }

      // Espaço para Mãozinha temporária (ignora se foco está em botão para não impedir clique por teclado? Não, Space no canvas ativa pan)
      if (e.code === 'Space' && !isCtrlOrCmd && !e.altKey) {
        e.preventDefault();
        if (!e.repeat && !spaceHeldRef.current) {
          spaceHeldRef.current = true;
          actions.onTempHandStart?.();
        }
        return;
      }

      // Cheatsheet global (? - compatível com ABNT2 sem depender de shiftKey)
      if (e.key === '?' && !isCtrlOrCmd && !e.altKey) {
        e.preventDefault();
        actions.onToggleShortcuts?.();
        return;
      }

      // Undo / Redo
      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.onRedo();
        else actions.onUndo();
        return;
      }
      if (isCtrlOrCmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.onRedo();
        return;
      }

      // Salvar rascunho: Ctrl+S
      if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        actions.onSaveDraft();
        return;
      }

      // Selecionar todas as camadas visíveis e destravadas: Ctrl+A
      if (isCtrlOrCmd && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        actions.onSelectAll?.();
        return;
      }

      // Copiar / Colar camadas no palco (Ctrl/Cmd+C e Ctrl/Cmd+V), sem interferir se houver texto selecionado
      if (isCtrlOrCmd && !e.shiftKey && !e.altKey) {
        const lowerKey = e.key.toLowerCase();
        const hasDomSelection = Boolean(typeof window !== 'undefined' && window.getSelection?.()?.toString().trim());
        if (lowerKey === 'c' && !hasDomSelection) {
          if (actions.onCopyLayers?.()) {
            e.preventDefault();
          }
          return;
        }
        if (lowerKey === 'v' && !hasDomSelection) {
          const pastedIds = actions.onPasteLayers?.() || [];
          if (pastedIds.length > 0) {
            e.preventDefault();
          }
          return;
        }
      }

      // Agrupar / Desagrupar: Ctrl+G / Ctrl+Shift+G
      if (isCtrlOrCmd && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) actions.onUngroupSelected?.();
        else actions.onGroupSelected?.();
        return;
      }

      // Atalhos de ferramenta de 1 tecla (somente sem modificadores)
      if (!isCtrlOrCmd && !e.altKey && !e.metaKey) {
        const lower = e.key.toLowerCase();
        if (lower === 'v') {
          e.preventDefault();
          actions.onSelectToolV?.();
          return;
        }
        if (lower === 'b') {
          e.preventDefault();
          actions.onToggleBrush?.();
          return;
        }
        if (lower === 't') {
          e.preventDefault();
          actions.onSelectToolText?.();
          return;
        }
        if (lower === 'i') {
          e.preventDefault();
          actions.onToggleEyedropper?.();
          return;
        }
      }

      // Escape global (cancela conta-gotas mesmo sem camada selecionada)
      if (e.key === 'Escape') {
        actions.onEscapeGlobal?.();
        if (actions.selectedLayer) {
          actions.onClearSelection();
        }
        return;
      }

      // Ações que exigem camada selecionada
      if (!actions.selectedLayer) return;

      const effectivelyLocked = Boolean(actions.selectedLayer.locked || actions.isSelectedLocked);

      // Delete / Backspace: excluir camada se não estiver bloqueada (nem na pasta)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !effectivelyLocked) {
        e.preventDefault();
        actions.onDeleteLayer(actions.selectedLayer.id);
        return;
      }

      // Duplicar camada: Ctrl+D
      if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        actions.onDuplicateLayer(actions.selectedLayer.id);
        return;
      }

      // Reordenação Z-index: [ e ]
      if (e.key === '[') {
        e.preventDefault();
        actions.onReorderLayer(false);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        actions.onReorderLayer(true);
        return;
      }

      // Movimentação por setas (precisão: 0.001 ~1px, Shift: 0.01 ~10px em canvas de 1080px)
      if (effectivelyLocked) return;
      const step = e.shiftKey ? 0.01 : 0.001;
      if (e.key === 'ArrowLeft') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, -step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, 0, -step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, 0, step); }
    };

    const releaseSpaceHand = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      actions.onTempHandEnd?.();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        releaseSpaceHand();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseSpaceHand);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseSpaceHand);
    };
  }, [actions]);
}

