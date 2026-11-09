// Este programa é um software livre (Licença AGPLv3)
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Task } from '@/types';

// Converts a string into a stable 32-bit positive integer
export const getNumericId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const syncTaskNotifications = async (tasks: Task[]) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const request = await LocalNotifications.requestPermissions();
      if (request.display !== 'granted') return;
    }

    // Create a default channel for Android 8.0+
    await LocalNotifications.createChannel({
      id: 'default',
      name: 'Lembretes de Tarefas',
      description: 'Avisos sobre tarefas urgentes e resumos diários',
      importance: 4, // High importance
      visibility: 1, // Public
      vibration: true
    });

    // Cancel all pending notifications so we can re-schedule them fresh
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }

    const notificationsToSchedule = [];
    const activeTasks = tasks.filter(t => t.status !== 'completa' && t.status !== 'descartada' && t.prazo);
    
    // 1. Notificação de 1h antes
    activeTasks.forEach(task => {
      const prazoDate = new Date(task.prazo!);
      if (isNaN(prazoDate.getTime())) return;
      
      const oneHourBefore = new Date(prazoDate.getTime() - 60 * 60 * 1000);
      if (oneHourBefore.getTime() > Date.now()) {
        notificationsToSchedule.push({
          title: 'Tarefa em 1 hora!',
          body: `Sua tarefa "${task.nome}" vence em 1 hora.`,
          id: getNumericId(task.id + '_1h'),
          schedule: { at: oneHourBefore },
          smallIcon: 'ic_stat_name',
          channelId: 'default'
        });
      }
    });

    // 2. Resumos diários (7:30, 12:00, 18:00) para os próximos 7 dias
    const now = new Date();
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDay = new Date(now);
      targetDay.setDate(now.getDate() + dayOffset);
      targetDay.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(targetDay);
      const diffToSunday = 7 - targetDay.getDay(); // Sunday as end of week
      endOfWeek.setDate(targetDay.getDate() + (diffToSunday === 7 ? 0 : diffToSunday));
      endOfWeek.setHours(23, 59, 59, 999);

      // Tasks to deliver between targetDay and endOfWeek
      const weekTasks = activeTasks.filter(t => {
        const d = new Date(t.prazo!);
        return d.getTime() >= targetDay.getTime() && d.getTime() <= endOfWeek.getTime();
      }).sort((a, b) => new Date(a.prazo!).getTime() - new Date(b.prazo!).getTime());

      if (weekTasks.length > 0) {
        // Build summary message
        // Take up to 3 tasks to avoid cutting the text
        const topTasks = weekTasks.slice(0, 3);
        const taskNames = topTasks.map(t => {
            const d = new Date(t.prazo!);
            const isToday = d.getDate() === targetDay.getDate() && d.getMonth() === targetDay.getMonth();
            const isTomorrow = new Date(targetDay.getTime() + 86400000).getDate() === d.getDate();
            const dayStr = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short' });
            return `${t.nome} (${dayStr})`;
        }).join(', ');
        
        let bodyText = `Nesta semana: ${taskNames}`;
        if (weekTasks.length > 3) bodyText += ` e mais ${weekTasks.length - 3}`;

        const times = [
          { h: 7, m: 30, id_suffix: '_730' },
          { h: 12, m: 0, id_suffix: '_1200' },
          { h: 18, m: 0, id_suffix: '_1800' }
        ];

        for (const time of times) {
          const scheduleDate = new Date(targetDay);
          scheduleDate.setHours(time.h, time.m, 0, 0);
          
          if (scheduleDate.getTime() > Date.now()) {
            const dateStr = `${targetDay.getFullYear()}${targetDay.getMonth()}${targetDay.getDate()}`;
            notificationsToSchedule.push({
              title: `Resumo da Semana (${weekTasks.length} tarefas)`,
              body: bodyText,
              id: getNumericId('summary_' + dateStr + time.id_suffix),
              schedule: { at: scheduleDate },
              smallIcon: 'ic_stat_name',
              channelId: 'default'
            });
          }
        }
      }
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    }
    console.log(`[Notifications] Synced ${notificationsToSchedule.length} notifications`);
  } catch (err) {
    console.error('[Notifications] Error syncing notifications', err);
  }
};
