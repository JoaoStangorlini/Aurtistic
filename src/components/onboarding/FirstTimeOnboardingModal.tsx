// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useCoachMarks } from './CoachMarksProvider';
import { THEME_PALETTES, ThemePaletteId, ThemeMode } from '@/lib/theme-config';
import {
  ModulesConfig,
  MODULES_STORAGE_KEY,
  MODULE_PRESETS,
  getInitialModulesConfig,
} from '@/lib/modules-config';
import { updateModulesConfigAction } from '@/app/(dashboard)/actions';

const ONBOARDING_KEY = 'aurtistic_onboarding_completed_v2';
const ONBOARDING_DATE_KEY = 'aurtistic_onboarding_last_seen_date';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface FirstTimeOnboardingModalProps {
  userId?: string | null;
  hasConfiguredModules?: boolean;
}

export function evaluateOnboardingTrigger(
  userId?: string | null,
  hasConfiguredModules?: boolean
): boolean {
  if (typeof window === 'undefined') return false;
  // Se o usuário não está autenticado, nunca abre o onboarding
  if (!userId) return false;

  // Se o usuário já possui configuração de módulos no perfil, não abre automaticamente
  if (hasConfiguredModules) return false;

  try {
    const userCompleted = localStorage.getItem(`aurtistic_onboarding_completed_${userId}`);
    const userDismissed = localStorage.getItem(`aurtistic_onboarding_dismissed_${userId}`);
    if (userCompleted || userDismissed) return false;

    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) return true;

    const lastSeenStr = localStorage.getItem(ONBOARDING_DATE_KEY);
    if (!lastSeenStr) return false;

    const lastSeenTime = new Date(lastSeenStr).getTime();
    if (Number.isNaN(lastSeenTime)) return false;

    return Date.now() - lastSeenTime > THIRTY_DAYS_MS;
  } catch {
    return false;
  }
}

