// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { getOrgStudioTemplates } from './studio-presets';
import type { AspectRatioKey, StudioTemplate } from './types';

export function StudioLauncherView({ orgSlug }: { orgSlug?: string | null }) {
  const { drafts, loadDraft, loadTemplate, resetToBlank } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [serverTemplates, setServerTemplates] = useState<StudioTemplate[]>([]);

  const effectiveSlug = orgSlug || tokens.themeId;
  const localTemplates = getOrgStudioTemplates(effectiveSlug, tokens);

  useEffect(() => {
    fetch(`/api/studio/org-templates?org=${encodeURIComponent(effectiveSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data?.templates)) setServerTemplates(data.templates); })
      .catch(() => {});
  }, [effectiveSlug]);

  const allTemplates = [...localTemplates, ...serverTemplates];

  const handleActionWithSlotCheck = (action: () => void) => {
    if (drafts.length >= 3) {
      setPendingAction(() => action);
    } else {
      action();
    }
  };

  return (
    <div className="space-y-8 p-4 md:p-6 max-w-5xl mx-auto animate-in fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#FFCC00]">{tokens.badgeTag} • HUB STUDIO</span>
          <h1 className="text-2xl md:text-3xl font-black text-white mt-1">Criador Visual & Publicações</h1>
          <p className="text-xs text-slate-400 mt-0.5">Escolha um dos seus 3 rascunhos, um modelo da organização ou comece do zero.</p>
        </div>
      </div>

      {/* Opção A: Meus 3 Rascunhos Ativos */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">drafts</span>
          <span>Meus Rascunhos ({drafts.length}/3 Slots Ativos)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([1, 2, 3] as const).map((slot) => {
            const draft = drafts.find((d) => d.slotIndex === slot);
            return (
              <div
                key={slot}
                onClick={() => draft && loadDraft(draft)}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[140px] ${
                  draft ? 'border-white/20 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 cursor-pointer shadow-md' : 'border-dashed border-white/10 bg-transparent text-slate-500'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-amber-300">SLOT {slot}</span>
                    {draft && <span className="text-[10px] text-slate-400">{draft.aspectRatio}</span>}
                  </div>
                  <h3 className="text-sm font-bold text-white truncate">{draft ? draft.title : 'Slot Vazio'}</h3>
                </div>
                {draft ? (
                  <div className="flex items-center justify-between pt-3 border-t border-white/10 text-[11px] text-slate-400">
                    <span>{new Date(draft.updatedAt).toLocaleDateString('pt-BR')}</span>
                    <span className="text-[#FFCC00] font-bold">Continuar →</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500">Pronto para novo post</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Opção B: Modelos da Organização */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">auto_awesome</span>
          <span>Modelos Pré-Prontos da Organização ({effectiveSlug})</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allTemplates.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => handleActionWithSlotCheck(() => loadTemplate(tpl))}
              className="p-4 rounded-2xl border border-white/15 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-md"
            >
              <div>
                <span className="text-[10px] font-mono text-amber-300 uppercase block">{tpl.aspectRatio}</span>
                <h3 className="text-sm font-bold text-white">{tpl.title}</h3>
                <p className="text-xs text-slate-400 mt-1">Preset na IDV com tipografia e cores oficiais.</p>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl bg-white/10 text-[#FFCC00] text-xs font-bold hover:bg-[#FFCC00] hover:text-black transition-all shrink-0"
              >
                Usar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Opção C: Começar do Zero */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">crop_free</span>
          <span>Começar do Zero (Tela em Branco)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { key: '1:1', label: '1:1 Feed', icon: 'square' },
              { key: '4:5', label: '4:5 Retrato', icon: 'crop_portrait' },
              { key: '9:16', label: '9:16 Reels/Story', icon: 'smartphone' },
              { key: '16:9', label: '16:9 Telão', icon: 'tv' },
            ] as const
          ).map((fmt) => (
            <button
              key={fmt.key}
              type="button"
              onClick={() => handleActionWithSlotCheck(() => resetToBlank(fmt.key))}
              className="p-4 rounded-2xl border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-2 text-center cursor-pointer shadow-sm group"
            >
              <span className="material-symbols-outlined text-[28px] text-slate-400 group-hover:text-[#FFCC00] transition-colors">
                {fmt.icon}
              </span>
              <div>
                <span className="text-xs font-bold text-white block">{fmt.label}</span>
                <span className="text-[10px] font-mono text-slate-500">{fmt.key}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Modal de Substituição de Slot se Cheio (3/3) */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f172a] border border-amber-400/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Slots de Rascunho Cheios (3/3)</h3>
            <p className="text-xs text-slate-300">
              Você atingiu o limite de 3 rascunhos ativos. Selecione qual slot deseja sobrescrever para carregar o novo post:
            </p>
            <div className="space-y-2">
              {drafts.map((d) => (
                <button
                  key={d.slotIndex}
                  type="button"
                  onClick={() => {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  }}
                  className="w-full p-3 rounded-xl border border-white/15 bg-white/5 hover:border-amber-400 text-left text-xs font-bold text-white flex justify-between"
                >
                  <span>Slot {d.slotIndex}: {d.title}</span>
                  <span className="text-amber-400">Sobrescrever →</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="w-full py-2 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
