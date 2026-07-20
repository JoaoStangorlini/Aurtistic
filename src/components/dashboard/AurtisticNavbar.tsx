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
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      supabase.from('user_profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) setProfile(data);
      });
    }
  }, [user]);

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
  }, [supabase.auth]);

  const handleLogout = async () => {
    try {
      await logoutAurtistic();
    } catch (e) {
      console.error(e);
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  const handleExportCSV = async () => {
    setIsSettingsOpen(false);
    if (!user) return;
    const { data } = await supabase.from('tasks').select('*').eq('is_personal', true).eq('user_id', user.id);
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
      
      const { saveTask } = await import('@/app/(dashboard)/actions');
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
        await Browser.open({ url: 'https://stangorliniweb.vercel.app/' });
      } else {
        window.open('https://stangorliniweb.vercel.app/', '_blank');
      }
    } catch (e) {
      window.open('https://stangorliniweb.vercel.app/', '_blank');
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';

  const tabMetadata: Record<string, { name: string; href: string }> = {
    tasks: { name: 'Tarefas', href: '/' },
    resumo: { name: 'Resumo', href: '/resumo' },
    curriculo: { name: 'Currículo', href: '/curriculo' },
    portfolio: { name: 'Portfólio', href: '/portfolio' }
  };

  const activeTabs = profile?.features_config?.active || ['tasks', 'resumo', 'curriculo', 'portfolio'];
  const orderedTabs = profile?.features_config?.order || ['tasks', 'resumo', 'curriculo', 'portfolio'];
  const visibleTabs = orderedTabs.filter((t: string) => activeTabs.includes(t));

  return (
    <header className="sticky top-0 w-full z-50 bg-[#121212]/90 backdrop-blur-xl border-b border-[#2D2D2D] shrink-0">
      <div className="flex justify-between items-center px-4 md:px-6 py-4 max-w-7xl mx-auto w-full gap-4">
        
        {/* Left: Logo */}
        <div className="flex justify-start items-center gap-2">
          <Link href="/" className="flex items-center gap-3">
            <Image 
              src="/aurtistic-icon.png" 
              alt="Aurtistic Logo" 
              width={40} 
              height={40}
              className="h-8 w-8 md:h-10 md:w-10 object-contain"
            />
            <span className="font-['Bukra'] font-black text-lg md:text-xl text-white tracking-tight">Aurtistic</span>
          </Link>
        </div>


        {/* Center: Dynamic Navigation Links */}
        <nav className="hidden md:flex justify-center gap-4 lg:gap-8 items-center flex-1 mx-4">
          {visibleTabs.map((key: string) => {
            const tab = tabMetadata[key];
            if (!tab) return null;
            const isActive = pathname === tab.href;
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
              href="/login"
              className="bg-[#FFCC00] text-[#121212] px-5 py-2 rounded-md text-sm font-bold hover:bg-[#e6b800] transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

