// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useSelfCareAlarms } from './SelfCareAlarmProvider';
import { type SelfCareSound, type SelfCarePillarKey, SELF_CARE_TEMPLATES } from '@/lib/self-care-config';
import { HealthMedicalRemindersPanel } from './HealthMedicalRemindersPanel';

function getInitialNotificationState(): NotificationPermission | 'unsupported' {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission;
  }
  return 'unsupported';
}

const STORAGE_KEY = 'aurtistic_self_care_expanded';

function getStoredExpanded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function SelfCareHub() {
  const {
    configs,
    dailyLog,
    hyperfocusUntil,
    updateConfig,
    removeConfig,
    addFromTemplate,
    addCustomConfig,
    logCompleted,
    activateHyperfocus,
    deactivateHyperfocus,
    triggerEyeRestNow,
    addWaterGlass,
    addMealDone,
    playSound,
    requestNotificationPermission,
  } = useSelfCareAlarms();

  const [isExpanded, setIsExpanded] = useState<boolean>(getStoredExpanded);
  const openedTemporarilyByTourRef = React.useRef(false);

  const toggleExpanded = () => {
    openedTemporarilyByTourRef.current = false;
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    const handleEnsureOpen = (e: Event) => {
      const isTour = (e as CustomEvent)?.detail?.isTour;
      if (!isExpanded) {
        if (isTour) openedTemporarilyByTourRef.current = true;
        setIsExpanded(true);
      }
    };
    const handleCloseIfTemporary = () => {
      if (openedTemporarilyByTourRef.current) {
        setIsExpanded(false);
        openedTemporarilyByTourRef.current = false;
      }
    };
    window.addEventListener('aurtistic:ensure-self-care-open', handleEnsureOpen);
    window.addEventListener('aurtistic:close-self-care-if-temporary', handleCloseIfTemporary);
    return () => {
      window.removeEventListener('aurtistic:ensure-self-care-open', handleEnsureOpen);
      window.removeEventListener('aurtistic:close-self-care-if-temporary', handleCloseIfTemporary);
    };
  }, [isExpanded]);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isNewCareModalOpen, setIsNewCareModalOpen] = useState(false);
  const [newCareName, setNewCareName] = useState('');
  const [newCareDesc, setNewCareDesc] = useState('');
  const [newCareInterval, setNewCareInterval] = useState(60);
  const [newCareIcon, setNewCareIcon] = useState('spa');
  const [newCareSound, setNewCareSound] = useState<SelfCareSound>('zen_bell');

  const [notificationState, setNotificationState] = useState<NotificationPermission | 'unsupported'>(
    getInitialNotificationState
  );

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationState('granted');
    }
  };

  const handleCreateCustomCare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCareName.trim()) return;

    addCustomConfig({
      key: 'custom',
      name: newCareName.trim(),
      description: newCareDesc.trim() || 'Lembrete de autocuidado personalizado.',
      icon: newCareIcon,
      enabled: true,
      intervalMinutes: Number(newCareInterval) || 60,
      soundPreference: newCareSound,
    });

    setNewCareName('');
    setNewCareDesc('');
    setIsNewCareModalOpen(false);
  };

  const waterCount = dailyLog.waterGlasses || 0;
  const waterGoal = dailyLog.waterGoal || 8;
  const mealsCount = dailyLog.mealsDone || 0;
  const mealsGoal = dailyLog.mealsGoal || 4;

  const isHyperfocusActive =
    hyperfocusUntil !== null && hyperfocusUntil > Date.now();
  const hyperfocusRemainingMin = isHyperfocusActive
    ? Math.max(1, Math.round((hyperfocusUntil - Date.now()) / 60000))
    : 0;

  return (
    <div
      data-tour="self-care-hub"
      className="mb-4 rounded-2xl border border-[var(--border-subtle,#2D2D2D)] bg-[var(--surface-primary,#1A1A1A)] p-3 sm:p-4 shadow-sm transition-all"
    >
      {/* Topo do Hub de Cuidados: Barra Compacta & Expansível */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex items-center gap-2.5 text-left group min-w-0"
        >
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary,#9D4EDD)]/15 border border-[var(--accent-primary,#9D4EDD)]/30 flex items-center justify-center text-[var(--accent-primary,#9D4EDD)] shrink-0 group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-[18px]">spa</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#F5F5F5)] group-hover:text-[var(--accent-secondary,#FFCC00)] transition-colors">
                Autocuidado & Interocepção
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--surface-secondary,#242424)] text-[var(--text-secondary,#A0A0A0)]">
                Neurodivergente
              </span>
              {isHyperfocusActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-secondary,#FFCC00)] text-[#121212] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">psychology</span>
                  Hiperfoco ({hyperfocusRemainingMin}m)
                </span>
              )}
            </div>

            {/* Subtítulo no modo expandido vs Chips de status no modo compacto */}
            {isExpanded ? (
              <p className="text-[11px] text-[var(--text-muted,#8E8E8E)] mt-0.5">
                Pausas sensoriais, hidratação, refeições e proteção da visão contra fadiga de hiperfoco.
              </p>
            ) : (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {configs.length === 0 ? (
                  <span className="text-[11px] text-[var(--text-muted,#8E8E8E)]">
                    Nenhum lembrete ativo (toque para expandir)
                  </span>
                ) : (
                  <>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--surface-secondary,#242424)] text-[var(--accent-primary,#9D4EDD)] border border-[var(--border-subtle,#2D2D2D)]">
                      {configs.filter((c) => c.enabled).length} ativos
                    </span>
                    {configs.some((c) => c.key === 'hydration' && c.enabled) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[11px]">water_drop</span>
                        {waterCount}/{waterGoal}
                      </span>
                    )}
                    {configs.some((c) => c.key === 'nutrition_meals' && c.enabled) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[11px]">soup_kitchen</span>
                        {mealsCount}/{mealsGoal}
                      </span>
                    )}
                    {configs.some((c) => c.key === 'eye_rest_20_20_20' && c.enabled) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[11px]">visibility</span>
                        {dailyLog.eyeRestsDone || 0}
                      </span>
                    )}
                    {configs.some((c) => c.key === 'medication' && c.enabled) && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          dailyLog.medsTaken
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[11px]">medication</span>
                        {dailyLog.medsTaken ? 'Tomado' : 'Pendente'}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </button>

        {/* Ações da Direita */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isExpanded ? (
            <>
              {/* Botão Testar Som */}
              <button
                type="button"
                onClick={() => playSound('zen_bell')}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] text-[var(--text-secondary,#A0A0A0)] hover:text-[var(--text-primary,#F5F5F5)] border border-[var(--border-subtle,#2D2D2D)] flex items-center gap-1 transition-colors"
                title="Testar sintetizador Web Audio nativo"
              >
                <span className="material-symbols-outlined text-[14px] text-[var(--accent-secondary,#FFCC00)]">volume_up</span>
                <span className="hidden sm:inline">Testar Som</span>
              </button>

              {/* Botão Modo Hiperfoco */}
              {isHyperfocusActive ? (
                <button
                  type="button"
                  onClick={deactivateHyperfocus}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 transition-colors"
                  title="Desativar modo hiperfoco"
                >
                  <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                  <span>Encerrar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => activateHyperfocus(60)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] text-[var(--text-secondary,#A0A0A0)] hover:text-[var(--text-primary,#F5F5F5)] border border-[var(--border-subtle,#2D2D2D)] flex items-center gap-1 transition-colors"
                  title="Pausar alertas leves por 60 min"
                >
                  <span className="material-symbols-outlined text-[14px]">psychology</span>
                  <span className="hidden sm:inline">Hiperfoco 1h</span>
                </button>
              )}

              {/* Botão + Novo Cuidado */}
              <button
                type="button"
                onClick={() => setIsNewCareModalOpen(true)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] text-[var(--text-secondary,#A0A0A0)] hover:text-[var(--text-primary,#F5F5F5)] border border-[var(--border-subtle,#2D2D2D)] flex items-center gap-1 transition-colors"
                title="Criar novo alarme de autocuidado"
              >
                <span className="material-symbols-outlined text-[14px] text-[var(--accent-primary,#9D4EDD)]">add</span>
                <span className="hidden sm:inline">Novo Cuidado</span>
              </button>

              {notificationState !== 'granted' && notificationState !== 'unsupported' && (
                <button
                  type="button"
                  onClick={handleRequestNotifications}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] text-[var(--text-secondary,#A0A0A0)] hover:text-[var(--text-primary,#F5F5F5)] border border-[var(--border-subtle,#2D2D2D)] flex items-center gap-1 transition-colors"
                  title="Permitir notificações do navegador em segundo plano"
                >
                  <span className="material-symbols-outlined text-[14px] text-amber-400">
                    notifications_active
                  </span>
                  <span className="hidden sm:inline">Alertas</span>
                </button>
              )}

              {/* Botão Configurar */}
              <button
                type="button"
                onClick={() => setIsConfigOpen((prev) => !prev)}
                className="p-1.5 rounded-lg text-[var(--text-muted,#8E8E8E)] hover:text-[var(--text-primary,#F5F5F5)] hover:bg-[var(--surface-hover,#2D2D2D)] transition-colors"
                title="Configurar intervalos e sons dos alarmes"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsNewCareModalOpen(true)}
              className="p-1.5 rounded-lg text-[var(--text-muted,#8E8E8E)] hover:text-[var(--accent-primary,#9D4EDD)] hover:bg-[var(--surface-hover,#2D2D2D)] transition-colors"
              title="Definir novo lembrete de autocuidado"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          )}

          {/* Botão de Expandir / Recolher com Chevron Animado */}
          <button
            type="button"
            onClick={toggleExpanded}
            className="p-1.5 rounded-lg text-[var(--text-muted,#8E8E8E)] hover:text-[var(--text-primary,#F5F5F5)] hover:bg-[var(--surface-hover,#2D2D2D)] transition-colors"
            title={isExpanded ? 'Recolher menu de autocuidado' : 'Expandir menu de autocuidado'}
            aria-label={isExpanded ? 'Recolher menu de autocuidado' : 'Expandir menu de autocuidado'}
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-transform duration-200 block ${
                isExpanded ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>
        </div>
      </div>

      {/* Conteúdo Expansível: Pílulas Interativas ou Estado Vazio */}
      {isExpanded && (
        <div className="pt-2 animate-in fade-in duration-200">
          {configs.length === 0 ? (
            <div className="mt-2 p-4 rounded-xl bg-[var(--surface-secondary,#242424)] border border-dashed border-[var(--border-subtle,#2D2D2D)] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary,#9D4EDD)]/15 border border-[var(--accent-primary,#9D4EDD)]/30 text-[var(--accent-primary,#9D4EDD)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">alarm_on</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)] block">
                    Nenhum lembrete automático ativo
                  </span>
                  <span className="text-[11px] text-[var(--text-muted,#8E8E8E)] block">
                    Defina os lembretes de autocuidado de acordo com sua rotina pessoal (hidratação, pausas, refeições, remédios).
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCareModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[var(--accent-primary,#9D4EDD)] text-white hover:opacity-90 font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Definir Lembrete</span>
              </button>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {/* Pílula 1: Água / Hidratação */}
              {configs.some((c) => c.key === 'hydration') && (
                <button
                  type="button"
                  onClick={addWaterGlass}
                  className="group p-2.5 rounded-xl bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] flex items-center justify-between gap-2 text-left transition-all"
                  title="Clique para adicionar +1 copo d'água"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-cyan-400 group-hover:scale-110 transition-transform">
                      water_drop
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Água</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {waterCount}/{waterGoal} copos
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-cyan-400 opacity-60 group-hover:opacity-100">
                    +1
                  </span>
                </button>
              )}

              {/* Pílula 2: Descanso Visual 20-20-20 */}
              {configs.some((c) => c.key === 'eye_rest_20_20_20') && (
                <button
                  type="button"
                  onClick={triggerEyeRestNow}
                  className="group p-2.5 rounded-xl bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] flex items-center justify-between gap-2 text-left transition-all"
                  title="Iniciar contagem de 20s para descanso visual"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-amber-400 group-hover:scale-110 transition-transform">
                      visibility
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Visão 20-20</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {dailyLog.eyeRestsDone || 0} feitas
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-amber-400 opacity-60 group-hover:opacity-100">
                    play_arrow
                  </span>
                </button>
              )}

              {/* Pílula 3: Comer / Refeições */}
              {configs.some((c) => c.key === 'nutrition_meals') && (
                <button
                  type="button"
                  onClick={addMealDone}
                  className="group p-2.5 rounded-xl bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] flex items-center justify-between gap-2 text-left transition-all"
                  title="Registrar refeição realizada"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-orange-400 group-hover:scale-110 transition-transform">
                      soup_kitchen
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Refeições</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {mealsCount}/{mealsGoal} feitas
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-orange-400 opacity-60 group-hover:opacity-100">
                    +1
                  </span>
                </button>
              )}

              {/* Pílula 4: Levantar & Alongar */}
              {configs.some((c) => c.key === 'stand_stretch') && (
                <button
                  type="button"
                  onClick={() => logCompleted('stand_stretch')}
                  className="group p-2.5 rounded-xl bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] flex items-center justify-between gap-2 text-left transition-all"
                  title="Marcar que se levantou ou alongou"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-emerald-400 group-hover:scale-110 transition-transform">
                      accessibility_new
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Alongar</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {dailyLog.stretchesDone || 0} vezes
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-emerald-400 opacity-60 group-hover:opacity-100">
                    check
                  </span>
                </button>
              )}

              {/* Pílula 5: Checagem de Banheiro */}
              {configs.some((c) => c.key === 'bathroom_check') && (
                <button
                  type="button"
                  onClick={() => logCompleted('bathroom_check')}
                  className="group p-2.5 rounded-xl bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] flex items-center justify-between gap-2 text-left transition-all"
                  title="Checagem sensorial de bexiga / banheiro"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-purple-400 group-hover:scale-110 transition-transform">
                      wc
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Banheiro</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {dailyLog.bathroomChecksDone || 0} vezes
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-purple-400 opacity-60 group-hover:opacity-100">
                    done
                  </span>
                </button>
              )}

              {/* Pílula 6: Medicação */}
              {configs.some((c) => c.key === 'medication') && (
                <button
                  type="button"
                  onClick={() => logCompleted('medication')}
                  className={`group p-2.5 rounded-xl border flex items-center justify-between gap-2 text-left transition-all ${
                    dailyLog.medsTaken
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border-[var(--border-subtle,#2D2D2D)]'
                  }`}
                  title="Registrar medicação do dia tomada"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        dailyLog.medsTaken ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      medication
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">Remédios</span>
                      <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                        {dailyLog.medsTaken ? 'Tomado ✓' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      dailyLog.medsTaken ? 'text-emerald-400' : 'text-rose-400 opacity-60'
                    }`}
                  >
                    {dailyLog.medsTaken ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Painel de Consultas, Exames & Saúde Preventiva (LGPD Local) */}
          <HealthMedicalRemindersPanel />
        </div>
      )}

      {/* Modal / Formulário: + Novo Cuidado */}
      {isNewCareModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#2D2D2D)] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary,#9D4EDD)]">
                  add_circle
                </span>
                <h3 className="text-sm font-bold text-[var(--text-primary,#F5F5F5)]">
                  Definir Lembrete de Autocuidado
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCareModalOpen(false)}
                className="text-[var(--text-muted,#8E8E8E)] hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modelos Prontos de 1 Clique */}
            <div>
              <span className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-2">
                Modelos de Autocuidado (1 Clique para Ativar)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SELF_CARE_TEMPLATES.map((tmpl) => {
                  const isAlreadyAdded = configs.some((c) => c.key === tmpl.key || c.name === tmpl.name);
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      disabled={isAlreadyAdded}
                      onClick={() => {
                        addFromTemplate(tmpl.id);
                        setIsNewCareModalOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                        isAlreadyAdded
                          ? 'bg-[var(--surface-secondary,#242424)]/50 border-[var(--border-subtle,#2D2D2D)] opacity-50 cursor-not-allowed'
                          : 'bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border-[var(--border-subtle,#2D2D2D)] hover:border-[var(--accent-primary,#9D4EDD)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary,#9D4EDD)]">
                          {tmpl.icon}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)] block truncate">
                            {tmpl.name}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block truncate">
                            {tmpl.intervalMinutes ? `A cada ${tmpl.intervalMinutes}m` : 'Horários fixos'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[var(--accent-primary,#9D4EDD)] shrink-0">
                        {isAlreadyAdded ? 'Ativo ✓' : '+ Ativar'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-[1px] bg-[var(--border-subtle,#2D2D2D)] my-2" />

            <div>
              <span className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-2">
                Ou Criar Lembrete Personalizado
              </span>
              <form onSubmit={handleCreateCustomCare} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                    Nome do Cuidado
                  </label>
                  <input
                    type="text"
                    required
                    value={newCareName}
                    onChange={(e) => setNewCareName(e.target.value)}
                    placeholder="Ex: Descansar Ombros, Gotas nos Olhos..."
                    className="w-full bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#F5F5F5)] focus:outline-none focus:border-[var(--accent-primary,#9D4EDD)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                    Descrição ou Dica
                  </label>
                  <input
                    type="text"
                    value={newCareDesc}
                    onChange={(e) => setNewCareDesc(e.target.value)}
                    placeholder="Ex: Respiração profunda em 4 tempos"
                    className="w-full bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#F5F5F5)] focus:outline-none focus:border-[var(--accent-primary,#9D4EDD)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                      Intervalo
                    </label>
                    <select
                      value={newCareInterval}
                      onChange={(e) => setNewCareInterval(Number(e.target.value))}
                      className="w-full bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] rounded-lg px-2.5 py-2 text-xs text-[var(--text-primary,#F5F5F5)] focus:outline-none"
                    >
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={45}>45 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1h 30m</option>
                      <option value={120}>2 horas</option>
                      <option value={180}>3 horas</option>
                      <option value={240}>4 horas</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                      Som
                    </label>
                    <select
                      value={newCareSound}
                      onChange={(e) => setNewCareSound(e.target.value as SelfCareSound)}
                      className="w-full bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] rounded-lg px-2.5 py-2 text-xs text-[var(--text-primary,#F5F5F5)] focus:outline-none"
                    >
                      <option value="zen_bell">Sino Zen (528 Hz)</option>
                      <option value="lofi_chime">Acorde Lo-Fi</option>
                      <option value="soft_beep">Bipe Suave</option>
                      <option value="silent">Silencioso</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle,#2D2D2D)]">
                  <button
                    type="button"
                    onClick={() => setIsNewCareModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted,#8E8E8E)] hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-primary,#9D4EDD)] text-white hover:opacity-90"
                  >
                    Salvar Cuidado
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Painel Expansível de Configurações */}
      {isConfigOpen && (
        <div className="mt-4 p-4 rounded-xl bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#F5F5F5)]">
              Ajuste de Alarmes e Intervalos
            </h4>
            <button
              type="button"
              onClick={() => setIsConfigOpen(false)}
              className="text-xs text-[var(--text-muted,#8E8E8E)] hover:text-[var(--text-primary,#F5F5F5)]"
            >
              Fechar
            </button>
          </div>

          <div className="space-y-3">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] flex-wrap"
              >
                <div className="flex items-center gap-2 min-w-[180px]">
                  <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary,#9D4EDD)]">
                    {cfg.icon}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)] block">
                      {cfg.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted,#8E8E8E)] block">
                      {cfg.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Seletor de Intervalo */}
                  <label className="flex items-center gap-1 text-[11px] text-[var(--text-secondary,#A0A0A0)]">
                    <span>A cada:</span>
                    <select
                      value={cfg.intervalMinutes}
                      onChange={(e) =>
                        updateConfig(cfg.id, { intervalMinutes: Number(e.target.value) })
                      }
                      className="bg-[var(--surface-secondary,#242424)] text-[var(--text-primary,#F5F5F5)] px-2 py-1 rounded text-xs border border-[var(--border-subtle,#2D2D2D)] focus:outline-none"
                    >
                      <option value={15}>15 min</option>
                      <option value={20}>20 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>2 horas</option>
                      <option value={180}>3 horas</option>
                      <option value={360}>6 horas</option>
                    </select>
                  </label>

                  {/* Seletor de Som */}
                  <div className="flex items-center gap-1">
                    <select
                      value={cfg.soundPreference}
                      onChange={(e) =>
                        updateConfig(cfg.id, {
                          soundPreference: e.target.value as SelfCareSound,
                        })
                      }
                      className="bg-[var(--surface-secondary,#242424)] text-[var(--text-primary,#F5F5F5)] px-2 py-1 rounded text-xs border border-[var(--border-subtle,#2D2D2D)] focus:outline-none"
                    >
                      <option value="zen_bell">Sino Zen (528 Hz)</option>
                      <option value="lofi_chime">Acorde Lo-Fi</option>
                      <option value="soft_beep">Bipe Suave</option>
                      <option value="silent">Silencioso</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => playSound(cfg.soundPreference)}
                      className="p-1 text-[var(--text-muted,#8E8E8E)] hover:text-[var(--accent-primary,#9D4EDD)]"
                      title="Testar som"
                    >
                      <span className="material-symbols-outlined text-[16px]">volume_up</span>
                    </button>
                  </div>

                  {/* Toggle Ativo/Inativo */}
                  <button
                    type="button"
                    onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      cfg.enabled
                        ? 'bg-[var(--accent-primary,#9D4EDD)] text-white'
                        : 'bg-[var(--surface-secondary,#242424)] text-[var(--text-muted,#8E8E8E)] hover:text-white'
                    }`}
                  >
                    {cfg.enabled ? 'Ativo' : 'Pausado'}
                  </button>

                  {/* Excluir Cuidado */}
                  <button
                    type="button"
                    onClick={() => removeConfig(cfg.id)}
                    className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 rounded-lg transition-colors"
                    title="Excluir lembrete"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
