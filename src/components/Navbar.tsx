'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import AurtisticNavbar from './dashboard/AurtisticNavbar';

export default function Navbar({ 
  initialRole, 
  initialTargetHref 
}: { 
  initialRole: 'ADM' | 'LabDiv' | 'Convidado'; 
  initialTargetHref: string; 
}) {
  const pathname = usePathname();
  const router = useRouter();
  const targetHref = initialTargetHref;
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const userRole = initialRole;


  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    const checkWidgetIntent = async () => {
      try {
        const { value: openTaskId } = await Preferences.get({ key: 'widget_action_open_task' });
        if (openTaskId) {
          if (window.location.pathname !== '/servidor') {
            router.push('/servidor');
          }
        }
      } catch(e) {}
    };

    checkWidgetIntent();
    
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkWidgetIntent();
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [router]);

  if (pathname === '/login') {
    return null;
  }
  return <AurtisticNavbar />;


  const navLinks = [
    { name: 'Resumo', href: '/' },
    { name: 'Fotografia', href: '/galeria' },
    { name: 'Currículo', href: '/curriculo' },
    { name: 'Tarefas', href: '/labdiv' },
    { name: 'Servidor', href: '/servidor' },
  ];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    router.replace(`${pathname}?q=${encodeURIComponent(val)}`, { scroll: false });
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname === href || (pathname === '/' && href === '/')) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const main = document.querySelector('main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
    <header className="sticky top-0 w-full z-50 bg-[#121212]/80 backdrop-blur-xl border-b border-[#2D2D2D] shrink-0">
      <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto w-full gap-4">
        
        {/* Left: Logo */}
        <div className="flex justify-start items-center gap-4">
          <Link href="/" className="text-xl font-['Bukra'] font-black tracking-tighter text-[#FFCC00]">
            stangorlini.web
          </Link>
        </div>

        {/* Center: Navigation Links (Desktop) */}
        <nav className="hidden md:flex justify-center gap-4 lg:gap-8 items-center flex-1 mx-4">
          {navLinks.map(link => {
            const isActive = pathname === link.href || (pathname === '/' && link.href === '/');
            return (
              <Link 
                key={link.name}
                href={link.href}
                className={`font-medium transition-colors ${
                  isActive 
                    ? 'text-[#9D4EDD] font-bold border-b-[3px] border-[#FFCC00] pb-1' 
                    : 'text-[#A0A0A0] hover:text-[#9D4EDD]'
                }`}
                onClick={(e) => handleNavClick(e, link.href)}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Right: Search & ID */}
        <div className="flex justify-end items-center gap-4">
          <div className="relative hidden lg:block w-[200px]">
            <span className="material-symbols-outlined absolute left-2.5 top-1.5 text-[#8E8E8E] text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Buscar na página..." 
              onChange={handleSearchChange}
              className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-full pl-9 pr-4 py-1 text-sm text-white focus:outline-none focus:border-[#9D4EDD] transition-colors"
            />
          </div>
          
          {/* Mobile Search Icon */}
          <button 
            className="lg:hidden text-[#8E8E8E] hover:text-white flex items-center justify-center transition-colors"
            onClick={() => {
              setIsMobileSearchOpen(!isMobileSearchOpen);
            }}
          >
            <span className="material-symbols-outlined">{isMobileSearchOpen ? 'close' : 'search'}</span>
          </button>
          
          <Link 
            href={targetHref}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#9D4EDD] hover:bg-[#9D4EDD]/10 transition-colors group cursor-pointer shrink-0"
          >
            {userRole === 'Convidado' ? (
              <div className="w-7 h-7 rounded-full bg-[#1A1A1A] border border-[#2D2D2D] flex items-center justify-center group-hover:border-[#9D4EDD] transition-colors">
                <span className="material-symbols-outlined text-[16px] text-[#8E8E8E]">person</span>
              </div>
            ) : (
              <img src={userRole === 'LabDiv' ? "/labdiv-logo.png" : "/perfil.jpeg"} alt="Perfil" className="w-7 h-7 rounded-full object-cover border border-[#2D2D2D] group-hover:border-[#9D4EDD] transition-colors" />
            )}

            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${userRole === 'Convidado' ? 'bg-[#8E8E8E]' : userRole === 'ADM' ? 'bg-[#FFCC00]' : 'bg-[#9D4EDD]'}`}></div>
              <span className="text-[10px] md:text-[11px] font-bold text-[#A0A0A0] group-hover:text-white uppercase tracking-wider truncate max-w-[80px] md:max-w-none">
                {userRole}
              </span>
            </div>
          </Link>
        </div>

      </div>

      {/* Mobile Search Dropdown */}
      {isMobileSearchOpen && (
        <div className="lg:hidden bg-[#121212]/95 backdrop-blur-xl border-b border-[#2D2D2D] px-6 py-4 absolute w-full left-0 top-full shadow-2xl flex">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-2 text-[#8E8E8E] text-[20px]">search</span>
            <input 
              type="text" 
              placeholder="Buscar na página..." 
              onChange={handleSearchChange}
              autoFocus
              className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-full pl-10 pr-4 py-2 text-white focus:outline-none focus:border-[#9D4EDD] transition-colors"
            />
          </div>
        </div>
      )}
    </header>

    {/* Mobile Bottom Floating Nav */}
    <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-[#1A1A1A]/95 backdrop-blur-xl border border-[#2D2D2D] rounded-full p-2 flex items-center gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {navLinks.map(link => {
          const isActive = pathname === link.href || (pathname === '/' && link.href === '/');
          let icon = '';
          if (link.name === 'Resumo') icon = 'home';
          else if (link.name === 'Fotografia') icon = 'photo_camera';
          else if (link.name === 'Currículo') icon = 'contact_page';
          else if (link.name === 'Tarefas') icon = 'task_alt';
          else if (link.name === 'Servidor') icon = 'dns';

          return (
            <Link 
              key={link.name}
              href={link.href}
              className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                isActive 
                  ? 'bg-[#9D4EDD]/20 text-[#9D4EDD] px-5 py-2.5 gap-2' 
                  : 'text-[#8E8E8E] hover:text-white px-3 py-2.5'
              }`}
              onClick={(e) => handleNavClick(e, link.href)}
            >
              <span className="material-symbols-outlined text-[22px]">{icon}</span>
              {isActive && <span className="text-xs font-bold whitespace-nowrap">{link.name}</span>}
            </Link>
          );
        })}
      </div>
    </div>
    </>
  );
}
