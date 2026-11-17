// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';
import type { StudioActiveTab } from './types';

const TABS: { id: StudioActiveTab; label: string; icon: string }[] = [
  { id: 'images', label: '1. Imagens', icon: 'photo_library' },
  { id: 'edition', label: '2. Edição', icon: 'tune' },
  { id: 'texts', label: '3. Textos', icon: 'title' },
  { id: 'layers', label: '4. Camadas', icon: 'layers' },
];

export function StudioToolbarTabs() {
  const { activeTab, setActiveTab, activeSlide } = useStudio();

  const layersCount = activeSlide?.layers.length || 0;

  return (
    <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/10 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-[#FFCC00] text-[#121212] shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'layers' && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-slate-400'
                }`}
              >
                {layersCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

