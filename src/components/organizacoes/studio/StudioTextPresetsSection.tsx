// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';

const EVENT_VARIABLES = ['DATA', 'HORARIO', 'LOCAL', 'PALESTRANTE'];

interface StudioTextPresetsSectionProps {
  onApplyPreset: (type: 'quote' | 'fact' | 'qa' | 'steps') => void;
  onFillBatch: (replacements: Record<string, string>) => void;
}

export function StudioTextPresetsSection({
  onApplyPreset,
  onFillBatch,
}: StudioTextPresetsSectionProps) {
  const [showReplacer, setShowReplacer] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, string>>({
    DATA: '',
    HORARIO: '',
    LOCAL: '',
    PALESTRANTE: '',
  });

  return (
    <div className="space-y-2.5">
      {/* 4 Presets de Diagramação Rápida */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
          Diagramação Rápida (1 Clique)
        </label>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => onApplyPreset('quote')}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] text-left truncate cursor-pointer text-slate-200"
          >
            “ Aspas / Citação
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('fact')}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] text-left truncate cursor-pointer text-slate-200"
          >
            💡 Fato Científico
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('qa')}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] text-left truncate cursor-pointer text-slate-200"
          >
            ❓ Pergunta ➔ Resposta
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('steps')}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] text-left truncate cursor-pointer text-slate-200"
          >
            🔢 Passo a Passo 1-2-3
          </button>
        </div>
      </div>

      {/* Preenchimento de Eventos em Lote */}
      <div className="border-t border-white/10 pt-1.5">
        <button
          type="button"
          onClick={() => setShowReplacer(!showReplacer)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-amber-300">event_note</span>
            <span>Preenchimento de Eventos em Lote</span>
          </span>
          <span className="material-symbols-outlined text-[15px]">{showReplacer ? 'expand_less' : 'expand_more'}</span>
        </button>

        {showReplacer && (
          <div className="mt-2 p-2 rounded-xl bg-white/5 space-y-2 text-xs border border-white/10">
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                placeholder="Data (ex: 28/Nov)"
                value={replacements.DATA}
                onChange={(e) => setReplacements({ ...replacements, DATA: e.target.value })}
                className="p-1.5 rounded-lg bg-black/40 border border-white/15 text-[11px] text-white"
              />
              <input
                type="text"
                placeholder="Horário (ex: 15h)"
                value={replacements.HORARIO}
                onChange={(e) => setReplacements({ ...replacements, HORARIO: e.target.value })}
                className="p-1.5 rounded-lg bg-black/40 border border-white/15 text-[11px] text-white"
              />
            </div>
            <input
              type="text"
              placeholder="Local (ex: Auditório Volta)"
              value={replacements.LOCAL}
              onChange={(e) => setReplacements({ ...replacements, LOCAL: e.target.value })}
              className="w-full p-1.5 rounded-lg bg-black/40 border border-white/15 text-[11px] text-white"
            />
            <button
              type="button"
              onClick={() => onFillBatch(replacements)}
              className="w-full py-1.5 rounded-xl bg-[#FFCC00] text-black font-black text-xs hover:bg-[#FFD633] cursor-pointer shadow-sm"
            >
              Aplicar em Todos os Slides
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

