// Este programa é um software livre (Licença AGPLv3)
'use client';

export type SelfCarePillarKey =
  | 'medication'
  | 'eye_rest_20_20_20'
  | 'hydration'
  | 'stand_stretch'
  | 'bathroom_check'
  | 'nutrition_meals'
  | 'custom';

export type SelfCareSound = 'zen_bell' | 'lofi_chime' | 'soft_beep' | 'silent';

export interface SelfCareAlarmConfig {
  id: string;
  key: SelfCarePillarKey;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  intervalMinutes: number;
  fixedTimes?: string[]; // e.g. ['09:00', '12:30', '16:00', '20:00']
  todayCheckedTimes?: string[]; // Horários de hoje já marcados
  lastDoneTimestamp: number | null;
  nextTriggerTimestamp: number | null;
  soundPreference: SelfCareSound;
  dailyGoalCount?: number;
  todayCount?: number;
  isCustom?: boolean;
}

export interface SelfCareDailyLog {
  date: string; // YYYY-MM-DD
  waterGlasses: number;
  waterGoal: number;
  eyeRestsDone: number;
  stretchesDone: number;
  bathroomChecksDone: number;
  mealsDone: number;
  mealsGoal: number;
  medsTaken: boolean;
  notes?: string;
}

/**
 * Modelos de lembretes pré-definidos para o usuário escolher e ativar sob demanda.
 * Por padrão, nenhum lembrete automático é disparado sem o usuário definir explicitamente.
 */
export const SELF_CARE_TEMPLATES: Omit<SelfCareAlarmConfig, 'lastDoneTimestamp' | 'nextTriggerTimestamp'>[] = [
  {
    id: 'eye_rest',
    key: 'eye_rest_20_20_20',
    name: 'Descanso 20-20-20',
    description: 'A cada 20 min de tela, olhe a 6 metros (20 pés) por 20 segundos.',
    icon: 'visibility',
    enabled: true,
    intervalMinutes: 20,
    soundPreference: 'zen_bell',
  },
  {
    id: 'hydration',
    key: 'hydration',
    name: 'Hidratação & Água',
    description: 'Beba 1 copo de água para manter o foco e hidratação neuronal.',
    icon: 'water_drop',
    enabled: true,
    intervalMinutes: 45,
    soundPreference: 'lofi_chime',
    dailyGoalCount: 8,
    todayCount: 0,
  },
  {
    id: 'nutrition_meals',
    key: 'nutrition_meals',
    name: 'Comer / Refeições',
    description: 'Nutrição regular e interocepção gástrica: faça uma pausa para comer.',
    icon: 'soup_kitchen',
    enabled: true,
    intervalMinutes: 180,
    fixedTimes: ['09:00', '12:30', '16:00', '20:00'],
    todayCheckedTimes: [],
    soundPreference: 'lofi_chime',
    dailyGoalCount: 4,
    todayCount: 0,
  },
  {
    id: 'stand_stretch',
    key: 'stand_stretch',
    name: 'Levantar & Alongar',
    description: 'Mude de postura, alongue ombros e coluna para evitar rigidez motora.',
    icon: 'accessibility_new',
    enabled: true,
    intervalMinutes: 50,
    soundPreference: 'soft_beep',
  },
  {
    id: 'bathroom_check',
    key: 'bathroom_check',
    name: 'Checagem Interoceptiva',
    description: 'Lembrete sensorial: faça uma pausa corporal e vá ao banheiro.',
    icon: 'wc',
    enabled: true,
    intervalMinutes: 90,
    soundPreference: 'silent',
  },
  {
    id: 'medication',
    key: 'medication',
    name: 'Medicação / Suplemento',
    description: 'Horário programado de remédios de uso contínuo ou vitaminas.',
    icon: 'medication',
    enabled: true,
    intervalMinutes: 360,
    fixedTimes: ['08:00', '20:00'],
    todayCheckedTimes: [],
    soundPreference: 'zen_bell',
  },
];

// Por padrão, nenhum lembrete automático vem ativo: fica a cargo do usuário definir seus lembretes
export const DEFAULT_SELF_CARE_CONFIGS: SelfCareAlarmConfig[] = [];

const CONFIG_STORAGE_KEY = 'aurtistic_self_care_configs_v2';
const LEGACY_STORAGE_KEY = 'aurtistic_self_care_configs_v1';
const DAILY_LOG_STORAGE_KEY = 'aurtistic_self_care_daily_log_v1';

export function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getCurrentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function loadSelfCareConfigs(): SelfCareAlarmConfig[] {
  if (typeof window === 'undefined') return DEFAULT_SELF_CARE_CONFIGS;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Remove chave legada para expurgar lembretes automáticos pré-existentes
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {}
  return DEFAULT_SELF_CARE_CONFIGS;
}

export function saveSelfCareConfigs(configs: SelfCareAlarmConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
  } catch {}
}

export function loadDailySelfCareLog(): SelfCareDailyLog {
  const today = getTodayKey();
  const defaultLog: SelfCareDailyLog = {
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

  if (typeof window === 'undefined') return defaultLog;
  try {
    const raw = localStorage.getItem(DAILY_LOG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SelfCareDailyLog;
      if (parsed.date === today) {
        return { ...defaultLog, ...parsed };
      }
    }
  } catch {}
  return defaultLog;
}

export function saveDailySelfCareLog(log: SelfCareDailyLog): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DAILY_LOG_STORAGE_KEY, JSON.stringify(log));
  } catch {}
}
