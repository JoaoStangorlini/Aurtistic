'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateNotificationConfig } from '@/app/(dashboard)/actions';


interface NotificationConfig {
  enabled: boolean;
  only_before_deadline: boolean;
  daily_reminders: boolean;
  reminder_time: string;
  muted_task_ids: string[];
  task_preferences?: Record<string, { style: 'standard' | 'alarm', color: string }>;
}

export default function NotificationsConfigClient({ 
  initialConfig, 
  userId,
  tasks
}: { 
  initialConfig: NotificationConfig, 
  userId: string,
  tasks: any[]
}) {
  const [config, setConfig] = useState<NotificationConfig>({
    ...initialConfig,
    muted_task_ids: initialConfig.muted_task_ids || [],
    task_preferences: initialConfig.task_preferences || {}
  });
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleToggle = (field: keyof NotificationConfig) => {
    setConfig(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({
      ...prev,
      reminder_time: e.target.value
    }));
  };

  const toggleTaskMute = (taskId: string) => {
    setConfig(prev => {
      const isMuted = prev.muted_task_ids.includes(taskId);
      return {
        ...prev,
        muted_task_ids: isMuted 
          ? prev.muted_task_ids.filter(id => id !== taskId)
          : [...prev.muted_task_ids, taskId]
      };
    });
  };

  const handleTaskPrefChange = (taskId: string, field: 'style'|'color', value: string) => {
    setConfig(prev => ({
      ...prev,
      task_preferences: {
        ...(prev.task_preferences || {}),
        [taskId]: {
          ...(prev.task_preferences?.[taskId] || { style: 'standard', color: '#9D4EDD' }),
          [field]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateNotificationConfig(config);

      alert('Configurações de notificação salvas com sucesso!');
      router.refresh();
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Filtragem de Tarefas
  const activeTasks = tasks.filter(t => t.status !== 'completa' && t.status !== 'descartada');
  
  const getDaysAway = (dateString: string) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    
    // Pegar a data local correta
    const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = taskDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const shortDeadlineTasks = activeTasks.filter(t => {
    const days = getDaysAway(t.prazo);
    return days !== null && days >= 1 && days <= 3;
  });

  const dailyReminderTasks = activeTasks.filter(t => {
    const days = getDaysAway(t.prazo);
    return days !== null && days <= 7;
  });

  const renderTaskList = (taskList: any[]) => {
    if (taskList.length === 0) {
      return <div className="text-sm text-[#808080] italic px-4 py-2 bg-[#121212] rounded-md mt-3 border border-[#2D2D2D]">Nenhuma tarefa se enquadra nesta regra atualmente.</div>;
    }
    
    return (
      <div className="mt-3 bg-[#121212] border border-[#2D2D2D] rounded-lg overflow-hidden divide-y divide-[#2D2D2D] animate-fade-in">
        {taskList.map(task => {
          const isMuted = config.muted_task_ids.includes(task.id);
          const days = getDaysAway(task.prazo);
          const daysText = days === 0 ? "Hoje" : days! > 0 ? `em ${days} dias` : `${Math.abs(days!)} dias atrasada`;
          const textColor = days! < 0 ? "text-[#db4437]" : days! <= 3 ? "text-[#FFCC00]" : "text-[#A0A0A0]";
          
          return (
            <div key={task.id} className="p-3 flex items-center justify-between hover:bg-[#1A1A1A] transition-colors">
              <div className="pr-4 truncate">
                <p className={`text-sm font-medium ${isMuted ? 'text-[#808080] line-through' : 'text-[#E0E0E0]'} truncate`}>
                  {task.nome}
                </p>
                <p className={`text-xs ${textColor} mt-0.5`}>
                  Prazo: {daysText}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {!isMuted && (
                  <div className="flex flex-col items-end gap-1">
                    <select 
                      value={config.task_preferences?.[task.id]?.style || 'standard'}
                      onChange={(e) => handleTaskPrefChange(task.id, 'style', e.target.value)}
                      className="bg-[#2D2D2D] text-[10px] text-white py-1 px-2 rounded border border-[#333333] cursor-pointer"
                    >
                      <option value="standard">Notificação Padrão</option>
                      <option value="alarm">Alarme Urgente</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#8E8E8E]">Cor do Alerta:</span>
                      <input 
                        type="color" 
                        value={config.task_preferences?.[task.id]?.color || '#9D4EDD'}
                        onChange={(e) => handleTaskPrefChange(task.id, 'color', e.target.value)}
                        className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
                )}
                <button 
                  onClick={() => toggleTaskMute(task.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${!isMuted ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}
                  title={isMuted ? "Notificações desativadas para esta tarefa" : "Notificações ativadas para esta tarefa"}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${!isMuted ? 'translate-x-4.5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
      <div className="space-y-8">
        
        {/* Main Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Notificações Gerais</h2>
            <p className="text-sm text-[#A0A0A0] mt-1">
              Ative ou desative todos os alertas e lembretes gerados pelo aplicativo Capacitor.
            </p>
          </div>
          <button 
            onClick={() => handleToggle('enabled')}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${config.enabled ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {config.enabled && (
          <div className="pl-4 md:pl-6 border-l-2 border-[#2D2D2D] space-y-10 animate-fade-in">
            
            {/* Only Before Deadline */}
            <div>
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <h3 className="text-lg font-semibold text-[#E0E0E0]">Apenas Prazos Curtos</h3>
                  <p className="text-sm text-[#808080] mt-1">
                    Se ativado, você será notificado apenas quando as tarefas estiverem próximas do vencimento (1 a 3 dias).
                  </p>
                </div>
                <button 
                  onClick={() => handleToggle('only_before_deadline')}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.only_before_deadline ? 'bg-[#FFCC00]' : 'bg-[#2D2D2D]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full transition-transform ${config.only_before_deadline ? 'bg-[#121212] translate-x-6' : 'bg-[#A0A0A0] translate-x-1'}`} />
                </button>
              </div>
              {config.only_before_deadline && renderTaskList(shortDeadlineTasks)}
            </div>

            {/* Daily Reminders */}
            <div>
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <h3 className="text-lg font-semibold text-[#E0E0E0]">Lembrete Diário</h3>
                  <p className="text-sm text-[#808080] mt-1">
                    Receba um resumo diário das suas tarefas com prazo em 7 dias ou menos (incluindo atrasadas).
                  </p>
                </div>
                <button 
                  onClick={() => handleToggle('daily_reminders')}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.daily_reminders ? 'bg-[#FFCC00]' : 'bg-[#2D2D2D]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full transition-transform ${config.daily_reminders ? 'bg-[#121212] translate-x-6' : 'bg-[#A0A0A0] translate-x-1'}`} />
                </button>
              </div>
              
              {config.daily_reminders && (
                <div className="mt-4 space-y-4 animate-fade-in">
                  <div className="bg-[#121212] border border-[#2D2D2D] p-4 rounded-lg">
                    <label className="block text-sm font-bold text-[#E0E0E0] mb-2">
                      Horário do Lembrete Diário
                    </label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="time" 
                        value={config.reminder_time}
                        onChange={handleTimeChange}
                        className="bg-[#1A1A1A] border border-[#2D2D2D] text-white px-3 py-2 rounded-md focus:outline-none focus:border-[#9D4EDD] transition-colors"
                      />
                      <span className="text-sm text-[#808080]">
                        (Hora exata em que você receberá a notificação)
                      </span>
                    </div>
                  </div>
                  
                  {renderTaskList(dailyReminderTasks)}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      <div className="mt-10 pt-6 border-t border-[#2D2D2D] flex justify-end gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg text-sm font-bold text-[#E0E0E0] hover:bg-[#2D2D2D] transition-colors"
          disabled={isSaving}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#9D4EDD] text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-[#8836ce] transition-colors flex items-center gap-2 disabled:opacity-70"
        >
          {isSaving ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              Salvando...
            </>
          ) : (
            'Salvar Preferências'
          )}
        </button>
      </div>

    </div>
  );
}
