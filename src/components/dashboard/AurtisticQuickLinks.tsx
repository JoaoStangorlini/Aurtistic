// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { saveQuickLinks } from '@/app/(dashboard)/actions';
import { systemLinks, CopyableQuickLink } from './QuickLinks';
import { saveLinksToCache, getLinksFromCache } from '@/lib/offlineSync';

export interface QuickLink {
  name: string;
  href: string;
  isPinned?: boolean;
}

const STORAGE_KEY = 'aurtistic_quick_links_expanded';

function getStoredExpanded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AurtisticQuickLinks({
  initialLinks,
  userId,
}: {
  initialLinks: QuickLink[];
  userId?: string;
}) {
  const [links, setLinks] = useState<QuickLink[]>(initialLinks);
  const [isEditing, setIsEditing] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkHref, setNewLinkHref] = useState('');

  const [isExpanded, setIsExpanded] = useState<boolean>(getStoredExpanded);
  const openedTemporarilyByTourRef = React.useRef(false);

  const toggleExpanded = () => {
    openedTemporarilyByTourRef.current = false;
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleEnsureOpen = (e: Event) => {
      const isTour = (e as CustomEvent)?.detail?.isTour;
      if (!isExpanded) {
        if (isTour) openedTemporarilyByTourRef.current = true;
        setIsExpanded(true);
      }
    };
    const handleCloseIfTemporary = () => {
      if (openedTemporarilyByTourRef.current) {
        setIsExpanded(false);
        openedTemporarilyByTourRef.current = false;
      }
    };
    window.addEventListener('aurtistic:ensure-quick-links-open', handleEnsureOpen);
    window.addEventListener('aurtistic:close-quick-links-if-temporary', handleCloseIfTemporary);
    return () => {
      window.removeEventListener('aurtistic:ensure-quick-links-open', handleEnsureOpen);
      window.removeEventListener('aurtistic:close-quick-links-if-temporary', handleCloseIfTemporary);
    };
  }, [isExpanded]);

  useEffect(() => {
    const syncLinks = async () => {
      if (typeof window !== 'undefined' && window.navigator.onLine) {
        if (initialLinks && initialLinks.length > 0) {
          await saveLinksToCache(initialLinks);
        }
      } else {
        const cached = await getLinksFromCache();
        if (cached && cached.length > 0) {
          setLinks(cached);
        }
      }
    };
    void syncLinks();
  }, [initialLinks]);

  const handleSave = async (updatedLinks: QuickLink[]) => {
    setLinks(updatedLinks);
    try {
      await saveQuickLinks(updatedLinks).catch(() => console.log('Offline: links update queued'));
      await saveLinksToCache(updatedLinks);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      alert('Erro ao salvar links: ' + e.message);
    }
  };

  const addLink = () => {
    if (!newLinkName || !newLinkHref) return;
    const updated = [...links, { name: newLinkName.trim(), href: newLinkHref.trim() }];
    void handleSave(updated);
    setNewLinkName('');
    setNewLinkHref('');
  };

  const removeLink = (index: number) => {
    const updated = links.filter((_, i) => i !== index);
    void handleSave(updated);
  };

  const togglePin = (index: number) => {
    const updated = links.map((l, i) => (i === index ? { ...l, isPinned: !l.isPinned } : l));
    void handleSave(updated);
  };

  const isPrivilegedUser =
    userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
    userId === '7dcfe172-1cf0-4389-9abd-f340b1408386';

  // Até 4 links em destaque no modo compacto, priorizando fixados/favoritados
  const pinnedLinks = links.filter((l) => l.isPinned);
  const unpinnedLinks = links.filter((l) => !l.isPinned);
  const compactLinks = [...pinnedLinks, ...unpinnedLinks].slice(0, 4);

  return (
    <div
      data-tour="quick-links-menu"
      className="mb-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] shadow-sm transition-all overflow-hidden"
    >
      {/* Barra de Topo Compacta (Modo Default h-11) */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 min-h-[44px] gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={toggleExpanded}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-1 px-2 rounded-lg hover:bg-[var(--surface-hover)]"
            title={isExpanded ? 'Recolher menu de links' : 'Expandir todos os links'}
          >
            <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary)]">
              link
            </span>
            <span>Links Rápidos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-hover)] text-[var(--text-secondary)]">
              {links.length}
            </span>
            <span className="material-symbols-outlined text-[18px] transition-transform duration-200">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {/* Chips de Acesso Rápido em 1-Clique no Modo Compacto */}
          {!isExpanded && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {compactLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded-md bg-[var(--surface-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors"
                >
                  <span className="truncate max-w-[120px]">{link.name}</span>
                  <span className="material-symbols-outlined text-[12px] opacity-60">open_in_new</span>
                </a>
              ))}
              {links.length > 4 && (
                <button
                  type="button"
                  onClick={toggleExpanded}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  +{links.length - 4} mais
                </button>
              )}
            </div>
          )}
        </div>

        {/* Ações da Direita */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!isExpanded) setIsExpanded(true);
              setIsEditing((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              isEditing
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] shadow-sm'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)]'
            }`}
            title="Gerenciar e adicionar links"
          >
            <span className="material-symbols-outlined text-[14px]">
              {isEditing ? 'check' : 'add'}
            </span>
            <span className="hidden sm:inline">{isEditing ? 'Concluir' : 'Adicionar'}</span>
          </button>
        </div>
      </div>

      {/* Painel Expansível Completo */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] p-3 sm:p-4 bg-[var(--surface-secondary)]/50 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Links do Servidor e LabDiv (Admin/LabDiv) */}
          {isPrivilegedUser && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mr-2">
                Links Gerais:
              </span>
              {systemLinks.map((link) => (
                <CopyableQuickLink
                  key={link.name}
                  name={link.name}
                  href={link.href}
                  icon={link.icon}
                  hoverClass={link.hoverClass}
                />
              ))}
            </div>
          )}

          {/* Links Customizados do Usuário */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mr-2">
              Meus Links:
            </span>

            {links.length === 0 ? (
              <span className="text-xs text-[var(--text-muted)] italic">
                Nenhum link adicionado ainda.
              </span>
            ) : (
              links.map((link, idx) => (
                <CopyableQuickLink
                  key={idx}
                  name={link.name}
                  href={link.href}
                  icon={<span className="material-symbols-outlined text-[16px]">link</span>}
                  isEditing={isEditing}
                  isPinned={link.isPinned}
                  onTogglePin={() => togglePin(idx)}
                  onRemove={() => removeLink(idx)}
                />
              ))
            )}
          </div>

          {/* Formulário Inline de Novo Link */}
          {isEditing && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-subtle)] w-full max-w-xl">
              <input
                type="text"
                placeholder="Nome (ex: Meu Drive)"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                className="bg-[var(--surface-secondary)] text-sm text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none flex-1 min-w-[140px]"
              />
              <input
                type="url"
                placeholder="URL (https://...)"
                value={newLinkHref}
                onChange={(e) => setNewLinkHref(e.target.value)}
                className="bg-[var(--surface-secondary)] text-sm text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none flex-1 min-w-[180px]"
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!newLinkName.trim() || !newLinkHref.trim()}
                className="bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-3.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
              >
                <span className="material-symbols-outlined text-[14px]">save</span>
                Salvar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
