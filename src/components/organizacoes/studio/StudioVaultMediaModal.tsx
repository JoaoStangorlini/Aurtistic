// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import type { StudioGalleryMediaItem } from '@/app/(dashboard)/organizacoes/studio-actions';

interface StudioVaultMediaModalProps {
  isOpen: boolean;
  isLoading: boolean;
  items: StudioGalleryMediaItem[];
  onClose: () => void;
  onSelect: (item: StudioGalleryMediaItem) => void;
}

export function StudioVaultMediaModal({
  isOpen,
  isLoading,
  items,
  onClose,
  onSelect,
}: StudioVaultMediaModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0f172a] border border-white/15 rounded-3xl p-5 max-w-xl w-full shadow-2xl flex flex-col gap-4 max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#FFCC00]">folder_shared</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cofre de Mídia da Organização</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-[260px] max-h-[420px] pr-1 scrollbar-thin">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">
              Carregando acervo do Cofre...
            </div>
          ) : items.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
              <span className="material-symbols-outlined text-[32px] text-slate-600">image_not_supported</span>
              <span>Nenhuma mídia encontrada no cofre desta organização.</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-[#FFCC00] bg-black/40 text-left transition-all cursor-pointer"
                >
                  <img
                    src={item.thumbUrl}
                    alt={item.fileName}
                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="p-1.5 bg-black/60 backdrop-blur-xs">
                    <p className="text-[10px] font-bold text-white truncate">{item.label || item.fileName}</p>
                    {item.category && <span className="text-[9px] text-[#FFCC00] block truncate">{item.category}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
