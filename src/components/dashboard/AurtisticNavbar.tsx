// Este programa é um software livre (Licença AGPLv3)
'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import { logoutAurtistic } from '@/app/(dashboard)/aurtistic/actions';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useCoachMarks } from '@/components/onboarding/CoachMarksProvider';
import { ThemeDropdownSection } from '@/components/theme/ThemeDropdownSection';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import { ModulesConfig, getInitialModulesConfig } from '@/lib/modules-config';

export default function AurtisticNavbar() {
  const { resolvedMode, paletteDef } = useTheme();
  const { startTour } = useCoachMarks();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIdentityDropdownOpen, setIsIdentityDropdownOpen] = useState(false);
  const [isMobileIdentityOpen, setIsMobileIdentityOpen] = useState(false);
  const identityDropdownRef = useRef<HTMLDivElement>(null);
  const [modulesConfig, setModulesConfig] = useState<ModulesConfig>(getInitialModulesConfig);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const handleModulesChanged = (e: any) => {
      if (e?.detail) setModulesConfig(e.detail);
      else setModulesConfig(getInitialModulesConfig());
    };
    window.addEventListener('aurtistic:modules-changed', handleModulesChanged);
    return () => window.removeEventListener('aurtistic:modules-changed', handleModulesChanged);
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from('user_profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) setProfile(data);
      });
    }
  }, [user, supabase]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          setUser(sessionData.session.user);
        } else {
          const { getProfileFromCache } = await import('@/lib/offlineSync');
          const cached = await getProfileFromCache();
          if (cached) {
            setUser({ id: cached.id, user_metadata: cached });
            setProfile(cached);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
      }
    }).catch(() => {});

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (identityDropdownRef.current && !identityDropdownRef.current.contains(event.target as Node)) {
        setIsIdentityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [supabase]);

  const handleLogout = async () => {
    try {
      await logoutAurtistic();
    } catch (e) {
      console.error(e);
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  const openAuthorProjects = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: 'https://aurtistic.vercel.app/' });
      } else {
        window.open('https://aurtistic.vercel.app/', '_blank');
      }
    } catch (e) {
      window.open('https://aurtistic.vercel.app/', '_blank');
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';

  const customLabels = profile?.features_config?.labels || {};
  const customLinks = profile?.features_config?.custom_links || {};

  const tabMetadata: Record<string, { name: string; href: string }> = {
    tasks: { name: customLabels.tasks || 'Tarefas', href: '/' },
    resumo: { 
      name: (!customLabels.resumo || customLabels.resumo === 'Cartão de Visitas') ? 'Resumo' : customLabels.resumo, 
      href: '/resumo' 
    },
    curriculo: { name: customLabels.curriculo || 'Currículo', href: '/curriculo' },
    portfolio: { name: customLabels.portfolio || 'Portfólio', href: '/portfolio' },
    servidor: { name: customLabels.servidor || 'Meus Arquivos', href: '/servidor' },
    organizacoes: { name: customLabels.organizacoes || 'Gestão', href: '/servidor' },
    extra: { name: customLabels.extra || 'Aba Extra', href: customLinks.extra || '#' }
  };

  const configuredActive = profile?.features_config?.active;
  const activeTabs = configuredActive
    ? (configuredActive.includes('organizacoes') ? configuredActive : [...configuredActive, 'organizacoes'])
    : ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'];

  const configuredOrder = profile?.features_config?.order;
  const orderedTabs = configuredOrder
    ? (configuredOrder.includes('organizacoes') ? configuredOrder : [...configuredOrder, 'organizacoes'])
    : ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes', 'extra'];

  const visibleTabs = orderedTabs.filter((t: string) => {
    if (!activeTabs.includes(t)) return false;
    if (t === 'tasks' && !modulesConfig.tasks) return false;
    if (t === 'resumo' && !modulesConfig.resumo) return false;
    if (t === 'curriculo' && !modulesConfig.curriculo) return false;
    if (t === 'portfolio' && !modulesConfig.portfolio) return false;
    if (t === 'servidor' && !modulesConfig.servidor) return false;
    return true;
  });

  // Macro-grupos de navegação para máxima clareza e eliminação de sobrecarga
  const hasTasks = modulesConfig.tasks && activeTabs.includes('tasks');
  const hasOrgs = modulesConfig.servidor && activeTabs.includes('organizacoes');
  const hasServidor = modulesConfig.servidor && activeTabs.includes('servidor');
  const hasOrgsOrServer = hasOrgs || hasServidor;

  const isOrgsActive = pathname === '/labdiv' || pathname === '/organizacoes' || pathname === '/servidor';
  // Cofre de Arquivos é sempre a landing padrão da aba Gestão; LabDiv é sub-aba dentro do Cofre
  const orgsHref = hasOrgsOrServer ? '/servidor' : '/labdiv';
  const orgsLabel = customLabels.organizacoes || 'Gestão';

  const hasPortfolio = modulesConfig.portfolio && activeTabs.includes('portfolio');
  const hasCurriculo = modulesConfig.curriculo && activeTabs.includes('curriculo');
  const hasResumo = modulesConfig.resumo && activeTabs.includes('resumo');

  const identityItems = [
    hasPortfolio && {
      key: 'portfolio',
      name: customLabels.portfolio || 'Portfólio',
      href: '/portfolio',
      desc: 'Galeria visual e projetos autorais',
      icon: 'photo_camera',
    },
    hasCurriculo && {
      key: 'curriculo',
      name: customLabels.curriculo || 'Currículo',
      href: '/curriculo',
      desc: 'Histórico acadêmico e formação',
      icon: 'contact_page',
    },
    hasResumo && {
      key: 'resumo',
      name: (!customLabels.resumo || customLabels.resumo === 'Cartão de Visitas') ? 'Resumo' : customLabels.resumo,
      href: '/resumo',
      desc: 'Apresentação e cartão de visitas',
      icon: 'badge',
    },
  ].filter(Boolean) as { key: string; name: string; href: string; desc: string; icon: string }[];

  const isIdentityActive = identityItems.some(item => pathname === item.href);

  return (
    <>
      <header className="sticky top-0 w-full z-50 bg-app/90 backdrop-blur-xl border-b border-border-subtle shrink-0">
        <div className="flex justify-between items-center px-4 md:px-8 py-2 w-full gap-4">
        
        {/* Left: Themed Chameleon Logo */}
        <div className="flex justify-start items-center gap-2">
          <ThemedAurtisticLogo size="md" showTagline={false} linkToHome={true} />
        </div>


        {/* Center: Navigation Links Agrupados (Enxutos & Funcionais) */}
        <nav className="hidden md:flex justify-center gap-5 lg:gap-8 items-center flex-1 mx-4" data-tour="nav-tabs">
          {/* 1. Tarefas */}
          {hasTasks && (
            <Link 
              href="/"
              className={`font-medium transition-colors ${
                pathname === '/' 
                  ? 'text-[var(--accent-primary)] font-bold border-b-[3px] border-[var(--accent-secondary)] pb-1' 
                  : 'text-fg-secondary hover:text-[var(--accent-primary)]'
              }`}
            >
              {customLabels.tasks || 'Tarefas'}
            </Link>
          )}

          {/* 2. Organizações & Servidor (Unificado em uma aba) */}
          {hasOrgsOrServer && (
            <Link 
              href={orgsHref}
              className={`font-medium transition-colors ${
                isOrgsActive
                  ? 'text-[var(--accent-primary)] font-bold border-b-[3px] border-[var(--accent-secondary)] pb-1' 
                  : 'text-fg-secondary hover:text-[var(--accent-primary)]'
              }`}
            >
              {orgsLabel}
            </Link>
          )}

          {/* 3. Identidade / Portfólio (Menu Unificado se houver mais de um módulo ativo) */}
          {identityItems.length === 1 && (
            <Link 
              href={identityItems[0].href}
              data-tour="nav-identity-dropdown"
              className={`font-medium transition-colors ${
                pathname === identityItems[0].href 
                  ? 'text-[var(--accent-primary)] font-bold border-b-[3px] border-[var(--accent-secondary)] pb-1' 
                  : 'text-fg-secondary hover:text-[var(--accent-primary)]'
              }`}
            >
              {identityItems[0].name}
            </Link>
          )}

          {identityItems.length > 1 && (
            <div className="relative" ref={identityDropdownRef} data-tour="nav-identity-dropdown">
              <button
                type="button"
                onClick={() => setIsIdentityDropdownOpen(!isIdentityDropdownOpen)}
                className={`font-medium transition-colors flex items-center gap-1 cursor-pointer py-1 ${
                  isIdentityActive 
                    ? 'text-[var(--accent-primary)] font-bold border-b-[3px] border-[var(--accent-secondary)] pb-1' 
                    : 'text-fg-secondary hover:text-[var(--accent-primary)]'
                }`}
              >
                <span>Identidade</span>
                <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isIdentityDropdownOpen ? 'rotate-180 text-[var(--accent-secondary)]' : ''}`}>
                  expand_more
                </span>
              </button>

              {isIdentityDropdownOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden py-1.5 z-50">
                  <div className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-fg-muted border-b border-border-subtle">
                    Apresentação & Perfil
                  </div>
                  {identityItems.map((item) => {
                    const isItemActive = pathname === item.href;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setIsIdentityDropdownOpen(false)}
                        className={`flex items-start gap-3 px-3.5 py-2.5 hover:bg-surface-hover transition-colors ${
                          isItemActive ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'text-fg'
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[20px] mt-0.5 ${isItemActive ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-secondary)]'}`}>
                          {item.icon}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold leading-tight">{item.name}</span>
                          <span className="text-[10px] text-fg-muted leading-tight mt-0.5">{item.desc}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. Aba Extra (se configurada e externa/customizada) */}
          {activeTabs.includes('extra') && (
            <a 
              href={customLinks.extra || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fg-secondary hover:text-[var(--accent-primary)] transition-colors"
            >
              {customLabels.extra || 'Aba Extra'}
            </a>
          )}
        </nav>

        {/* Right: Help Button (?) + Auth State / Settings Dropdown */}
        <div className="flex justify-end items-center gap-2 sm:gap-3">
          {/* Botão de Ajuda (?) - Themed & Compacto */}
          <button
            type="button"
            onClick={startTour}
            data-tour="navbar-help"
            className="w-8 h-8 rounded-full border border-border-subtle bg-surface hover:border-[var(--accent-secondary,#FFCC00)] hover:bg-[var(--accent-secondary,#FFCC00)]/10 text-fg hover:text-[var(--accent-secondary,#FFCC00)] transition-colors cursor-pointer shrink-0 shadow-sm flex items-center justify-center"
            title="Tutorial Interativo da Página (?)"
            aria-label="Ajuda e Tutorial Interativo"
          >
            <span className="material-symbols-outlined text-[18px] text-[var(--accent-secondary,#FFCC00)]">help_outline</span>
          </button>

          {loading ? (
            <div className="w-8 h-8 rounded-full bg-surface-hover animate-pulse"></div>
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <div 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                data-tour="profile-menu-trigger"
                className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-full border border-border-subtle bg-surface hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 transition-colors cursor-pointer shrink-0"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden bg-surface-hover flex items-center justify-center border border-[var(--accent-secondary)] shrink-0">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' && profile?.features_config?.advanced_settings?.sync_curriculum_photo !== false) ? (
                    <img src="/perfil.jpeg" alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[16px] text-fg">person</span>
                  )}
                </div>
                <span className="text-fg text-xs font-bold uppercase tracking-wider hidden sm:inline">{displayName}</span>
                <span className="material-symbols-outlined text-[16px] text-fg-secondary hover:text-[var(--accent-secondary)] transition-colors">settings</span>
              </div>

              {isSettingsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden py-1 z-50">
                  {/* Cabeçalho do Usuário */}
                  <div className="px-4 py-2.5 border-b border-border-subtle bg-app">
                    <p className="text-xs font-bold text-fg truncate">{displayName}</p>
                    <p className="text-[11px] text-fg-muted truncate">{user?.email}</p>
                  </div>

                  {/* BLOCO 1: Espaço de Trabalho & Arquivos */}
                  <div className="py-1">
                    <div className="px-4 py-1 text-[10px] font-black uppercase tracking-wider text-fg-muted">
                      Espaço de Trabalho
                    </div>
                    <Link 
                      href="/servidor"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs text-[var(--accent-secondary)] hover:bg-surface-hover transition-colors flex items-center gap-2.5 font-bold"
                    >
                      <span className="material-symbols-outlined text-[18px]">folder_special</span>
                      <span>Meus Arquivos</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('aurtistic:relaunch-onboarding'));
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-surface-hover hover:text-[var(--accent-secondary,#FFCC00)] transition-colors flex items-center gap-2.5 font-medium cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[var(--accent-secondary,#FFCC00)]">tune</span>
                      <span>Personalizar Módulos</span>
                    </button>
                  </div>

                  <div className="h-[1px] bg-border-subtle my-1" />

                  {/* BLOCO 2: Preferências & Configurações */}
                  <div className="py-1">
                    <div className="px-4 py-1 text-[10px] font-black uppercase tracking-wider text-fg-muted">
                      Aparência & Ajustes
                    </div>
                    
                    {/* Seletor Compacto de Tema */}
                    <ThemeDropdownSection />

                    <Link 
                      href="/configuracoes-avancadas"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-surface-hover hover:text-[var(--accent-primary)] transition-colors flex items-center gap-2.5 font-medium group"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary)]">settings</span>
                      <span>Central de Configurações</span>
                    </Link>
                  </div>

                  <div className="h-[1px] bg-border-subtle my-1" />

                  {/* BLOCO 3: Sistema & Ajuda */}
                  <div className="py-1">
                    <div className="px-4 py-1 text-[10px] font-black uppercase tracking-wider text-fg-muted">
                      Ajuda & Conta
                    </div>

                    <Link 
                      href="/relatar-bug"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-surface-hover hover:text-[var(--accent-secondary)] transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span className="material-symbols-outlined text-[18px]">bug_report</span>
                      <span>Relatar Bug / Feedback</span>
                    </Link>

                    <Link 
                      href="/privacy-policy"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors flex items-center gap-2.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">policy</span>
                      <span>Privacidade</span>
                    </Link>

                    <button 
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5 font-bold cursor-pointer mt-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      <span>Sair</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link 
              href="/login"
              className="bg-[var(--accent-secondary)] text-[var(--on-accent-secondary)] px-5 py-2 rounded-md text-sm font-bold hover:brightness-95 transition-colors"
            >
              Entrar
            </Link>
          )}

        </div>
      </div>
    </header>

      {/* Mobile Bottom Floating Pill Nav (Enxuto & Agrupado) */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[99]" data-tour="nav-tabs">
        <div className="bg-surface/95 backdrop-blur-xl border border-border-subtle rounded-full p-1.5 flex items-center gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
          {/* 1. Tarefas */}
          {hasTasks && (
            <Link
              href="/"
              className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                pathname === '/'
                  ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] px-4 py-2 gap-1.5'
                  : 'text-fg-muted hover:text-fg px-3 py-2'
              }`}
              title="Tarefas"
            >
              <span className="material-symbols-outlined text-[20px]">task_alt</span>
              {pathname === '/' && <span className="text-xs font-bold whitespace-nowrap">Tarefas</span>}
            </Link>
          )}

          {/* 2. Organizações & Servidor (Unificado) */}
          {hasOrgsOrServer && (
            <Link
              href={orgsHref}
              className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                isOrgsActive
                  ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] px-4 py-2 gap-1.5'
                  : 'text-fg-muted hover:text-fg px-3 py-2'
              }`}
              title={orgsLabel}
            >
              <span className="material-symbols-outlined text-[20px]">domain</span>
              {isOrgsActive && (
                <span className="text-xs font-bold whitespace-nowrap">Gestão</span>
              )}
            </Link>
          )}

          {/* 3. Identidade (Portfólio / Currículo / Resumo) */}
          {identityItems.length === 1 && (
            <Link
              href={identityItems[0].href}
              className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                pathname === identityItems[0].href
                  ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] px-4 py-2 gap-1.5'
                  : 'text-fg-muted hover:text-fg px-3 py-2'
              }`}
              title={identityItems[0].name}
            >
              <span className="material-symbols-outlined text-[20px]">{identityItems[0].icon}</span>
              {pathname === identityItems[0].href && (
                <span className="text-xs font-bold whitespace-nowrap">{identityItems[0].name}</span>
              )}
            </Link>
          )}

          {identityItems.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMobileIdentityOpen(!isMobileIdentityOpen)}
                className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out cursor-pointer ${
                  isIdentityActive
                    ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] px-4 py-2 gap-1.5'
                    : 'text-fg-muted hover:text-fg px-3 py-2'
                }`}
                title="Identidade e Perfil"
              >
                <span className="material-symbols-outlined text-[20px]">badge</span>
                {isIdentityActive && (
                  <span className="text-xs font-bold whitespace-nowrap">
                    {identityItems.find((i) => i.href === pathname)?.name || 'Perfil'}
                  </span>
                )}
              </button>

              {isMobileIdentityOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-surface/95 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                  {identityItems.map((item) => {
                    const isItemActive = pathname === item.href;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setIsMobileIdentityOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                          isItemActive ? 'bg-[var(--accent-primary)] text-white' : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

