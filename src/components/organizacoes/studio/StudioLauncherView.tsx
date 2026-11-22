// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { getOrgStudioTemplates } from './studio-presets';
import { ASPECT_DIMENSIONS, type AspectRatioKey, type StudioTemplate } from './types';
import { sanitizeCustomTemplate } from './studio-helpers';
import { createClient } from '@/utils/supabase/client';

type LauncherSection = 'drafts' | 'presets' | 'new';

export function StudioLauncherView({ orgSlug }: { orgSlug?: string | null }) {
  const { drafts, loadDraft, loadTemplate, resetToBlank, scope } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [activeSection, setActiveSection] = useState<LauncherSection | null>('drafts');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [serverTemplates, setServerTemplates] = useState<StudioTemplate[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const effectiveScopeKey = scope === 'personal' ? 'personal' : (orgSlug || tokens.themeId || 'default');
  const storageDefaultKey = `aurtistic_studio_default_${effectiveScopeKey}`;

  // Lê slide padrão configurado
  const savedDefaultTemplate = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageDefaultKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const res = sanitizeCustomTemplate(parsed);
      return res.ok ? res.sanitized : null;
    } catch {
      return null;
    }
  }, [storageDefaultKey, showConfigModal]);

  // Hidrata do Supabase (features_config.studio_default_template) quando localStorage estiver vazio
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(storageDefaultKey)) return;
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !active) return;
      supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!active) return;
          const map = (data?.features_config as any)?.studio_default_template;
          const remoteSlide = map?.[effectiveScopeKey];
          if (remoteSlide) {
            const res = sanitizeCustomTemplate(remoteSlide);
            if (res.ok) {
              localStorage.setItem(storageDefaultKey, JSON.stringify(res.sanitized));
              setShowConfigModal((prev) => prev);
            }
          }
        });
    });
    return () => { active = false; };
  }, [storageDefaultKey, effectiveScopeKey]);
  const effectiveSlug = orgSlug || tokens.themeId;
  const localTemplates = getOrgStudioTemplates(effectiveSlug, tokens);

  useEffect(() => {
    fetch(`/api/studio/org-templates?orgSlug=${encodeURIComponent(effectiveSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.templates)) setServerTemplates(data.templates);
      })
      .catch(() => { });
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
    setActiveSection((curr) => (curr === sec ? null : sec));
  };

  const handleCreateNew = (aspect: AspectRatioKey, preferDefault = false) => {
    handleActionWithSlotCheck(() => {
      if (preferDefault && savedDefaultTemplate) {
        loadTemplate({
          id: savedDefaultTemplate.id || `tpl-default-${Date.now()}`,
          title: savedDefaultTemplate.title || 'Meu Padrão',
          orgSlug: effectiveSlug || 'personal',
          category: 'modelo',
          aspectRatio: aspect,
          previewUrl: '',
          slides: [{ ...savedDefaultTemplate, aspectRatio: aspect }],
        });
      } else {
        resetToBlank(aspect);
      }
    });
  };

  return (
    <div className="space-y-6 py-4 max-w-4xl mx-auto animate-in fade-in">
      {/* Alternador / Badge de Escopo */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-accent-primary">
            {scope === 'personal' ? 'person' : 'corporate_fare'}
          </span>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-fg">
            {scope === 'personal' ? 'Studio Pessoal' : `${tokens.displayName || 'Organização'}`}
          </span>
        </div>
      </div>

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
                  Nova Arte {savedDefaultTemplate ? '(Em Branco ou Padrão)' : 'em Branco'}
                </h2>
                <p className="text-[10px] text-fg-muted hidden sm:block">
                  Escolha uma proporção para abrir o editor
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {savedDefaultTemplate && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                  Padrão Ativo: {savedDefaultTemplate.title}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                title="Configurar Tela Inicial Padrão"
                className="p-1.5 text-xs text-fg-muted hover:text-fg rounded-lg border border-border-subtle bg-surface-hover/50 hover:bg-surface-hover cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">settings</span>
                <span className="text-[10px] font-bold hidden sm:inline">Padrão</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {(['1:1', '4:5', '9:16', '16:9'] as AspectRatioKey[]).map((aspect) => {
              const dim = ASPECT_DIMENSIONS[aspect];
              return (
                <div key={aspect} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleCreateNew(aspect, Boolean(savedDefaultTemplate))}
                    className="p-2.5 sm:p-3 rounded-xl border border-border-subtle bg-surface-hover/60 hover:border-accent-primary hover:bg-surface-hover transition-all flex sm:flex-col items-center sm:justify-center gap-2.5 sm:gap-1.5 cursor-pointer shadow-xs group text-left sm:text-center w-full"
                  >
                    <div
                      className="border-2 border-border-subtle group-hover:border-accent-primary rounded-xs transition-colors shrink-0"
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
                  {savedDefaultTemplate && (
                    <button
                      type="button"
                      onClick={() => handleCreateNew(aspect, false)}
                      className="text-[9px] text-fg-muted hover:text-fg text-center underline cursor-pointer"
                    >
                      Criar em Branco
                    </button>
                  )}
                </div>
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
            className={`w-full flex items-center justify-between p-3.5 sm:p-4 text-left font-bold transition-colors cursor-pointer ${activeSection === 'presets'
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
                  {scope === 'personal' ? 'Modelos Base' : 'Modelos da Organização'}
                </span>
                <span className="text-[10px] font-normal text-fg-muted">
                  {scope === 'personal'
                    ? 'Predefinições neutras com a sua paleta atual'
                    : `Predefinições com a IDV oficial (@${effectiveSlug})`}
                </span>
              </div>
            </div>
            <span
              className={`material-symbols-outlined text-[20px] text-fg-muted transition-transform duration-200 ${activeSection === 'presets' ? 'rotate-180 text-blue-500' : ''
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

      {/* Modal de Configuração de Tela Inicial Padrão */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-border-subtle rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl text-fg">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-accent-primary">settings</span>
                <h3 className="font-bold text-sm">Configurar Tela Inicial Padrão</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1 text-fg-muted hover:text-fg rounded-lg"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-fg-muted">
              Defina um modelo base para ser carregado automaticamente toda vez que você iniciar uma nova arte.
            </p>

            {savedDefaultTemplate ? (
              <div className="p-3 rounded-xl bg-surface-hover/60 border border-border-subtle flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-fg block">{savedDefaultTemplate.title}</span>
                  <span className="text-[10px] text-fg-muted">{savedDefaultTemplate.layers.length} camadas • {savedDefaultTemplate.aspectRatio}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(storageDefaultKey);
                    const supabase = createClient();
                    supabase.auth.getUser().then(({ data: { user } }) => {
                      if (!user) return;
                      supabase.from('user_profiles').select('features_config').eq('id', user.id).maybeSingle().then(({ data }) => {
                        const curMap = { ...((data?.features_config as any)?.studio_default_template || {}) };
                        delete curMap[effectiveScopeKey];
                        supabase.rpc('merge_user_features_config', {
                          p_patch: { studio_default_template: curMap },
                        }).then(() => {}, () => {});
                      });
                    });
                    setShowConfigModal(false);
                  }}
                  className="px-2 py-1 rounded text-[11px] font-bold text-red-400 hover:bg-red-500/10 border border-red-500/20"
                >
                  Remover Padrão
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-surface-hover/30 border border-dashed border-border-subtle text-center text-xs text-fg-muted">
                Nenhum padrão configurado. O editor inicia em branco com 0 camadas.
              </div>
            )}

            {drafts.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                  Definir a partir de um Rascunho Salvo:
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {drafts.map((d) => (
                    <div
                      key={d.slotIndex}
                      className="p-2 rounded-lg bg-surface-hover/40 border border-border-subtle flex items-center justify-between text-xs"
                    >
                      <span className="truncate">{d.title || `Slot ${d.slotIndex}`}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const targetSlide = d.slides[0];
                          if (!targetSlide) return;
                          const sanitized = sanitizeCustomTemplate(targetSlide);
                          if (sanitized.ok) {
                            localStorage.setItem(storageDefaultKey, JSON.stringify(sanitized.sanitized));
                            const supabase = createClient();
                            supabase.rpc('merge_user_features_config', {
                              p_patch: { studio_default_template: { [effectiveScopeKey]: sanitized.sanitized } },
                            }).then(() => { }, () => { });
                            setShowConfigModal(false);
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-primary text-black hover:brightness-110"
                      >
                        Tornar Padrão
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:text-fg"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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