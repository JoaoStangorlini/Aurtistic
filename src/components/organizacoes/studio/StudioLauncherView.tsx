// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { getOrgStudioTemplates } from './studio-presets';
import { ASPECT_DIMENSIONS, type AspectRatioKey, type StudioTemplate } from './types';

type LauncherSection = 'drafts' | 'presets' | 'new';

export function StudioLauncherView({ orgSlug }: { orgSlug?: string | null }) {
  const { drafts, loadDraft, loadTemplate, resetToBlank } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [activeSection, setActiveSection] = useState<LauncherSection>('drafts');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [serverTemplates, setServerTemplates] = useState<StudioTemplate[]>([]);

  const effectiveSlug = orgSlug || tokens.themeId;
  const localTemplates = getOrgStudioTemplates(effectiveSlug, tokens);

  useEffect(() => {
    fetch(`/api/studio/org-templates?orgSlug=${encodeURIComponent(effectiveSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.templates)) setServerTemplates(data.templates);
      })
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

  const toggleSection = (sec: LauncherSection) => {
    setActiveSection((curr) => (curr === sec ? curr : sec));
  };

  return (
    <div className="space-y-6 py-4 max-w-4xl mx-auto animate-in fade-in">
      {/* Cabeçalho Limpo Direto no Fundo Atmosférico */}
      <div className="border-b border-border-subtle pb-4">
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-500 dark:text-[#FFCC00]">
          {tokens.badgeTag} • HUB STUDIO
        </span>
        <h1 className="text-2xl md:text-3xl font-black text-fg mt-1">
          Criador Visual & Publicações
        </h1>
        <p className="text-xs text-fg-muted mt-1">
          Selecione uma das opções abaixo para expandir e iniciar sua arte.
        </p>
      </div>

      {/* Seção Aberta: Começar do Zero (4 Formatos) + Meus Rascunhos Compactos */}
      <div className="space-y-4">
        {/* 1. Começar do Zero — 4 Formatos já abertos em grade compacta */}
        <div className="rounded-2xl border border-border-subtle bg-surface/85 backdrop-blur-md p-3.5 sm:p-4 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-emerald-500">crop_free</span>
              <div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-fg">
                  Nova Arte em Branco
                </h2>
                <p className="text-[10px] text-fg-muted hidden sm:block">
                  Escolha uma proporção para abrir o editor
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {(['1:1', '4:5', '9:16', '16:9'] as AspectRatioKey[]).map((aspect) => {
              const dim = ASPECT_DIMENSIONS[aspect];
              return (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => handleActionWithSlotCheck(() => resetToBlank(aspect))}
                  className="p-2.5 sm:p-3 rounded-xl border border-border-subtle bg-surface-hover/60 hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex sm:flex-col items-center sm:justify-center gap-2.5 sm:gap-1.5 cursor-pointer shadow-xs group text-left sm:text-center"
                >
                  <div
                    className="border-2 border-border-subtle group-hover:border-[#FFCC00] rounded-xs transition-colors shrink-0"
                    style={{
                      width: aspect === '16:9' ? 28 : aspect === '9:16' ? 16 : 22,
                      height: aspect === '16:9' ? 16 : aspect === '9:16' ? 28 : aspect === '4:5' ? 26 : 22,
                    }}
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-fg block truncate">{dim.label}</span>
                    <span className="text-[10px] font-mono text-fg-muted">{aspect}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Meus Rascunhos — Compacto no mobile (sem 3 caixas vazias gigantes) */}
        <div className="rounded-2xl border border-border-subtle bg-surface/85 backdrop-blur-md p-3.5 sm:p-4 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-amber-500 dark:text-[#FFCC00]">
                drafts
              </span>
              <div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-fg">
                  Meus Rascunhos
                </h2>
                <p className="text-[10px] text-fg-muted">
                  {drafts.length} de 3 slots salvos
                </p>
              </div>
            </div>
          </div>
          {drafts.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed border-border-subtle text-center text-[11px] text-fg-muted">
              Nenhum rascunho salvo ainda. Crie uma nova arte acima ou escolha um modelo abaixo.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((slot) => {
                const draft = drafts.find((d) => d.slotIndex === slot);
                if (!draft) return null;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => loadDraft(draft)}
                    className="p-3 rounded-xl border border-border-subtle bg-surface-hover/60 hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col justify-between gap-2 text-left cursor-pointer shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-300 text-[10px]">
                          SLOT {slot}
                        </span>
                        <span className="text-[10px] text-fg-muted font-mono">
                          {draft.aspectRatio}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-fg truncate">{draft.title}</h3>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[10px] text-fg-muted w-full">
                      <span>{new Date(draft.updatedAt).toLocaleDateString('pt-BR')}</span>
                      <span className="text-amber-600 dark:text-[#FFCC00] font-bold">Continuar →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Modelos da Organização */}
        <div className="rounded-2xl border border-border-subtle bg-surface/85 backdrop-blur-md overflow-hidden shadow-sm transition-all">
          <button
            type="button"
            onClick={() => toggleSection('presets')}
            className={`w-full flex items-center justify-between p-3.5 sm:p-4 text-left font-bold transition-colors cursor-pointer ${
              activeSection === 'presets'
                ? 'bg-surface-hover/80 text-fg'
                : 'hover:bg-surface-hover/40 text-fg-secondary hover:text-fg'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-blue-500">
                auto_awesome
              </span>
              <div>
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider block">
                  Modelos da Organização
                </span>
                <span className="text-[10px] font-normal text-fg-muted">
                  Predefinições com a IDV oficial (@{effectiveSlug})
                </span>
              </div>
            </div>
            <span
              className={`material-symbols-outlined text-[20px] text-fg-muted transition-transform duration-200 ${
                activeSection === 'presets' ? 'rotate-180 text-blue-500' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {activeSection === 'presets' && (
            <div className="p-3.5 sm:p-4 pt-1 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-in fade-in">
              {allTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleActionWithSlotCheck(() => loadTemplate(tpl))}
                  className="p-3 rounded-xl border border-border-subtle bg-surface-hover/60 hover:border-[#FFCC00] hover:bg-surface-hover transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-fg-muted">{tpl.aspectRatio}</span>
                    <h3 className="text-xs font-bold text-fg truncate">{tpl.title}</h3>
                    <p className="text-[10px] text-fg-muted truncate">{tpl.description}</p>
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#FFCC00]/20 text-amber-600 dark:text-[#FFCC00] border border-[#FFCC00]/40 shrink-0 pointer-events-none"
                  >
                    Usar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmação caso os 3 slots estejam ocupados */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-border-subtle rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-fg">
            <div className="flex items-center gap-2 text-amber-500">
              <span className="material-symbols-outlined text-[22px]">warning</span>
              <h3 className="font-bold text-sm">Slots Cheios (3/3)</h3>
            </div>
            <p className="text-xs text-fg-secondary">
              Você já atingiu o limite de 3 rascunhos salvos. Criar um novo rascunho irá sobrescrever o slot mais antigo se você salvar. Deseja continuar?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:text-fg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const act = pendingAction;
                  setPendingAction(null);
                  act();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FFCC00] text-black hover:bg-[#FFD633] cursor-pointer shadow-xs"
              >
                Continuar Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}