// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { normalizeOrgBrandSlug, ORG_BRAND_PRESETS } from '@/lib/org-brand-tokens';

export interface OrgOption {
  id: string;
  name: string;
  slug?: string;
  role?: string;
  avatar_url?: string | null;
  brand_config?: any;
}

export interface OrganizationMaterialSelectorProps {
  organizations: OrgOption[];
  selectedOrgId: string | null;
  onSelectOrg: (orgId: string | null) => void;
  onCreateOrg?: () => void;
  onJoinWithCode?: () => void;
  allowPersonal?: boolean;
  personalLabel?: string;
  personalAvatarUrl?: string | null;
  className?: string;
  compact?: boolean;
  hideTriggerLogo?: boolean;
}

export function OrganizationMaterialSelector({
  organizations,
  selectedOrgId,
  onSelectOrg,
  onCreateOrg,
  onJoinWithCode,
  allowPersonal = false,
  personalLabel = 'Meu Cofre Pessoal',
  personalAvatarUrl = null,
  className = '',
  compact = false,
  hideTriggerLogo = false,
}: OrganizationMaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Fecha no Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const isPersonalActive = allowPersonal && (selectedOrgId === null || selectedOrgId === 'personal');
  const activeOrg = organizations.find((o) => o.id === selectedOrgId) || (allowPersonal && isPersonalActive ? null : organizations[0]);

  const getOrgSlug = (org?: OrgOption | null) => {
    if (!org) return 'labdiv';
    return normalizeOrgBrandSlug(org.slug || (org.name?.toLowerCase().includes('show') ? 'show-da-fisica' : org.name?.toLowerCase().includes('hacker') ? 'hs' : 'labdiv'));
  };

  const activeSlug = getOrgSlug(activeOrg);
  const activePreset = ORG_BRAND_PRESETS[activeSlug] || ORG_BRAND_PRESETS.labdiv;

  const renderMonogram = (org: OrgOption) => {
    const slug = getOrgSlug(org);
    if (slug === 'labdiv') {
      return (
        <div className="w-full h-full flex items-center justify-center font-black text-[11px] text-white bg-gradient-to-br from-[#0F4780] to-[#049FFF]">
          <span className="text-white">L</span>
          <span className="text-[#FFCC00]">D</span>
        </div>
      );
    }
    if (slug === 'show-da-fisica') {
      return (
        <div className="w-full h-full flex items-center justify-center font-black text-[10px] text-white bg-black border border-[#0066ff]">
          <span className="text-[#ff1e1e]">S</span>
          <span className="text-[#00ff44]">F</span>
        </div>
      );
    }
    if (slug === 'hs') {
      return (
        <div className="w-full h-full flex items-center justify-center font-mono font-black text-[11px] text-[#00ff66] bg-black border border-[#00ff66]/40">
          &gt;_
        </div>
      );
    }
    if (org.avatar_url) {
      return <img src={org.avatar_url} alt={org.name} className="w-full h-full object-cover" />;
    }
    return (
      <div className="w-full h-full flex items-center justify-center font-black text-xs text-white bg-slate-800">
        {org.name.slice(0, 2).toUpperCase()}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Botão Gatilho Material Design 3 */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`group flex items-center gap-2.5 rounded-2xl border transition-all cursor-pointer ${
          compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
        } ${
          isPersonalActive
            ? 'bg-surface border-border-subtle hover:border-[#FFCC00]/50 shadow-sm'
            : 'bg-surface hover:bg-surface-hover shadow-md'
        }`}
        style={{
          borderColor: isPersonalActive
            ? undefined
            : `color-mix(in srgb, ${activePreset.primaryColor} 45%, var(--border-subtle, rgba(255,255,255,0.12)))`,
        }}
      >
        {/* Avatar / Monograma */}
        {!hideTriggerLogo && (
          <div className="relative shrink-0">
            <div
              className={`overflow-hidden rounded-xl border flex items-center justify-center ${
                compact ? 'w-7 h-7' : 'w-8 h-8'
              }`}
              style={{
                borderColor: isPersonalActive
                  ? '#FFCC00'
                  : `color-mix(in srgb, ${activePreset.primaryColor} 60%, transparent)`,
              }}
            >
              {isPersonalActive ? (
                personalAvatarUrl ? (
                  <img
                    src={personalAvatarUrl}
                    alt={personalLabel}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#FFCC00]/20 flex items-center justify-center text-[#FFCC00]">
                    <span className="material-symbols-outlined text-[18px]">person</span>
                  </div>
                )
              ) : activeOrg ? (
                renderMonogram(activeOrg)
              ) : (
                <span className="material-symbols-outlined text-[18px] text-fg-muted">domain</span>
              )}
            </div>
            {/* Indicador pulsante da IDV */}
            {!isPersonalActive && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black"
                style={{ backgroundColor: activePreset.primaryColor }}
              />
            )}
          </div>
        )}

        {/* Textos: Nome da Org + Badge de Cargo / Escopo */}
        <div className="flex flex-col text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-fg truncate max-w-[160px] sm:max-w-[220px]">
              {isPersonalActive ? personalLabel : activeOrg ? activeOrg.name : 'Selecionar Organização'}
            </span>
            {activeOrg?.role && !isPersonalActive && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-white/10 text-fg-secondary">
                {activeOrg.role === 'admin' ? 'Admin' : 'Membro'}
              </span>
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
              <span>{isPersonalActive ? 'Arquivos Privados' : `@${activeSlug}`}</span>
              {!isPersonalActive && (
                <div className="flex items-center gap-1 ml-1 opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activePreset.primaryColor }} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activePreset.secondaryColor }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ícone de Expansão M3 com rotação */}
        <span
          className={`material-symbols-outlined text-[18px] text-fg-muted group-hover:text-fg transition-transform duration-200 ml-auto ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Menu Popover M3 */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 left-0 mt-2 w-72 sm:w-80 rounded-2xl border bg-[#111622] p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          style={{
            borderColor: `color-mix(in srgb, ${activePreset.primaryColor} 35%, rgba(255,255,255,0.15))`,
            boxShadow: `0 16px 40px -10px color-mix(in srgb, ${activePreset.primaryColor} 25%, rgba(0,0,0,0.85))`,
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center justify-between">
            <span>Ambientes Disponíveis</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 font-mono">
              {organizations.length + (allowPersonal ? 1 : 0)}
            </span>
          </div>

          <div className="space-y-1 mt-1 max-h-64 overflow-y-auto no-scrollbar">
            {/* Opção Cofre Pessoal (se habilitado) */}
            {allowPersonal && (
              <button
                type="button"
                onClick={() => {
                  onSelectOrg(null);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer ${
                  isPersonalActive
                    ? 'bg-[#FFCC00]/15 text-white font-bold border border-[#FFCC00]/30'
                    : 'text-fg-secondary hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#FFCC00]/20 flex items-center justify-center text-[#FFCC00] shrink-0 overflow-hidden">
                    {personalAvatarUrl ? (
                      <img
                        src={personalAvatarUrl}
                        alt={personalLabel}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">person</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fg truncate">{personalLabel}</p>
                    <p className="text-[10px] text-fg-muted">Acesso exclusivo do seu perfil</p>
                  </div>
                </div>
                {isPersonalActive && (
                  <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">check_circle</span>
                )}
              </button>
            )}

            {/* Lista de Organizações */}
            {organizations.map((org) => {
              const isSelected = selectedOrgId === org.id;
              const slug = getOrgSlug(org);
              const preset = ORG_BRAND_PRESETS[slug] || ORG_BRAND_PRESETS.labdiv;

              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    onSelectOrg(org.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/10 text-white font-bold border'
                      : 'text-fg-secondary hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                  style={{
                    borderColor: isSelected
                      ? `color-mix(in srgb, ${preset.primaryColor} 50%, transparent)`
                      : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-white/10">
                      {renderMonogram(org)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-fg truncate">{org.name}</p>
                        {org.role && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-white/10 text-fg-secondary">
                            {org.role === 'admin' ? 'Admin' : 'Membro'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-fg-muted">
                        <span>@{slug}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span style={{ color: preset.primaryColor }}>{preset.badgeTag}</span>
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: preset.primaryColor }}
                    >
                      check_circle
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Rodapé M3 com Ações Rápidas Integradas */}
          {(onCreateOrg || onJoinWithCode) && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5">
              {onCreateOrg && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCreateOrg();
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-fg-secondary hover:text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">add_business</span>
                  <span>Nova Org</span>
                </button>
              )}
              {onJoinWithCode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onJoinWithCode();
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-fg-secondary hover:text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">key</span>
                  <span>Entrar com Código</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
