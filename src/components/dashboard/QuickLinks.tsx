// Este programa é um software livre (Licença AGPLv3)
'use client';
import React, { useState } from 'react';

export const HubIcon = () => <img src="/icon.svg" alt="HUB" className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all duration-300 animate-pulse" />;
export const NotionIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M4.15 5.51L3 6.13v12.2l1.04.62 6.57 3.82 1.34.8 1.48-.82 7.57-4.4V5.5l-1.3-.7-6.52-3.8-1.5-.83-1.4.8zm13.78 11.83l-6.14 3.58-6.14-3.58V7.05l6.14-3.58 6.14 3.58v10.29zm-6.14-7.44v6.86l4.6-2.68v-4.18zM8.33 9.9v6.86l4.6 2.68V12.6z"/></svg>;
export const DriveIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 12L14 3H4v18h16c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2.4-2zM9.17 6l2 2H20v10H4V6h5.17M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2-2h-8l-2-2z"/></svg>;
export const DiscordIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
export const ClarityIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 12a9.5 9.5 0 1119 0 9.5 9.5 0 01-19 0zm9.5-8a8 8 0 100 16 8 8 0 000-16zm-3 4v8h2v-8h-2zm4 3v5h2v-5h-2z"/></svg>;
export const SupabaseIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>;
export const CloudinaryIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>;
export const VercelIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L24 22H0L12 1z"/></svg>;
export const CanvaIcon = () => <svg className="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>;
export const GlobeIcon = () => <span className="material-symbols-outlined text-[16px] transition-colors">public</span>;

export interface SystemLinkDef {
  name: string;
  icon: React.ReactNode;
  href: string;
  hoverClass: string;
}

export const systemLinks: SystemLinkDef[] = [
  { 
    name: 'Notion', 
    icon: <NotionIcon />, 
    href: 'https://www.notion.so/32b4f396a86b80d690a6de0902328039?v=32b4f396a86b80feb2c7000c33e2eb5f&source=copy_link',
    hoverClass: 'hover:border-[#FFFFFF] hover:bg-white/10 hover:text-white' 
  },
  { 
    name: 'Drive', 
    icon: <DriveIcon />, 
    href: 'https://drive.google.com/drive/folders/1zRKy4EkOiqjS42G18RsJ4eIY8CN7SRNc?usp=drive_link',
    hoverClass: 'hover:border-[#FFD04B] hover:bg-gradient-to-r hover:from-[#4285F4]/20 hover:via-[#FFD04B]/20 hover:to-[#1FA463]/20 hover:text-[#4285F4]'
  },
  { 
    name: 'Discord', 
    icon: <DiscordIcon />, 
    href: 'https://discord.gg/cTGnFWdk',
    hoverClass: 'hover:border-[#5865F2] hover:bg-[#5865F2]/10 hover:text-[#5865F2]'
  },
  { 
    name: 'MS Clarity', 
    icon: <ClarityIcon />, 
    href: 'https://clarity.microsoft.com/projects/view/vygiuv03xb/dashboard',
    hoverClass: 'hover:border-[#0078D4] hover:bg-[#0078D4]/10 hover:text-[#0078D4]'
  },
  { 
    name: 'Supabase', 
    icon: <SupabaseIcon />, 
    href: 'https://supabase.com/dashboard/org/xbzbvfbzfqoeyvrfkvka',
    hoverClass: 'hover:border-[#3ECF8E] hover:bg-[#3ECF8E]/10 hover:text-[#3ECF8E]'
  },
  { 
    name: 'Cloudinary', 
    icon: <CloudinaryIcon />, 
    href: 'https://console.cloudinary.com/app/c-5b90f557bc9fa28800ea47fc65416f/home/dashboard',
    hoverClass: 'hover:border-[#3448C5] hover:bg-[#3448C5]/10 hover:text-[#3448C5]'
  },
  { 
    name: 'Site Público', 
    icon: <HubIcon />, 
    href: 'https://hub-lab-div.vercel.app',
    hoverClass: 'hover:border-[#FFCC00] hover:text-[#FFCC00] hover:bg-gradient-to-r hover:from-blue-500/20 hover:via-yellow-500/20 hover:to-red-500/20'
  },
  { 
    name: 'Vercel Testes', 
    icon: <VercelIcon />, 
    href: 'https://hub-labdiv-testes.vercel.app/',
    hoverClass: 'hover:border-[#FFF] hover:text-white hover:bg-gradient-to-r hover:from-blue-500/20 hover:via-yellow-500/20 hover:to-red-500/20'
  },
  { 
    name: 'Canva IDV', 
    icon: <CanvaIcon />, 
    href: 'https://www.canvacom.com/design/DAG-gWpQpig/Y8F_g_ZoabHOcxL7yszv7w/edit',
    hoverClass: 'hover:border-[#00C4CC] hover:bg-gradient-to-r hover:from-[#00C4CC]/20 hover:to-[#7D2AE8]/20 hover:text-[#00C4CC]'
  },
];

export function CopyableQuickLink({
  name,
  href,
  icon,
  hoverClass,
  onRemove,
  isEditing,
  isPinned,
  onTogglePin,
}: {
  name: string;
  href: string;
  icon: React.ReactNode;
  hoverClass?: string;
  onRemove?: () => void;
  isEditing?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`relative group/btn flex items-center bg-surface border border-[#FFCC00]/40 rounded-full text-xs font-medium text-fg-secondary transition-all duration-300 hover:border-[#FFCC00] hover:text-[#FFCC00] ${hoverClass || ''}`}>
      <a 
        href={href} 
        target="_blank" 
        rel="noreferrer" 
        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-inherit hover:text-inherit select-none"
      >
        {icon}
        <span>{name}</span>
      </a>

      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          className={`px-1.5 py-1.5 border-l border-white/10 transition-colors flex items-center justify-center cursor-pointer ${
            isPinned
              ? 'text-[var(--accent-secondary,#FFCC00)]'
              : 'text-fg-muted hover:text-[var(--accent-secondary,#FFCC00)]'
          }`}
          title={isPinned ? 'Desafixar da barra compacta' : 'Fixar nos 4 chips da barra compacta'}
        >
          <span className="material-symbols-outlined text-[13px]">
            {isPinned ? 'keep' : 'keep_public'}
          </span>
        </button>
      )}

      <button 
        onClick={handleCopy}
        className="pr-3 pl-1.5 py-1.5 border-l border-white/10 text-fg-muted hover:text-[#FFCC00] transition-colors flex items-center justify-center cursor-pointer"
        title="Copiar Link"
      >
        <span className="material-symbols-outlined text-[13px] font-bold">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
      {isEditing && onRemove && (
        <button 
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 bg-[#F14343] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:scale-110 transition-transform z-10"
        >
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      )}
    </div>
  );
}

export function QuickLinks() {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider mr-2 hidden md:inline">Links Rápidos:</span>
      {systemLinks.map(link => (
        <CopyableQuickLink 
          key={link.name}
          name={link.name}
          href={link.href}
          icon={link.icon}
          hoverClass={link.hoverClass}
        />
      ))}
    </div>
  );
}