export function FirstTimeOnboardingModal({
  userId,
  hasConfiguredModules = false,
}: FirstTimeOnboardingModalProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'modules' | 'theme'>('modules');
  const [isSaving, setIsSaving] = useState(false);
  const { mode, palette, setThemeMode, setThemePalette } = useTheme();
  const { startTour } = useCoachMarks();
  const router = useRouter();
  const pathname = usePathname();

  const [modulesConfig, setModulesConfig] = useState<ModulesConfig>(getInitialModulesConfig);

  useEffect(() => {
    if (evaluateOnboardingTrigger(userId, hasConfiguredModules)) {
      setIsOpen(true);
    }
  }, [userId, hasConfiguredModules]);

  useEffect(() => {
    const handleRelaunch = () => {
      setModulesConfig(getInitialModulesConfig());
      setActiveTab('modules');
      setIsOpen(true);
    };
    window.addEventListener('aurtistic:relaunch-onboarding', handleRelaunch);
    return () => window.removeEventListener('aurtistic:relaunch-onboarding', handleRelaunch);
  }, []);

  const handleApplyPreset = (presetConfig: ModulesConfig) => {
    setModulesConfig({ ...presetConfig });
  };

  const getRouteForModule = (key: string): string => {
    switch (key) {
      case 'tasks':
        return '/';
      case 'servidor':
        return '/servidor';
      case 'portfolio':
        return '/portfolio';
      case 'resumo':
        return '/resumo';
      case 'curriculo':
        return '/curriculo';
      default:
        return '/';
    }
  };

  const handleToggleModule = (key: keyof Omit<ModulesConfig, 'defaultRoute'>) => {
    setModulesConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Se a rota padrão atual ficou desativada, redireciona para a primeira disponível
      if (!next[key] && next.defaultRoute === getRouteForModule(key)) {
        if (next.tasks) next.defaultRoute = '/';
        else if (next.servidor) next.defaultRoute = '/servidor';
        else if (next.portfolio) next.defaultRoute = '/portfolio';
        else if (next.resumo) next.defaultRoute = '/resumo';
        else if (next.curriculo) next.defaultRoute = '/curriculo';
      }
      return next;
    });
  };

  const handleSave = async (launchTour = false) => {
    setIsSaving(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      localStorage.setItem(ONBOARDING_DATE_KEY, new Date().toISOString());
      localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modulesConfig));
    } catch (e) {
      console.error('Erro ao salvar preferências no localStorage:', e);
    }

    try {
      await updateModulesConfigAction(modulesConfig);
    } catch (e) {
      console.error('Erro ao sincronizar preferências no banco:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aurtistic:modules-changed', { detail: modulesConfig })
      );
    }

    setIsSaving(false);
    setIsOpen(false);

    // Se o usuário desativou a tela onde se encontra atualmente, navega para a rota padrão
    const isCurrentRouteDisabled =
      (pathname === '/' && !modulesConfig.tasks) ||
      (pathname === '/servidor' && !modulesConfig.servidor) ||
      (pathname === '/portfolio' && !modulesConfig.portfolio) ||
      (pathname === '/resumo' && !modulesConfig.resumo) ||
      (pathname === '/curriculo' && !modulesConfig.curriculo);

    if (isCurrentRouteDisabled && modulesConfig.defaultRoute) {
      router.push(modulesConfig.defaultRoute);
    }

    if (launchTour) {
      setTimeout(() => startTour(), 250);
    }
  };

  if (!isOpen) return null;

  // Lista de módulos com descrição amigável e ícones
  const moduleCards: Array<{
    key: keyof Omit<ModulesConfig, 'defaultRoute'>;
    title: string;
    desc: string;
    icon: string;
    color: string;
  }> = [
    {
      key: 'tasks',
      title: 'Tarefas & Planejamento',
      desc: 'Lista, semanal, mensal e filtros avançados',
      icon: 'task_alt',
      color: 'text-[#9D4EDD]',
    },
    {
      key: 'servidor',
      title: 'Gestão & Servidor',
      desc: 'Gestão de equipes, reuniões LabDiv e cofre 25 GB',
      icon: 'domain',
      color: 'text-teal-400',
    },
    {
      key: 'selfCare',
      title: 'Autocuidado & Lembretes',
      desc: 'Hidratação, refeições e pausas sensoriais 20-20-20',
      icon: 'spa',
      color: 'text-emerald-400',
    },
    {
      key: 'portfolio',
      title: 'Portfólio Autoral',
      desc: 'Galeria fotográfica pública e acervo de obras',
      icon: 'photo_camera',
      color: 'text-amber-400',
    },
    {
      key: 'curriculo',
      title: 'Currículo Técnico',
      desc: 'Histórico acadêmico, formação e certificações',
      icon: 'badge',
      color: 'text-blue-400',
    },
    {
      key: 'resumo',
      title: 'Resumo Profissional',
      desc: 'Apresentação pessoal e cartão de visitas',
      icon: 'account_circle',
      color: 'text-purple-400',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[190] flex items-center justify-center p-3 sm:p-6 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Halo decorativo de fundo */}
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-[#9D4EDD]/15 blur-3xl pointer-events-none" />

        {/* Topo do Modal: Logo, Título e Botão Fechar (X) */}
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <ThemedAurtisticLogo size="md" showTagline={false} />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-fg leading-tight">
                Personalizar seu Espaço
              </h2>
              <p className="text-xs text-fg-muted leading-tight">
                Escolha suas ferramentas e personalize a experiência visual
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full border border-border-subtle bg-app hover:border-[var(--accent-secondary)] hover:text-[#FFCC00] text-fg-muted flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Fechar"
            aria-label="Fechar modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Abas Rápidas: Módulos vs Tema */}
        <div className="flex items-center gap-2 pt-4 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('modules')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'modules'
                ? 'bg-[var(--accent-primary)] text-[var(--on-accent-primary)] shadow-sm'
                : 'bg-app text-fg-muted hover:text-fg border border-border-subtle hover:bg-surface-hover'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Módulos & Espaços</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('theme')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'theme'
                ? 'bg-[var(--accent-primary)] text-[var(--on-accent-primary)] shadow-sm'
                : 'bg-app text-fg-muted hover:text-fg border border-border-subtle hover:bg-surface-hover'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">palette</span>
            <span>Tema & Aparência</span>
          </button>
        </div>

        {/* Conteúdo com rolagem suave */}
        <div className="flex-1 overflow-y-auto py-3 space-y-5 custom-scrollbar pr-1">
          {activeTab === 'modules' ? (
            <>
              {/* Presets de 1 Clique */}
              <div className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                  Perfis Recomendados (1 Toque)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MODULE_PRESETS.filter((p) => p.id !== 'server-portfolio').map((p) => {
                    const isSelected =
                      modulesConfig.tasks === p.config.tasks &&
                      modulesConfig.selfCare === p.config.selfCare &&
                      modulesConfig.resumo === p.config.resumo &&
                      modulesConfig.portfolio === p.config.portfolio &&
                      modulesConfig.curriculo === p.config.curriculo &&
                      modulesConfig.servidor === p.config.servidor;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleApplyPreset(p.config)}
                        className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] ring-1 ring-[#9D4EDD]'
                            : 'bg-app border-border-subtle hover:bg-surface-hover text-fg-secondary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                          {p.icon}
                        </span>
                        <span className="text-xs font-bold text-fg line-clamp-1">{p.name}</span>
                        <span className="text-[10px] text-fg-muted line-clamp-1">
                          {p.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grid de Módulos com Switches */}
              <div className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                  Ferramentas Ativas
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {moduleCards.map((m) => {
                    const isChecked = modulesConfig[m.key];
                    return (
                      <div
                        key={m.key}
                        onClick={() => handleToggleModule(m.key)}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-surface border-border-strong shadow-sm'
                            : 'bg-app border-border-subtle opacity-50 hover:opacity-80'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isChecked ? 'bg-white/5 border border-white/10' : 'bg-black/20'
                            }`}
                          >
                            <span className={`material-symbols-outlined text-[20px] ${m.color}`}>
                              {m.icon}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-fg truncate">{m.title}</h4>
                            <p className="text-[10px] text-fg-muted line-clamp-1 mt-0.5">
                              {m.desc}
                            </p>
                          </div>
                        </div>

                        {/* Switch visual */}
                        <div
                          className={`w-10 h-5 rounded-full flex items-center p-0.5 transition-colors shrink-0 ${
                            isChecked ? 'bg-[#9D4EDD]' : 'bg-surface-hover'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              isChecked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rota Padrão / Início */}
              <div className="space-y-1.5 pt-1 border-t border-border-subtle">
                <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                  Página Inicial Padrão:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { route: '/', name: 'Tarefas', enabled: modulesConfig.tasks },
                    { route: '/servidor', name: 'Servidor / Cofre', enabled: modulesConfig.servidor },
                    { route: '/labdiv', name: 'Organizações', enabled: modulesConfig.servidor },
                    { route: '/portfolio', name: 'Portfólio', enabled: modulesConfig.portfolio },
                    { route: '/resumo', name: 'Resumo', enabled: modulesConfig.resumo },
                    { route: '/curriculo', name: 'Currículo', enabled: modulesConfig.curriculo },
                  ]
                    .filter((r) => r.enabled)
                    .map((r) => (
                      <button
                        key={r.route}
                        type="button"
                        onClick={() =>
                          setModulesConfig((prev) => ({ ...prev, defaultRoute: r.route }))
                        }
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          modulesConfig.defaultRoute === r.route
                            ? 'bg-[var(--accent-secondary)] text-[var(--on-accent-secondary)] border-[var(--accent-secondary)] shadow-sm'
                            : 'bg-app text-fg-secondary border-border-subtle hover:bg-surface-hover'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Aba de Tema: Iluminação e Paletas */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                    Modo de Iluminação
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'system', name: 'Automático', icon: 'settings_brightness' },
                      { id: 'dark', name: 'Escuro', icon: 'dark_mode' },
                      { id: 'light', name: 'Claro', icon: 'light_mode' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setThemeMode(m.id as ThemeMode)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          mode === m.id
                            ? 'bg-[var(--accent-primary)] text-[var(--on-accent-primary)] border-[var(--accent-primary)] shadow-sm'
                            : 'bg-app text-fg-secondary border-border-subtle hover:bg-surface-hover'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                        <span className="text-xs font-bold">{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border-subtle">
                  <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                    Paleta Bicolor Calibrada (WCAG AA)
                  </span>
                  <div className="space-y-1.5">
                    {Object.entries(THEME_PALETTES).map(([key, pal]) => {
                      const isSelected = palette === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setThemePalette(key as ThemePaletteId)}
                          className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-surface border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
                              : 'bg-app border-border-subtle hover:bg-surface-hover'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex items-center -space-x-1.5">
                              <span
                                className="w-5 h-5 rounded-full border border-black/30 shadow-sm"
                                style={{ backgroundColor: pal.preview.primary }}
                              />
                              <span
                                className="w-5 h-5 rounded-full border border-black/30 shadow-sm"
                                style={{ backgroundColor: pal.preview.secondary }}
                              />
                            </div>
                            <span className="text-xs font-bold text-fg">{pal.name}</span>
                          </div>

                          {isSelected && (
                            <span className="material-symbols-outlined text-[18px] text-[#9D4EDD]">
                              check_circle
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé: Ações e Botão Salvar */}
        <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-[#FFCC00] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">help_outline</span>
            <span>Ver Tutorial Guiado</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-muted hover:text-fg hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(false)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-md shadow-[#9D4EDD]/20 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>{isSaving ? 'Salvando...' : 'Salvar Preferências'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
