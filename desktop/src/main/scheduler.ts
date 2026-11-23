// Este programa é um software livre (Licença AGPLv3)
export interface AlarmConfigItem {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  fixedTimes?: string[];
  todayCheckedTimes?: string[];
  nextTriggerTimestamp?: number;
}

export interface TaskReminderItem {
  id: string;
  title: string;
  dueTimestamp: number;
}

export interface DesktopNotificationEvent {
  tag: string;
  title: string;
  body: string;
  kind: 'self_care' | 'eye_rest_20_20_20' | 'task_1h';
  autoOpenOverlay?: boolean;
}

export class DesktopScheduler {
  private alarmConfigs: AlarmConfigItem[] = [];
  private tasks: TaskReminderItem[] = [];
  private hyperfocusUntil: number | null = null;
  private eyeRestAutoOverlay = false;
  private notifiedKeys = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private onNotify: (evt: DesktopNotificationEvent) => void;

  constructor(onNotify: (evt: DesktopNotificationEvent) => void) {
    this.onNotify = onNotify;
  }

  setEyeRestAutoOverlay(enabled: boolean): void {
    this.eyeRestAutoOverlay = Boolean(enabled);
  }

  getEyeRestAutoOverlay(): boolean {
    return this.eyeRestAutoOverlay;
  }

  syncSelfCare(payload: { configs?: AlarmConfigItem[]; hyperfocusUntil?: number | null }): void {
    if (Array.isArray(payload?.configs)) {
      this.alarmConfigs = payload.configs;
    }
    this.hyperfocusUntil = payload?.hyperfocusUntil ?? null;
  }

  syncTasks(tasks: TaskReminderItem[]): void {
    this.tasks = Array.isArray(tasks) ? tasks : [];
  }

  /**
   * Chamado ao acordar da suspensão (powerMonitor.on('resume' | 'unlock-screen')).
   * Avança alarmes de intervalo vencidos há mais de 1 ciclo para o próximo disparo,
   * evitando rajada de notificações atrasadas.
   */
  handleSystemWake(now = Date.now()): void {
    for (const cfg of this.alarmConfigs) {
      if (!cfg.enabled || !cfg.nextTriggerTimestamp) continue;
      const intervalMs = Math.max(1, Number(cfg.intervalMinutes) || 20) * 60 * 1000;
      if (now - cfg.nextTriggerTimestamp > intervalMs) {
        cfg.nextTriggerTimestamp = now + intervalMs;
      }
    }
  }

  tick(now = Date.now()): DesktopNotificationEvent[] {
    const fired: DesktopNotificationEvent[] = [];
    const hyperfocusActive = this.hyperfocusUntil !== null && this.hyperfocusUntil > now;
    const d = new Date(now);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const dayKey = d.toISOString().slice(0, 10);

    for (const cfg of this.alarmConfigs) {
      if (!cfg.enabled) continue;
      if (hyperfocusActive && cfg.key !== 'medication' && cfg.key !== 'nutrition_meals') continue;

      let due = Boolean(cfg.nextTriggerTimestamp && cfg.nextTriggerTimestamp <= now);
      if (!due && Array.isArray(cfg.fixedTimes)) {
        const checked = new Set(cfg.todayCheckedTimes || []);
        for (const t of cfg.fixedTimes) {
          if (t <= hhmm && !checked.has(t)) {
            due = true;
            break;
          }
        }
      }
      if (!due) continue;

      const dedupKey = `sc:${cfg.id}:${dayKey}:${Math.floor(now / 60_000)}`;
      if (this.notifiedKeys.has(dedupKey)) continue;
      this.notifiedKeys.add(dedupKey);

      const isEye = cfg.key === 'eye_rest_20_20_20';
      const evt: DesktopNotificationEvent = {
        tag: cfg.id,
        title: `Aurtistic Cuidados: ${cfg.name}`,
        body: cfg.description || 'Hora da sua pausa de autocuidado.',
        kind: isEye ? 'eye_rest_20_20_20' : 'self_care',
        autoOpenOverlay: isEye ? this.eyeRestAutoOverlay : false,
      };
      fired.push(evt);
      this.onNotify(evt);
    }

    // Lembretes de tarefas 1h antes
    for (const task of this.tasks) {
      const diff = task.dueTimestamp - now;
      if (diff > 0 && diff <= 60 * 60 * 1000) {
        const dedupKey = `task:${task.id}:${task.dueTimestamp}`;
        if (this.notifiedKeys.has(dedupKey)) continue;
        this.notifiedKeys.add(dedupKey);
        const evt: DesktopNotificationEvent = {
          tag: `task-${task.id}`,
          title: 'Tarefa em breve (menos de 1h)',
          body: task.title,
          kind: 'task_1h',
        };
        fired.push(evt);
        this.onNotify(evt);
      }
    }

    return fired;
  }

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
