// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect } from 'react';

interface StudioShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: Array<{
  title: string;
  items: Array<{ keys: string; desc: string }>;
}> = [
  {
    title: 'Ferramentas & Navegação',
    items: [
      { keys: 'Segurar Espaço', desc: 'Mãozinha temporária para mover o palco' },
      { keys: 'V', desc: 'Modo Seleção (desativa pincel e conta-gotas)' },
      { keys: 'B', desc: 'Alternar Pincel livre' },
      { keys: 'T', desc: 'Inserir / editar Texto' },
      { keys: 'I', desc: 'Ativar Conta-gotas (Pipeta)' },
      { keys: '?', desc: 'Abrir ou fechar este guia de atalhos' },
    ],
  },
  {
    title: 'Camadas & Edição',
    items: [
      { keys: 'Ctrl + A', desc: 'Selecionar todas as camadas visíveis e destravadas' },
      { keys: 'Ctrl + C / Ctrl + V', desc: 'Copiar e colar camadas em cascata no palco' },
      { keys: 'Ctrl + D', desc: 'Duplicar camada selecionada' },
      { keys: 'Ctrl + G', desc: 'Agrupar camadas selecionadas em pasta' },
      { keys: 'Ctrl + Shift + G', desc: 'Desagrupar pasta selecionada' },
      { keys: '[ / ]', desc: 'Recuar ou avançar camada na ordem' },
      { keys: 'Setas / Shift + Setas', desc: 'Mover 1px ou 10px com precisão' },
      { keys: 'Del / Backspace', desc: 'Excluir camadas selecionadas' },
      { keys: 'Esc', desc: 'Cancelar conta-gotas, texto ou seleção' },
    ],
  },
  {
    title: 'Histórico & Arquivo',
    items: [
      { keys: 'Ctrl + Z', desc: 'Desfazer última ação' },
      { keys: 'Ctrl + Y / Ctrl + Shift + Z', desc: 'Refazer ação' },
      { keys: 'Ctrl + S', desc: 'Salvar no Rascunho Rápido' },
    ],
  },
];

export default function StudioShortcutsModal({ open, onClose }: StudioShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado do Studio"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#121216] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFCC00]/15 text-[#FFCC00]">
              <span className="material-symbols-outlined text-[18px]">keyboard</span>
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">Atalhos do Studio</h2>
              <p className="text-[11px] text-white/55">Pressione <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#FFCC00]">?</kbd> a qualquer momento para abrir ou fechar.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar atalhos"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="rounded-xl border border-white/10 bg-black/35 p-3">
              <h3 className="mb-2.5 text-[10px] font-black uppercase tracking-widest text-[#FFCC00]">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.keys} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-white/75">{item.desc}</span>
                    <kbd className="shrink-0 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
