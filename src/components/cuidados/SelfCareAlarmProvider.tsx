// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  SelfCareAlarmConfig,
  SelfCareDailyLog,
  SelfCarePillarKey,
  SelfCareSound,
  SELF_CARE_TEMPLATES,
  getTodayKey,
  getCurrentHHMM,
  loadSelfCareConfigs,
  saveSelfCareConfigs,
  loadDailySelfCareLog,
  saveDailySelfCareLog,
} from '@/lib/self-care-config';
import { EyeRest202020Overlay } from './EyeRest202020Overlay';

export interface SelfCareAlarmContextType {
  configs: SelfCareAlarmConfig[];
  dailyLog: SelfCareDailyLog;
  activeAlarm: SelfCareAlarmConfig | null;
  hyperfocusUntil: number | null;
  updateConfig: (id: string, updates: Partial<SelfCareAlarmConfig>) => void;
  removeConfig: (id: string) => void;
  addFromTemplate: (templateId: string) => void;
  addCustomConfig: (newConfig: Omit<SelfCareAlarmConfig, 'id' | 'lastDoneTimestamp' | 'nextTriggerTimestamp' | 'isCustom'>) => void;
  logCompleted: (key: SelfCarePillarKey) => void;
  snoozeAlarm: (id: string, minutes?: number) => void;
  dismissAlarm: (id: string) => void;
  activateHyperfocus: (minutes?: number) => void;
  deactivateHyperfocus: () => void;
  triggerEyeRestNow: () => void;
  addWaterGlass: () => void;
  addMealDone: () => void;
  playSound: (sound: SelfCareSound) => void;
  requestNotificationPermission: () => Promise<boolean>;
}

const SelfCareAlarmContext = createContext<SelfCareAlarmContextType | null>(null);

export function useSelfCareAlarms() {
  const ctx = useContext(SelfCareAlarmContext);
  if (!ctx) {
    throw new Error('useSelfCareAlarms deve ser utilizado dentro de um SelfCareAlarmProvider');
  }
  return ctx;
}

// =========================================================================
// SINGLETON AUDIO CONTEXT (Web Audio API - Previne exaustão de limites do navegador)
// =========================================================================
let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (err) {
    console.warn('[SelfCareAudio] Erro ao instanciar singleton AudioContext:', err);
    return null;
  }
}

// Desbloqueia a política de Autoplay no primeiro toque/clique do usuário
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true, once: false });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: false });
  window.addEventListener('touchstart', unlockAudio, { passive: true, once: false });
}

function synthesizeAudioTone(type: SelfCareSound) {
  if (type === 'silent' || typeof window === 'undefined') return;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (type === 'zen_bell') {
      // Sino Zen Harmonioso (Frequência Solfeggio 528 Hz + decay exponencial suave)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 3.0);
    } else if (type === 'lofi_chime') {
      // Acorde Lo-Fi Cálido (Dueto 659.25 Hz [E5] + 830.61 Hz [G#5])
      [659.25, 830.61].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const startTime = ctx.currentTime + idx * 0.08;
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 2.2);
      });
    } else if (type === 'soft_beep') {
      // Bipe discreto e calmo (440 Hz -> 554 Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (err) {
    console.warn('[SelfCareAudio] Erro ao sintetizar áudio:', err);
  }
}

const HYPERFOCUS_STORAGE_KEY = 'aurtistic_self_care_hyperfocus_until';

