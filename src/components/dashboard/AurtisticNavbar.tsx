'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import { logoutAurtistic } from '@/app/(dashboard)/aurtistic/actions';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export default function AurtisticNavbar() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (user) {
      supabase.from('user_profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) setProfile(data);
      });
    }
  }, [user, supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
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
      router.push('/aurtistic/login');
    }
  };

  const handleExportCSV = async () => {
    setIsSettingsOpen(false);
    if (!user) return;
    let query = supabase.from('tasks').select('*');
    
    if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
      // Admin: Pega tudo dele + compartilhadas
      query = query.or(`user_id.eq.${user.id},is_personal.is.null,is_personal.eq.false`);
    } else if (user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
      // LabDiv: Pega as dele + HUB compartilhadas
      query = query.or(`user_id.eq.${user.id},and(dimensao.eq.HUB,or(is_personal.is.null,is_personal.eq.false))`);
    } else {
      // Normal user: Apenas as pessoais dele
      query = query.eq('is_personal', true).eq('user_id', user.id);
    }
    
    const { data } = await query;
    if (data && data.length > 0) {
      // Import on demand to save bundle size
      const { downloadCSV } = await import('@/utils/csv');
      downloadCSV(data, `aurtistic_tarefas_${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      alert("Você não possui tarefas para exportar.");
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSettingsOpen(false);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    try {
      const { parseTasksFromCSV } = await import('@/utils/csv');
      const tasks = await parseTasksFromCSV(file);
      if (tasks.length === 0) {
        alert("O arquivo CSV está vazio ou inválido.");
        return;
      }
      
      const { saveTask } = await import('@/lib/offlineActions');
      for (const t of tasks) {
        await saveTask({ ...t, user_id: user.id });
      }
      
      alert(`${tasks.length} tarefas importadas com sucesso!`);
      router.refresh();
    } catch (err) {
      alert("Erro ao importar CSV: " + String(err));
    }
    e.target.value = ''; // Reset input
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
    resumo: { name: customLabels.resumo || 'Resumo', href: '/resumo' },
    curriculo: { name: customLabels.curriculo || 'Currículo', href: '/curriculo' },
    portfolio: { name: customLabels.portfolio || 'Portfólio', href: '/portfolio' },
    extra: { name: customLabels.extra || 'Aba Extra', href: customLinks.extra || '#' }
  };

  const activeTabs = profile?.features_config?.active || ['tasks', 'resumo', 'curriculo', 'portfolio'];
  const orderedTabs = profile?.features_config?.order || ['tasks', 'resumo', 'curriculo', 'portfolio', 'extra'];
  const visibleTabs = orderedTabs.filter((t: string) => activeTabs.includes(t));

  return (
    <>
      <header className="sticky top-0 w-full z-50 bg-[#121212]/90 backdrop-blur-xl border-b border-[#2D2D2D] shrink-0">
        <div className="flex justify-between items-center px-4 md:px-8 py-2 w-full gap-4">
        
        {/* Left: Logo */}
        <div className="flex justify-start items-center gap-2">
          <Link href="/" className="flex items-center">
            <Image 
              src="/feature_graphic_final_white.png" 
              alt="Aurtistic Logo" 
              width={438} 
              height={100}
              className="h-8 md:h-12 w-auto object-contain"
              priority
            />
          </Link>
        </div>


        {/* Center: Dynamic Navigation Links */}
        <nav className="hidden md:flex justify-center gap-4 lg:gap-8 items-center flex-1 mx-4">
          {visibleTabs.map((key: string) => {
            const tab = tabMetadata[key];
            if (!tab) return null;
            const isExternal = tab.href.startsWith('http://') || tab.href.startsWith('https://');
            const isActive = pathname === tab.href;

            if (isExternal) {
              return (
                <a 
                  key={key}
                  href={tab.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#A0A0A0] hover:text-[#9D4EDD] transition-colors"
                >
                  {tab.name}
                </a>
              );
            }

            return (
              <Link 
                key={key}
                href={tab.href}
                className={`font-medium transition-colors ${
                  isActive 
                    ? 'text-[#9D4EDD] font-bold border-b-[3px] border-[#FFCC00] pb-1' 
                    : 'text-[#A0A0A0] hover:text-[#9D4EDD]'
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>

        {/* Right: Auth State / Settings Dropdown */}
        <div className="flex justify-end items-center gap-4">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <div 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-full border border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#9D4EDD] hover:bg-[#9D4EDD]/10 transition-colors cursor-pointer shrink-0"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#2D2D2D] flex items-center justify-center border border-[#FFCC00] shrink-0">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? (
                    <img src="/perfil.jpeg" alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[16px] text-white">person</span>
                  )}
                </div>
                <span className="text-white text-xs font-bold uppercase tracking-wider hidden sm:inline">{displayName}</span>
                <span className="w-2 h-2 rounded-full bg-[#FFCC00]"></span>
              </div>

              {isSettingsOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg shadow-xl overflow-hidden py-1 z-50">
                    <button 
                      onClick={handleExportCSV}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-white transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      Baixar tarefas (CSV)
                    </button>
                    
                    <label className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-white transition-colors flex items-center gap-2 cursor-pointer">
                      <span className="material-symbols-outlined text-[18px]">upload</span>
                      Importar tarefas (CSV)
                      <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                    </label>

                    <Link 
                      href="/configurar-notificacoes"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-[#FFCC00] transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                      Notificações
                    </Link>

                    <Link 
                      href="/privacy-policy"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-white transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">policy</span>
                      Política de Privacidade
                    </Link>

                    <div className="h-[1px] bg-[#2D2D2D] my-1" />

                    <Link 
                      href="/delete-account"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#db4437] hover:bg-[#db4437]/10 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                      Excluir perfil ou tarefas
                    </Link>

                    <div className="h-[1px] bg-[#2D2D2D] my-1" />

                    <button 
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-[#db4437] transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      Sair
                    </button>
                  </div>
                )}
            </div>
          ) : (
            <Link 
              href="/aurtistic/login"
              className="bg-[#FFCC00] text-[#121212] px-5 py-2 rounded-md text-sm font-bold hover:bg-[#e6b800] transition-colors"
            >
              Entrar
            </Link>
          )}

        </div>
      </div>
    </header>

      {/* Mobile Bottom Floating Pill Nav */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[99]">
        <div className="bg-[#1A1A1A]/95 backdrop-blur-xl border border-[#2D2D2D] rounded-full p-2 flex items-center gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {visibleTabs.map((key: string) => {
            const tab = tabMetadata[key];
            if (!tab) return null;
            const isExternal = tab.href.startsWith('http://') || tab.href.startsWith('https://');
            const isActive = pathname === tab.href;

            const tabIcons: Record<string, string> = {
              tasks: 'task_alt',
              resumo: 'home',
              curriculo: 'contact_page',
              portfolio: 'photo_camera',
              extra: 'link'
            };
            const icon = tabIcons[key] || 'link';

            if (isExternal) {
              return (
                <a
                  key={key}
                  href={tab.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-full text-[#8E8E8E] hover:text-white px-3 py-2.5"
                >
                  <span className="material-symbols-outlined text-[22px]">{icon}</span>
                </a>
              );
            }

            return (
              <Link 
                key={key}
                href={tab.href}
                className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                  isActive 
                    ? 'bg-[#9D4EDD]/20 text-[#9D4EDD] px-5 py-2.5 gap-2' 
                    : 'text-[#8E8E8E] hover:text-white px-3 py-2.5'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">{icon}</span>
                {isActive && <span className="text-xs font-bold whitespace-nowrap">{tab.name}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

