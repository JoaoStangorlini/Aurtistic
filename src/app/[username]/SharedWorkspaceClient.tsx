// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import ResumoClient from '@/components/dashboard/ResumoClient';
import CurriculoClient from '@/components/dashboard/CurriculoClient';
import PortfolioClient from '@/components/dashboard/PortfolioClient';
import type { PhotoInspectItem } from '@/components/portfolio/PhotoInspectModal';
import type { UserFileIndexRow } from '@/types';

interface SharedWorkspaceClientProps {
  profile: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  initialTab?: string;
  publicPhotos?: PhotoInspectItem[];
  publicDocs?: UserFileIndexRow[];
  publicSlug?: string;
  serverUrl?: string;
  creatorPalette?: string;
}

export default function SharedWorkspaceClient({
  profile,
  initialTab,
  publicPhotos = [],
  publicDocs = [],
  publicSlug,
  serverUrl,
  creatorPalette,
}: SharedWorkspaceClientProps) {
  // [ISOLAMENTO DE TEMA PÚBLICO]: Aplica a paleta do criador sem sobrescrever o localStorage do visitante
  React.useEffect(() => {
    if (!creatorPalette) return;
    const doc = document.documentElement;
    const previousPalette = doc.getAttribute('data-theme-palette');
    doc.setAttribute('data-theme-palette', creatorPalette);

    return () => {
      let visitorPalette = 'purple-gold';
      try {
        const raw = localStorage.getItem('aurtistic_theme_palette');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.palette) visitorPalette = parsed.palette;
        }
      } catch {}
      doc.setAttribute('data-theme-palette', visitorPalette || previousPalette || 'purple-gold');
    };
  }, [creatorPalette]);
  // Features config from user
  const activeTabs = profile?.features_config?.active || ['resumo', 'curriculo', 'portfolio'];
  const orderedTabs = profile?.features_config?.order || ['resumo', 'curriculo', 'portfolio'];
  const customLabels = profile?.features_config?.labels || {};
  const customLinks = profile?.features_config?.custom_links || {};

  // Dictionaries for labels and routes/types
  const defaultLabels: Record<string, string> = {
    resumo: 'Resumo',
    curriculo: 'Currículo',
    portfolio: 'Portfólio',
    extra: 'Link Extra',
  };

  // Filter out 'tasks' tab for security/privacy
  const visibleTabs = orderedTabs.filter(
    (tab: string) => activeTabs.includes(tab) && tab !== 'tasks'
  );

  const [activeTab, setActiveTab] = useState<string>(
    initialTab && visibleTabs.includes(initialTab)
      ? initialTab
      : initialTab === 'portfolio'
        ? 'portfolio'
        : visibleTabs[0] || 'resumo'
  );

  // Extract name/role for header from profile data
  let displayName = 'Espaço Aurtistic';
  let tagline = 'Portfólio & Resumo Profissional';

  try {
    if (profile?.resumo) {
      const parsedResumo =
        typeof profile.resumo === 'string' ? JSON.parse(profile.resumo) : profile.resumo;
      if (parsedResumo.title) displayName = parsedResumo.title;
      if (parsedResumo.tagline) tagline = parsedResumo.tagline;
    }
  } catch (e) {
    console.error('Error reading resumo header:', e);
  }

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'resumo':
        return (
          <ResumoClient
            initialProfile={profile}
            isReadOnly={true}
            favoritePhotos={publicPhotos.filter((p) => Boolean(p.is_favorite))}
            serverUrl={serverUrl}
          />
        );
      case 'curriculo':
        return (
          <CurriculoClient
            initialProfile={profile}
            isReadOnly={true}
            curriculumDocs={publicDocs}
            serverUrl={serverUrl}
          />
        );
      case 'portfolio':
        return (
          <PortfolioClient
            initialProfile={profile}
            isReadOnly={true}
            portfolioPhotos={publicPhotos}
            publicSlug={publicSlug}
            serverUrl={serverUrl}
          />
        );
      default:
        return (
          <div className="p-8 text-center bg-surface border border-border-subtle rounded-2xl max-w-md mx-auto mt-12">
            <span className="material-symbols-outlined text-[48px] text-[#FFCC00] mb-3">info</span>
            <h3 className="text-lg font-bold text-fg mb-1">Nenhum conteúdo selecionado</h3>
            <p className="text-sm text-fg-secondary">Navegue pelas abas acima para explorar este espaço.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      {/* Shared Space Navbar Header */}
      <header className="w-full bg-surface border-b border-border-subtle sticky top-0 z-40 px-4 md:px-8 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-[#FFCC00] font-black uppercase tracking-widest bg-[#FFCC00]/10 px-2.5 py-1 rounded-md">Espaço Compartilhado</span>
            <h2 className="text-2xl font-black text-fg font-['Bukra'] tracking-tight mt-1">{displayName}</h2>
            <p className="text-xs text-fg-muted mt-0.5">{tagline}</p>
          </div>

          {/* Tabs Navigation */}
          {visibleTabs.length > 0 && (
            <nav className="hidden md:flex flex-wrap gap-2">
              {visibleTabs.map((key: string) => {
                const isSelected = activeTab === key;
                const label = (key === 'resumo' && (!customLabels[key] || customLabels[key] === 'Cartão de Visitas'))
                  ? 'Resumo'
                  : (customLabels[key] || defaultLabels[key] || key);

                if (key === 'extra') {
                  const targetUrl = customLinks.extra || '#';
                  return (
                    <a
                      key={key}
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-surface-hover hover:bg-[#3D3D3D] text-fg-secondary hover:text-[#FFCC00] border border-border-subtle transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {label}
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  );
                }

                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-[var(--accent-primary)] text-white border-[#9D4EDD] shadow-md shadow-[#9D4EDD]/10'
                        : 'bg-surface-hover text-fg-secondary border-border-subtle hover:text-fg hover:bg-surface-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto h-full pb-20 md:pb-0">
          {renderActiveTabContent()}
        </div>
      </main>

      {/* Mobile Bottom Floating Pill Nav */}
      {visibleTabs.length > 0 && (
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-surface/95 backdrop-blur-xl border border-border-subtle rounded-full p-2 flex items-center gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {visibleTabs.map((key: string) => {
              const isSelected = activeTab === key;
              const label = customLabels[key] || defaultLabels[key] || key;

              const tabIcons: Record<string, string> = {
                resumo: 'home',
                curriculo: 'contact_page',
                portfolio: 'photo_camera',
                extra: 'link'
              };
              const icon = tabIcons[key] || 'link';

              if (key === 'extra') {
                const targetUrl = customLinks.extra || '#';
                return (
                  <a
                    key={key}
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center rounded-full text-fg-muted hover:text-fg px-3 py-2.5"
                  >
                    <span className="material-symbols-outlined text-[22px]">{icon}</span>
                  </a>
                );
              }

              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                    isSelected 
                      ? 'bg-[#9D4EDD]/20 text-[#9D4EDD] px-5 py-2.5 gap-2' 
                      : 'text-fg-muted hover:text-fg px-3 py-2.5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px]">{icon}</span>
                  {isSelected && <span className="text-xs font-bold whitespace-nowrap">{label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
