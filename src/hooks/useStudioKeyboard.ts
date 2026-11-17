// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useEffect } from 'react';
import type { StudioLayer } from '@/components/organizacoes/studio/types';

interface StudioKeyboardActions {
  selectedLayer: StudioLayer | null;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onMoveLayer: (id: string, dx: number, dy: number) => void;
  onReorderLayer: (up: boolean) => void;
  onSaveDraft: () => void;
  onClearSelection: () => void;
}

export function useStudioKeyboard(actions: StudioKeyboardActions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guarda de foco: se estiver em input, textarea, select ou elemento editável
      const activeEl = document.activeElement as HTMLElement | null;
      const targetEl = e.target as HTMLElement | null;
      const isInput =
        ['input', 'textarea', 'select'].includes(activeEl?.tagName?.toLowerCase() || '') ||
        ['input', 'textarea', 'select'].includes(targetEl?.tagName?.toLowerCase() || '') ||
        Boolean(activeEl?.isContentEditable || targetEl?.isContentEditable);

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Se estiver digitando em campo de texto, NUNCA executa atalhos de canvas
      if (isInput) {
        if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
          e.preventDefault();
          actions.onSaveDraft();
        }
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

      // Ações que exigem camada selecionada
      if (!actions.selectedLayer) return;

      // Escape: limpar seleção
      if (e.key === 'Escape') {
        actions.onClearSelection();
        return;
      }

      // Delete / Backspace: excluir camada se não estiver bloqueada
      if ((e.key === 'Delete' || e.key === 'Backspace') && !actions.selectedLayer.locked) {
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

      // Movimentação por setas
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'ArrowLeft') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, -step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, 0, -step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); actions.onMoveLayer(actions.selectedLayer.id, 0, step); }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}

