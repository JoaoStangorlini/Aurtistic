// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioDraft } from './types';

export interface StudioDraftVersionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StudioDraftVersionsDrawer({ isOpen, onClose }: StudioDraftVersionsDrawerProps) {
  const { drafts, loadDraft, activeSlide } = useStudio();
  const [comparingDraft, setComparingDraft] = useState<StudioDraft | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md bg-[#0b0f19] border-l border-white/15 h-full p-5 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#FFCC00]">history</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Histórico de Rascunhos (3 Slots)</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Você mantém no máximo 3 versões ativas sincronizadas entre a sua sessão e a nuvem.
        </p>

        {/* Lista de Slots */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
          {([1, 2, 3] as const).map((slot) => {
            const draft = drafts.find((d) => d.slotIndex === slot);
            return (
              <div
                key={slot}
                className={`p-3.5 rounded-2xl border transition-all ${
                  draft ? 'border-white/15 bg-white/5 space-y-2.5' : 'border-dashed border-white/10 bg-transparent text-slate-500 p-4 text-center text-xs'
                }`}
              >
                {draft ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 font-mono text-[10px] font-bold">
                        SLOT {slot} • {draft.aspectRatio}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(draft.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-white">{draft.title}</h4>
                      <span className="text-[10px] text-slate-400">{draft.slides.length} tela(s) no carrossel</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          loadDraft(draft);
                          onClose();
                        }}
                        className="flex-1 py-1.5 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] transition-all"
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        onClick={() => setComparingDraft(comparingDraft?.id === draft.id ? null : draft)}
                        className="px-3 py-1.5 rounded-xl border border-white/20 text-slate-300 hover:text-white text-xs font-semibold"
                      >
                        {comparingDraft?.id === draft.id ? 'Fechar' : 'Comparar'}
                      </button>
                    </div>
                  </>
                ) : (
                  <span>Slot {slot} Livre para Novo Rascunho</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Painel de Comparação Lado a Lado */}
        {comparingDraft && (
          <div className="p-3 rounded-2xl bg-black/60 border border-amber-400/30 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300">Comparação Side-by-Side</span>
              <button type="button" onClick={() => setComparingDraft(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5">
                <span className="text-slate-400 block font-bold">VERSÃO ATUAL</span>
                <span className="text-white block mt-1">{activeSlide.title}</span>
                <span className="text-slate-500">{activeSlide.layers.length} camadas</span>
              </div>
              <div className="p-2 rounded bg-amber-400/10 border border-amber-400/20">
                <span className="text-amber-300 block font-bold">SLOT {comparingDraft.slotIndex}</span>
                <span className="text-white block mt-1">{comparingDraft.slides[0]?.title || 'Tela'}</span>
                <span className="text-slate-400">{comparingDraft.slides[0]?.layers.length || 0} camadas</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