export function SelfCareAlarmProvider({ children }: { children: React.ReactNode }) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [configs, setConfigs] = useState<SelfCareAlarmConfig[]>(() => loadSelfCareConfigs());
  const [dailyLog, setDailyLog] = useState<SelfCareDailyLog>(() => loadDailySelfCareLog());
  const [activeAlarm, setActiveAlarm] = useState<SelfCareAlarmConfig | null>(null);
  const [isEyeRestOpen, setIsEyeRestOpen] = useState(false);
  const [hyperfocusUntil, setHyperfocusUntil] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(HYPERFOCUS_STORAGE_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        return val > Date.now() ? val : null;
      }
    } catch {}
    return null;
  });

  const configsRef = useRef(configs);
  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);

  const hyperfocusRef = useRef(hyperfocusUntil);
  useEffect(() => {
    hyperfocusRef.current = hyperfocusUntil;
  }, [hyperfocusUntil]);

  const dailyLogRef = useRef(dailyLog);
  useEffect(() => {
    dailyLogRef.current = dailyLog;
  }, [dailyLog]);

  const playSound = useCallback((sound: SelfCareSound) => {
    if (sound !== 'silent') {
      synthesizeAudioTone(sound);
    }
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    }
    return false;
  }, []);

  const activateHyperfocus = useCallback((minutes: number = 60) => {
    const until = Date.now() + minutes * 60 * 1000;
    setHyperfocusUntil(until);
    try {
      localStorage.setItem(HYPERFOCUS_STORAGE_KEY, until.toString());
    } catch {}

    // Fecha alarme ativo se for alarme leve
    if (activeAlarm && activeAlarm.key !== 'medication' && activeAlarm.key !== 'nutrition_meals') {
      setActiveAlarm(null);
    }
  }, [activeAlarm]);

  const deactivateHyperfocus = useCallback(() => {
    setHyperfocusUntil(null);
    try {
      localStorage.removeItem(HYPERFOCUS_STORAGE_KEY);
    } catch {}
  }, []);

  const updateConfig = useCallback((id: string, updates: Partial<SelfCareAlarmConfig>) => {
    setConfigs((prev) => {
      const next = prev.map((cfg) => {
        if (cfg.id === id) {
          const updated = { ...cfg, ...updates };
          if (updates.enabled === true && !updated.nextTriggerTimestamp) {
            updated.nextTriggerTimestamp = Date.now() + updated.intervalMinutes * 60 * 1000;
          } else if (updates.enabled === false) {
            updated.nextTriggerTimestamp = null;
          }
          return updated;
        }
        return cfg;
      });
      saveSelfCareConfigs(next);
      return next;
    });

    if (updates.enabled === false) {
      setActiveAlarm((curr) => (curr?.id === id ? null : curr));
      const target = configsRef.current.find((c) => c.id === id);
      if (target?.key === 'eye_rest_20_20_20') {
        setIsEyeRestOpen(false);
      }
    }
  }, []);

  const removeConfig = useCallback((id: string) => {
    const target = configsRef.current.find((c) => c.id === id);
    setConfigs((prev) => {
      const next = prev.filter((cfg) => cfg.id !== id);
      saveSelfCareConfigs(next);
      return next;
    });
    setActiveAlarm((curr) => (curr?.id === id ? null : curr));
    if (target?.key === 'eye_rest_20_20_20') {
      setIsEyeRestOpen(false);
    }
  }, []);

  const addFromTemplate = useCallback((templateId: string) => {
    const tmpl = SELF_CARE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    const now = Date.now();
    const fullConfig: SelfCareAlarmConfig = {
      ...tmpl,
      id: `${tmpl.id}_${Date.now()}`,
      enabled: true,
      lastDoneTimestamp: null,
      nextTriggerTimestamp: now + tmpl.intervalMinutes * 60 * 1000,
    };
    setConfigs((prev) => {
      const next = [...prev, fullConfig];
      saveSelfCareConfigs(next);
      return next;
    });
  }, []);

  const addCustomConfig = useCallback(
    (newConfig: Omit<SelfCareAlarmConfig, 'id' | 'lastDoneTimestamp' | 'nextTriggerTimestamp' | 'isCustom'>) => {
      const id = `custom_${Date.now()}`;
      const now = Date.now();
      const fullConfig: SelfCareAlarmConfig = {
        ...newConfig,
        id,
        isCustom: true,
        lastDoneTimestamp: null,
        nextTriggerTimestamp: now + newConfig.intervalMinutes * 60 * 1000,
      };

      setConfigs((prev) => {
        const next = [...prev, fullConfig];
        saveSelfCareConfigs(next);
        return next;
      });
    },
    []
  );

  const logCompleted = useCallback((key: SelfCarePillarKey) => {
    const now = Date.now();
    const currentHHMM = getCurrentHHMM();

    setDailyLog((prev) => {
      const next = { ...prev };
      if (key === 'hydration') next.waterGlasses = (next.waterGlasses || 0) + 1;
      if (key === 'eye_rest_20_20_20') next.eyeRestsDone = (next.eyeRestsDone || 0) + 1;
      if (key === 'stand_stretch') next.stretchesDone = (next.stretchesDone || 0) + 1;
      if (key === 'bathroom_check') next.bathroomChecksDone = (next.bathroomChecksDone || 0) + 1;
      if (key === 'nutrition_meals') next.mealsDone = (next.mealsDone || 0) + 1;
      if (key === 'medication') next.medsTaken = true;
      saveDailySelfCareLog(next);
      return next;
    });

    setConfigs((prev) => {
      const next = prev.map((cfg) => {
        if (cfg.key === key) {
          const checked = cfg.todayCheckedTimes || [];
          return {
            ...cfg,
            lastDoneTimestamp: now,
            todayCount: (cfg.todayCount || 0) + 1,
            todayCheckedTimes: checked.includes(currentHHMM) ? checked : [...checked, currentHHMM],
            nextTriggerTimestamp: now + cfg.intervalMinutes * 60 * 1000,
          };
        }
        return cfg;
      });
      saveSelfCareConfigs(next);
      return next;
    });

    setActiveAlarm(null);
  }, []);

  const snoozeAlarm = useCallback((id: string, minutes: number = 5) => {
    const now = Date.now();
    setConfigs((prev) => {
      const next = prev.map((cfg) => {
        if (cfg.id === id) {
          return {
            ...cfg,
            nextTriggerTimestamp: now + minutes * 60 * 1000,
          };
        }
        return cfg;
      });
      saveSelfCareConfigs(next);
      return next;
    });
    setActiveAlarm(null);
  }, []);

  const dismissAlarm = useCallback((id: string) => {
    const now = Date.now();
    setConfigs((prev) => {
      const next = prev.map((cfg) => {
        if (cfg.id === id) {
          return {
            ...cfg,
            nextTriggerTimestamp: now + cfg.intervalMinutes * 60 * 1000,
          };
        }
        return cfg;
      });
      saveSelfCareConfigs(next);
      return next;
    });
    setActiveAlarm(null);
  }, []);

  const addWaterGlass = useCallback(() => {
    logCompleted('hydration');
  }, [logCompleted]);

  const addMealDone = useCallback(() => {
    logCompleted('nutrition_meals');
  }, [logCompleted]);

  const triggerEyeRestNow = useCallback(() => {
    setIsEyeRestOpen(true);
  }, []);

  // =========================================================================
  // RESET DIÁRIO AUTOMÁTICO À MEIA-NOITE (00:00)
  // =========================================================================
  useEffect(() => {
    if (!isClient) return;
    const today = getTodayKey();

    if (dailyLog.date !== today) {
      const freshLog: SelfCareDailyLog = {
        date: today,
        waterGlasses: 0,
        waterGoal: 8,
        eyeRestsDone: 0,
        stretchesDone: 0,
        bathroomChecksDone: 0,
        mealsDone: 0,
        mealsGoal: 4,
        medsTaken: false,
      };
      queueMicrotask(() => {
        setDailyLog(freshLog);
        saveDailySelfCareLog(freshLog);

        // Zera contadores diários nas configs
        setConfigs((prev) => {
          const next = prev.map((c) => ({
            ...c,
            todayCount: 0,
            todayCheckedTimes: [],
          }));
          saveSelfCareConfigs(next);
          return next;
        });
      });
    }
  }, [isClient, dailyLog.date]);

  // =========================================================================
  // LOOP DE VERIFICAÇÃO DE ALARMES & DOSES ATRASADAS (A CADA 10s)
  // =========================================================================
  useEffect(() => {
    if (!isClient) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const today = getTodayKey();
      const currentHHMM = getCurrentHHMM();

      // Checa se o dia mudou durante o uso contínuo (virada de meia-noite)
      if (dailyLogRef.current.date !== today) {
        const freshLog: SelfCareDailyLog = {
          date: today,
          waterGlasses: 0,
          waterGoal: 8,
          eyeRestsDone: 0,
          stretchesDone: 0,
          bathroomChecksDone: 0,
          mealsDone: 0,
          mealsGoal: 4,
          medsTaken: false,
        };
        setDailyLog(freshLog);
        saveDailySelfCareLog(freshLog);
      }

      const isHyperfocusActive =
        hyperfocusRef.current !== null && hyperfocusRef.current > now;

      const currentConfigs = configsRef.current;

      for (const cfg of currentConfigs) {
        if (!cfg.enabled) continue;

        // No Modo Hiperfoco, suprime alertas leves (mantém apenas medicação e refeições)
        if (isHyperfocusActive && cfg.key !== 'medication' && cfg.key !== 'nutrition_meals') {
          continue;
        }

        let shouldTrigger = false;

        // 1. Verificação por Intervalo e Timestamp Real
        if (cfg.nextTriggerTimestamp && cfg.nextTriggerTimestamp <= now) {
          shouldTrigger = true;
        }

        // 2. Verificação de Horários Fixos Atrasados (HH:mm) para Medicamentos e Refeições
        if (
          !shouldTrigger &&
          Array.isArray(cfg.fixedTimes) &&
          cfg.fixedTimes.length > 0
        ) {
          const checked = cfg.todayCheckedTimes || [];
          for (const timeStr of cfg.fixedTimes) {
            if (timeStr <= currentHHMM && !checked.includes(timeStr)) {
              shouldTrigger = true;
              break;
            }
          }
        }

        if (shouldTrigger && (!activeAlarm || activeAlarm.id !== cfg.id)) {
          setActiveAlarm(cfg);
          playSound(cfg.soundPreference);

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(`Aurtistic Cuidados: ${cfg.name}`, {
                body: cfg.description,
                icon: '/aurtistic_app_icon_v12.png',
                tag: cfg.id,
              });
            } catch {}
          }
          break;
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isClient, activeAlarm, playSound]);

  return (
    <SelfCareAlarmContext.Provider
      value={{
        configs,
        dailyLog,
        activeAlarm,
        hyperfocusUntil,
        updateConfig,
        removeConfig,
        addFromTemplate,
        addCustomConfig,
        logCompleted,
        snoozeAlarm,
        dismissAlarm,
        activateHyperfocus,
        deactivateHyperfocus,
        triggerEyeRestNow,
        addWaterGlass,
        addMealDone,
        playSound,
        requestNotificationPermission,
      }}
    >
      {children}

      <EyeRest202020Overlay
        isOpen={isEyeRestOpen}
        onComplete={() => {
          setIsEyeRestOpen(false);
          logCompleted('eye_rest_20_20_20');
        }}
        onDismiss={() => setIsEyeRestOpen(false)}
        onPlayChime={() => playSound('zen_bell')}
      />

      {/* Card Flutuante de Alarme com Suporte a Hiperfoco */}
      {activeAlarm && !isEyeRestOpen && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-[160] max-w-sm w-full bg-[var(--surface-primary,#1A1A1A)] border-2 border-[var(--accent-primary,#9D4EDD)] rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary,#9D4EDD)]/15 border border-[var(--accent-primary,#9D4EDD)]/30 flex items-center justify-center shrink-0 text-[var(--accent-primary,#9D4EDD)]">
              <span className="material-symbols-outlined text-[24px]">
                {activeAlarm.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary,#9D4EDD)]">
                  Lembrete de Autocuidado
                </span>
                <button
                  type="button"
                  onClick={() => dismissAlarm(activeAlarm.id)}
                  className="p-0.5 text-[var(--text-muted,#8E8E8E)] hover:text-[var(--text-primary,#F5F5F5)]"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
              <h4 className="text-sm font-bold text-[var(--text-primary,#F5F5F5)] truncate">
                {activeAlarm.name}
              </h4>
              <p className="text-xs text-[var(--text-secondary,#A0A0A0)] mt-0.5 leading-relaxed">
                {activeAlarm.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle,#2D2D2D)]">
            {/* Botão Modo Hiperfoco 1h */}
            <button
              type="button"
              onClick={() => activateHyperfocus(60)}
              className="text-[11px] font-bold text-[var(--accent-secondary,#FFCC00)] hover:underline flex items-center gap-1"
              title="Pausa alertas leves por 60 min (mantém apenas medicação e refeições)"
            >
              <span className="material-symbols-outlined text-[14px]">psychology</span>
              <span>Modo Hiperfoco 1h</span>
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={() => dismissAlarm(activeAlarm.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted,#8E8E8E)] hover:text-[var(--text-primary,#F5F5F5)] hover:bg-[var(--surface-hover,#2D2D2D)] transition-colors"
              >
                Dispensar
              </button>
              <button
                type="button"
                onClick={() => snoozeAlarm(activeAlarm.id, 5)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-secondary,#242424)] text-[var(--text-secondary,#A0A0A0)] hover:text-[var(--text-primary,#F5F5F5)] border border-[var(--border-subtle,#2D2D2D)] transition-colors"
              >
                +5m
              </button>

              {activeAlarm.key === 'eye_rest_20_20_20' ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveAlarm(null);
                    setIsEyeRestOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-primary,#9D4EDD)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[14px]">timer</span>
                  Iniciar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => logCompleted(activeAlarm.key)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-primary,#9D4EDD)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[14px]">check</span>
                  Feito ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </SelfCareAlarmContext.Provider>
  );
}
