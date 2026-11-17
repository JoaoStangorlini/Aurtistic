// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioDraft } from './types';
import { exportSlideToPngDataUrl } from '@/lib/studio/studio-exporter';

export interface StudioDraftVersionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StudioDraftVersionsDrawer({ isOpen, onClose }: StudioDraftVersionsDrawerProps) {
  const { drafts, loadDraft, activeSlide, aspectRatio, saveCurrentToDraftSlot, activeDraftSlot } = useStudio();
  const [comparingDraft, setComparingDraft] = useState<StudioDraft | null>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [targetSlot, setTargetSlot] = useState<1 | 2 | 3>((activeDraftSlot as 1 | 2 | 3) || 1);

  if (!isOpen) return null;

  const currentPreview = exportSlideToPngDataUrl(activeSlide, aspectRatio, 0.25);
  const comparePreview = comparingDraft?.slides[0]
    ? exportSlideToPngDataUrl(comparingDraft.slides[0], comparingDraft.aspectRatio, 0.25)
    : '';

  const handleSaveNamedSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;
    saveCurrentToDraftSlot(targetSlot, snapshotName.trim());
    setSnapshotName('');
  };

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

        {/* Salvar Snapshot Nomeado */}
        <form onSubmit={handleSaveNamedSnapshot} className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#FFCC00]">bookmark</span>
              <span>Criar Snapshot Nomeado</span>
            </span>
            <select
              value={targetSlot}
              onChange={(e) => setTargetSlot(Number(e.target.value) as 1 | 2 | 3)}
              className="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-[10px] text-white"
            >
              <option value={1}>Slot 1</option>
              <option value={2}>Slot 2</option>
              <option value={3}>Slot 3</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Ex: Layout base, Versão final..."
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!snapshotName.trim()}
              className="px-3 py-1.5 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] transition-all disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </form>

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

        {/* Painel de Comparação Lado a Lado Visual */}
        {comparingDraft && (
          <div className="p-3 rounded-2xl bg-black/70 border border-amber-400/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">compare</span>
                <span>Comparação Visual (Lado a Lado)</span>
              </span>
              <button type="button" onClick={() => setComparingDraft(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center gap-1.5">
                <span className="text-slate-400 font-bold block text-center">CANVAS ATUAL</span>
                {currentPreview ? (
                  <img src={currentPreview} alt="Canvas Atual" className="w-full h-24 object-contain rounded-lg border border-white/10 bg-black/50" />
                ) : (
                  <div className="w-full h-24 bg-black/40 rounded-lg flex items-center justify-center text-slate-500">Sem preview</div>
                )}
                <span className="text-white truncate block max-w-full">{activeSlide.title}</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 flex flex-col items-center gap-1.5">
                <span className="text-amber-300 font-bold block text-center">SLOT {comparingDraft.slotIndex}</span>
                {comparePreview ? (
                  <img src={comparePreview} alt="Versão Salva" className="w-full h-24 object-contain rounded-lg border border-white/10 bg-black/50" />
                ) : (
                  <div className="w-full h-24 bg-black/40 rounded-lg flex items-center justify-center text-slate-500">Sem preview</div>
                )}
                <span className="text-white truncate block max-w-full">{comparingDraft.title}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

