// Este programa é um software livre (Licença AGPLv3)
/**
 * public/js/keyboard-shortcuts.js
 * Gerenciador de atalhos de teclado no Desktop para o Fire Stick Portal
 * Trava obrigatória contra digitação em inputs, textareas e contenteditables.
 */

(function () {
  'use strict';

  function isTypingContext(el) {
    if (!el) return false;
    const tagName = (el.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function initKeyboardShortcuts(handlers = {}) {
    window.addEventListener('keydown', (e) => {
      // 1. Trava estrita contra interferência ao preencher formulários ou buscas
      if (isTypingContext(document.activeElement) || isTypingContext(e.target)) {
        // Permite apenas Escape dentro de inputs para fechar modais ou limpar busca
        if (e.key === 'Escape') {
          document.activeElement?.blur();
          if (handlers.onEscape) handlers.onEscape(e);
        }
        return;
      }

      // Evita disparar se Ctrl ou Alt ou Meta estiverem pressionados (exceto quando mapeado explicitamente)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key;

      switch (key) {
        // Barra de busca: focar imediatamente
        case '/':
          e.preventDefault();
          if (handlers.onFocusSearch) handlers.onFocusSearch();
          break;

        // Selecionar item em foco / seleção múltipla
        case ' ':
          if (handlers.onToggleSelectFocused) {
            e.preventDefault();
            handlers.onToggleSelectFocused();
          }
          break;

        // Alternar Favorito (F ou f)
        case 'f':
        case 'F':
          e.preventDefault();
          if (handlers.onToggleFavorite) handlers.onToggleFavorite();
          break;

        // Enviar item selecionado ou em foco para lixeira
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (handlers.onDeleteFocused) handlers.onDeleteFocused();
          break;

        // Colunas 1 a 5 da Visualização Livre (Free View)
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          e.preventDefault();
          if (handlers.onChangeFreeColumns) handlers.onChangeFreeColumns(parseInt(key, 10));
          break;

        // Navegação do Lightbox (Setas e Esc)
        case 'ArrowLeft':
          if (handlers.onPrevSlide) handlers.onPrevSlide();
          break;
        case 'ArrowRight':
          if (handlers.onNextSlide) handlers.onNextSlide();
          break;
        case 'Escape':
          if (handlers.onEscape) handlers.onEscape(e);
          break;

        default:
          break;
      }
    });
  }

  window.initKeyboardShortcuts = initKeyboardShortcuts;
})();

