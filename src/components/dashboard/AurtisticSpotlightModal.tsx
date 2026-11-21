// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SpotlightItem {
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: string;
  category: string;
}

const SPOTLIGHT_ITEMS: SpotlightItem[] = [
  { id: 'tarefas', label: 'Tarefas & Agenda', desc: 'Quadro Kanban, lista e calendário semanal', href: '/', icon: 'checklist', category: 'Espaço' },
  { id: 'studio-pessoal', label: 'Studio Pessoal', desc: 'Criador visual para seus projetos e postagens', href: '/studio', icon: 'palette', category: 'Espaço' },
  { id: 'gestao', label: 'Gestão & Bastidores', desc: 'Ponto QR, Matriz de Horários, Metas e Equipe', href: '/labdiv', icon: 'domain', category: 'Organizações' },
  { id: 'studio', label: 'HUB Studio', desc: 'Criador visual integrado Aurtistic + HUB', href: '/labdiv?view=studio', icon: 'palette', category: 'Organizações' },
  { id: 'cofre', label: 'Cofre & Arquivos', desc: 'Armazenamento local offline, galeria e IDE', href: '/servidor', icon: 'folder_special', category: 'Arquivos' },
  { id: 'galeria', label: 'Galeria Timeline', desc: 'Fotos por data, EXIF e backup inteligente', href: '/galeria', icon: 'photo_library', category: 'Arquivos' },
  { id: 'resumo', label: 'Resumo Público', desc: 'Cartão de apresentação pessoal', href: '/resumo', icon: 'badge', category: 'Identidade' },
  { id: 'curriculo', label: 'Currículo & Certificados', desc: 'Formação, experiência e documentos verificados', href: '/curriculo', icon: 'school', category: 'Identidade' },
  { id: 'portfolio', label: 'Portfólio & Vitrine', desc: 'Álbuns, clipagens e mural curado', href: '/portfolio', icon: 'auto_awesome', category: 'Identidade' },
  { id: 'notificacoes', label: 'Configurar Notificações', desc: 'Lembretes de tarefas e autocuidado', href: '/configurar-notificacoes', icon: 'notifications', category: 'Ajustes' },
  { id: 'avancadas', label: 'Configurações Avançadas', desc: 'Módulos, filtros e preferências', href: '/configuracoes-avancadas', icon: 'tune', category: 'Ajustes' },
  { id: 'bug', label: 'Relatar Bug / Feedback', desc: 'Enviar erro ou sugestão para a equipe', href: '/relatar-bug', icon: 'report', category: 'Suporte' },
];

export function AurtisticSpotlightModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SPOTLIGHT_ITEMS;
    return SPOTLIGHT_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-app">
          <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary)]">
            search
          </span>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) {
                router.push(filtered[0].href);
                onClose();
              }
            }}
            placeholder="Buscar no Aurtistic (tarefas, cofre, gestão, studio, currículo...)"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
          />
          <kbd className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-mono text-fg-muted">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-xs text-fg-muted">
              Nenhum atalho encontrado para &quot;{query}&quot;.
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  router.push(item.href);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary)]">
                    {item.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-fg block truncate">{item.label}</span>
                  <span className="text-[11px] text-fg-muted block truncate">{item.desc}</span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-app border border-border-subtle text-fg-muted">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

