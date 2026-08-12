// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { WidgetTasksPreview, WidgetCalendarPreview, WidgetWeeklyCalendarPreview, WidgetGlobalPreview } from '@/components/dashboard/WidgetPreviews';

function ToggleButtons({ 
  showEvents, 
  showTasks, 
  onToggleEvents, 
  onToggleTasks 
}: { 
  showEvents: boolean, 
  showTasks: boolean, 
  onToggleEvents: () => void, 
  onToggleTasks: () => void 
}) {
  return (
    <div className="flex bg-[#1A1A1A] p-1 rounded-xl border border-[#2D2D2D] relative w-full mt-2 gap-1 overflow-x-auto custom-scrollbar">
      <button 
        onClick={onToggleEvents}
        className={`flex-1 px-2 py-2 text-[12px] font-bold rounded-lg transition-colors whitespace-nowrap ${showEvents ? 'bg-[#FFCC00] text-[#121212] shadow' : 'text-[#8E8E8E] hover:text-white'}`}>
        Eventos (E)
      </button>
      <button 
        onClick={onToggleTasks}
        className={`flex-1 px-2 py-2 text-[12px] font-bold rounded-lg transition-colors whitespace-nowrap ${showTasks ? 'bg-[#9D4EDD] text-white shadow' : 'text-[#8E8E8E] hover:text-white'}`}>
        Tarefas (T)
      </button>
    </div>
  );
}

interface WidgetConfigClientProps {
  userId: string;
  tasks: any[];
}

export default function WidgetConfigClient({ userId, tasks }: WidgetConfigClientProps) {
  const router = useRouter();
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>(['completa', 'descartada', 'concluída']);
  const [sortOrder, setSortOrder] = useState<string>('recentes');
  const [selectedDimension, setSelectedDimension] = useState('Todas');
  const [hiddenTaskIds, setHiddenTaskIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'lista' | 'calendario' | 'semanal' | 'global'>('lista');
  const [calendarShowTasks, setCalendarShowTasks] = useState(true);
  const [calendarShowEvents, setCalendarShowEvents] = useState(true);
  const [weeklyShowTasks, setWeeklyShowTasks] = useState(true);
  const [weeklyShowEvents, setWeeklyShowEvents] = useState(true);
  const [weeklySplitType, setWeeklySplitType] = useState<string>('12h');
  const [listShowTasks, setListShowTasks] = useState(true);
  const [listShowEvents, setListShowEvents] = useState(true);

  // Extrair dimensões únicas existentes
  const dimensions = Array.from(new Set(tasks.map(t => t.dimensao).filter(Boolean)));
  // Extrair status únicos existentes (com fallback)
  const uniqueStatuses = Array.from(new Set(tasks.map(t => t.status || 'não iniciada').filter(Boolean)));

  useEffect(() => {
    // Carregar preferências salvas no Capacitor Preferences
    const loadPrefs = async () => {
      const safeParse = (str: string | null, fallback: any) => {
        if (!str) return fallback;
        try { return JSON.parse(str); } catch (e) { return fallback; }
      };
      
      try {
        const { value: hiddenStats } = await Preferences.get({ key: 'widget_hidden_statuses' });
        if (hiddenStats) {
          setHiddenStatuses(safeParse(hiddenStats, ['completa', 'descartada', 'concluída']));
        }

        const { value: orderVal } = await Preferences.get({ key: 'widget_sort_order' });
        if (orderVal) {
          setSortOrder(orderVal);
        }

        const { value: dimVal } = await Preferences.get({ key: 'widget_filter_dimension' });
        if (dimVal) {
          setSelectedDimension(dimVal);
        }

        const { value: hiddenVal } = await Preferences.get({ key: 'widget_hidden_task_ids' });
        if (hiddenVal) {
          setHiddenTaskIds(safeParse(hiddenVal, []));
        }

        const { value: showTasksVal } = await Preferences.get({ key: 'widget_calendar_show_tasks' });
        if (showTasksVal) setCalendarShowTasks(showTasksVal === 'true');

        const { value: showEventsVal } = await Preferences.get({ key: 'widget_calendar_show_events' });
        if (showEventsVal) setCalendarShowEvents(showEventsVal === 'true');

        const { value: wShowTasksVal } = await Preferences.get({ key: 'widget_weekly_show_tasks' });
        if (wShowTasksVal) setWeeklyShowTasks(wShowTasksVal === 'true');

        const { value: wShowEventsVal } = await Preferences.get({ key: 'widget_weekly_show_events' });
        if (wShowEventsVal) setWeeklyShowEvents(wShowEventsVal === 'true');
        
        const { value: wSplitTypeVal } = await Preferences.get({ key: 'widget_weekly_split_type' });
        if (wSplitTypeVal) {
          setWeeklySplitType(wSplitTypeVal);
        } else {
          const { value: wSplitVal } = await Preferences.get({ key: 'widget_weekly_split_shifts' });
          if (wSplitVal) setWeeklySplitType(wSplitVal === 'true' ? '12h' : 'none');
        }

        const { value: lShowTasksVal } = await Preferences.get({ key: 'widget_list_show_tasks' });
        if (lShowTasksVal) setListShowTasks(lShowTasksVal === 'true');

        const { value: lShowEventsVal } = await Preferences.get({ key: 'widget_list_show_events' });
        if (lShowEventsVal) setListShowEvents(lShowEventsVal === 'true');
      } catch (err) {
        console.error('Erro ao carregar preferências do widget', err);
      }
    };
    loadPrefs();
  }, []);

  const toggleTaskVisibility = (taskId: string) => {
    setIsDirty(true);
    setHiddenTaskIds(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleStatusVisibility = (status: string) => {
    setIsDirty(true);
    setHiddenStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Preferences.set({ key: 'widget_hidden_statuses', value: JSON.stringify(hiddenStatuses) });
      await Preferences.set({ key: 'widget_sort_order', value: sortOrder });
      await Preferences.set({ key: 'widget_filter_dimension', value: selectedDimension });
      await Preferences.set({ key: 'widget_hidden_task_ids', value: JSON.stringify(hiddenTaskIds) });
      await Preferences.set({ key: 'widget_calendar_show_tasks', value: calendarShowTasks.toString() });
      await Preferences.set({ key: 'widget_calendar_show_events', value: calendarShowEvents.toString() });
      await Preferences.set({ key: 'widget_weekly_show_tasks', value: weeklyShowTasks.toString() });
      await Preferences.set({ key: 'widget_weekly_show_events', value: weeklyShowEvents.toString() });
      await Preferences.set({ key: 'widget_weekly_split_type', value: weeklySplitType });
      await Preferences.set({ key: 'widget_list_show_tasks', value: listShowTasks.toString() });
      await Preferences.set({ key: 'widget_list_show_events', value: listShowEvents.toString() });

      // Atualizar lista filtrada do Widget imediatamente no storage
      let filteredTasks = tasks;
      
      // 1. Ocultar status desativados
      filteredTasks = filteredTasks.filter(t => !hiddenStatuses.includes(t.status || 'não iniciada'));

      // 2. Ocultar IDs desativados manualmente
      filteredTasks = filteredTasks.filter(t => !hiddenTaskIds.includes(t.id));

      // 3. Filtrar por dimensão se selecionada
      if (selectedDimension !== 'Todas') {
        if (selectedDimension === 'Favoritas') {
          filteredTasks = filteredTasks.filter(t => t.is_favorite);
        } else {
          filteredTasks = filteredTasks.filter(t => t.dimensao === selectedDimension);
        }
      }

      const widgetTasks = filteredTasks.map(t => ({
        id: t.id,
        nome: t.nome,
        prazo: t.prazo,
        status: t.status,
        dimensao: t.dimensao,
        is_favorite: t.is_favorite,
        created_at: t.created_at || new Date().toISOString()
      }));

      await Preferences.set({ key: 'favorite_tasks', value: JSON.stringify(widgetTasks) });

      // Notificar o Widget Nativo Android via Plugin se estiver no dispositivo
      if (Capacitor.isNativePlatform()) {
        try {
          const { WidgetPlugin } = await import('@/components/dashboard/TasksView');
          await WidgetPlugin.updateWidget();
        } catch (e) {
          console.warn('WidgetPlugin não disponível ou web mode');
        }
      }

      setSavedSuccess(true);
      setIsDirty(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar widget:', e);
      alert('Erro ao salvar preferências do Widget: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isDirty && !savedSuccess && (
        <div className="fixed top-24 right-4 md:right-8 z-50 bg-[#9D4EDD] text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 border border-[#9D4EDD]/50 animate-pulse">
          <span className="material-symbols-outlined">save</span>
          <div className="flex flex-col">
            <span className="font-bold text-sm">Alterações não salvas</span>
            <span className="text-xs font-medium">Lembre-se de salvar!</span>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="ml-2 bg-[#121212] text-[#9D4EDD] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#2D2D2D] transition-colors disabled:opacity-50">
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 md:p-8 shadow-2xl flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center pb-6 border-b border-[#2D2D2D] mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center text-[#FFCC00]">
            <span className="material-symbols-outlined text-[24px]">widgets</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white font-['Bukra'] tracking-tight">Configurações dos Widgets</h1>
            <p className="text-xs text-[#8E8E8E] mt-0.5">Personalize os widgets que aparecem na tela inicial do seu celular.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-[#8E8E8E] hover:text-white transition-colors p-2 rounded-lg"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-[#0f9d58]/20 border border-[#0f9d58] text-[#69f0ae] rounded-lg text-sm font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Preferências do Widget salvas e atualizadas no celular!
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2D2D2D] mb-8 pb-1 overflow-x-auto custom-scrollbar">
        {[
          { id: 'lista', label: 'Lista', icon: 'view_list' },
          { id: 'calendario', label: 'Calendário', icon: 'calendar_month' },
          { id: 'semanal', label: 'Semanal', icon: 'view_week' },
          { id: 'global', label: 'Global', icon: 'dashboard' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-[#9D4EDD] text-[#9D4EDD]' : 'border-transparent text-[#8E8E8E] hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        
        {/* Lado Esquerdo: Configurações */}
        <div className="space-y-6">
          {activeTab === 'lista' && (
            <>
              <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-white font-bold mb-1">Visualização da Lista</h3>
                <p className="text-xs text-[#8E8E8E] mb-3">Escolha o que deseja visualizar na lista principal.</p>
                <ToggleButtons 
                  showEvents={listShowEvents}
                  showTasks={listShowTasks}
                  onToggleEvents={() => {
                    setIsDirty(true);
                    setListShowEvents(!listShowEvents);
                  }} 
                  onToggleTasks={() => {
                    setIsDirty(true);
                    setListShowTasks(!listShowTasks);
                  }} 
                />

                <div className="mt-4 p-3 bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
                  <h4 className="text-white font-semibold text-xs mb-2">Como funcionam os botões no Widget:</h4>
                  <ul className="text-[11px] space-y-1.5">
                    <li><strong className="text-[#FFCC00]">E</strong> = Clicar liga/desliga apenas os Eventos.</li>
                    <li><strong className="text-[#9D4EDD]">T</strong> = Clicar liga/desliga apenas as Tarefas.</li>
                    <li>Deixe os dois ligados para ver ambos, ou os dois desligados para ver só os dias vazios.</li>
                  </ul>
                </div>
              </div>
              {/* Filtro de Status */}
              <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0f9d58] text-[20px]">filter_list</span>
                  Status Ocultos
                </h3>
                <p className="text-xs text-[#8E8E8E] mb-3">Selecione quais status NÃO aparecerão no widget.</p>
                <div className="flex flex-wrap gap-2">
                  {uniqueStatuses.map(status => {
                    const isHidden = hiddenStatuses.includes(status);
                    return (
                      <button key={status} onClick={() => toggleStatusVisibility(status)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border flex items-center gap-1 ${isHidden ? 'bg-[#2D2D2D] text-[#8E8E8E] border-[#3D3D3D]' : 'bg-[#9D4EDD]/20 text-[#9D4EDD] border-[#9D4EDD]/30'}`}>
                        <span className="material-symbols-outlined text-[14px]">{isHidden ? 'visibility_off' : 'visibility'}</span>
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ordenação */}
              <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4285f4] text-[20px]">sort</span>
                  <label className="text-[#A0A0A0] text-sm font-bold uppercase tracking-wider mb-2 block">Critério de Ordenação</label>
                </h3>
                <select value={sortOrder} onChange={(e) => { setIsDirty(true); setSortOrder(e.target.value); }} className="w-full mt-2 bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                  <option value="recentes">Criados Recentemente</option>
                  <option value="antigas">Mais antigas primeiro</option>
                  <option value="prazo_asc">Prazo mais próximo</option>
                  <option value="alfabetica">Ordem alfabética (A-Z)</option>
                </select>
              </div>

              {/* Filtro por Dimensão */}
              <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">category</span>
                  <label className="text-[#A0A0A0] text-sm font-bold uppercase tracking-wider mb-2 block">Filtrar por Dimensão</label>
                </h3>
                <select value={selectedDimension} onChange={(e) => { setIsDirty(true); setSelectedDimension(e.target.value); }} className="w-full mt-2 bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                  <option value="Todas">Todas as Tarefas</option>
                  <option value="Favoritas">Apenas Favoritas (★)</option>
                  {dimensions.map(dim => <option key={dim} value={dim}>{dim}</option>)}
                </select>
              </div>
            </>
          )}

          {activeTab === 'calendario' && (
            <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
              <h3 className="text-white font-bold mb-1">Configurações do Calendário Mensal</h3>
              <p className="text-xs text-[#8E8E8E] mb-3">Escolha o que deseja visualizar no calendário do widget.</p>
              <ToggleButtons 
                showEvents={calendarShowEvents}
                showTasks={calendarShowTasks}
                onToggleEvents={() => {
                  setIsDirty(true);
                  setCalendarShowEvents(!calendarShowEvents);
                }} 
                onToggleTasks={() => {
                  setIsDirty(true);
                  setCalendarShowTasks(!calendarShowTasks);
                }} 
              />
              
              <div className="mt-4 p-3 bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
                <h4 className="text-white font-semibold text-xs mb-2">Como funcionam os botões no Widget:</h4>
                <ul className="text-[11px] space-y-1.5">
                  <li><strong className="text-[#FFCC00]">E</strong> = Clicar liga/desliga apenas os Eventos.</li>
                  <li><strong className="text-[#9D4EDD]">T</strong> = Clicar liga/desliga apenas as Tarefas.</li>
                  <li>Deixe os dois ligados para ver ambos, ou os dois desligados para ver só os dias vazios.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'semanal' && (
            <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
              <h3 className="text-white font-bold mb-1">Configurações do Calendário Semanal</h3>
              <p className="text-xs text-[#8E8E8E] mb-3">Escolha o que deseja visualizar no calendário do widget.</p>
              <ToggleButtons 
                showEvents={weeklyShowEvents}
                showTasks={weeklyShowTasks}
                onToggleEvents={() => {
                  setIsDirty(true);
                  setWeeklyShowEvents(!weeklyShowEvents);
                }} 
                onToggleTasks={() => {
                  setIsDirty(true);
                  setWeeklyShowTasks(!weeklyShowTasks);
                }} 
              />
              
              <div className="mt-4 p-3 bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
                <h4 className="text-white font-semibold text-xs mb-2">Como funcionam os botões no Widget:</h4>
                <ul className="text-[11px] space-y-1.5">
                  <li><strong className="text-[#FFCC00]">E</strong> = Clicar liga/desliga apenas os Eventos.</li>
                  <li><strong className="text-[#9D4EDD]">T</strong> = Clicar liga/desliga apenas as Tarefas.</li>
                  <li>Deixe os dois ligados para ver ambos, ou os dois desligados para ver só os dias vazios.</li>
                </ul>
              </div>

              <div className="mt-4 p-4 bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#9D4EDD] text-[20px]">view_agenda</span>
                  Divisão de Turnos
                </h3>
                <div className="flex flex-col gap-2">
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${weeklySplitType === 'none' ? 'border-[#9D4EDD] bg-[#9D4EDD]/10' : 'border-[#2D2D2D] bg-[#121212] hover:border-[#3D3D3D]'}`}>
                    <input type="radio" name="splitType" value="none" checked={weeklySplitType === 'none'} onChange={() => { setIsDirty(true); setWeeklySplitType('none'); }} className="hidden" />
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-sm">Turno Único</h4>
                      <p className="text-[#8E8E8E] text-xs">Exibe as tarefas e eventos de forma contínua no dia.</p>
                    </div>
                  </label>
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${weeklySplitType === '12h' ? 'border-[#9D4EDD] bg-[#9D4EDD]/10' : 'border-[#2D2D2D] bg-[#121212] hover:border-[#3D3D3D]'}`}>
                    <input type="radio" name="splitType" value="12h" checked={weeklySplitType === '12h'} onChange={() => { setIsDirty(true); setWeeklySplitType('12h'); }} className="hidden" />
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-sm">Dividir em 2 Turnos (12h-24h-12h)</h4>
                      <p className="text-[#8E8E8E] text-xs">Separa os itens em bloco da Manhã e Tarde/Noite.</p>
                    </div>
                  </label>
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${weeklySplitType === '8h' ? 'border-[#9D4EDD] bg-[#9D4EDD]/10' : 'border-[#2D2D2D] bg-[#121212] hover:border-[#3D3D3D]'}`}>
                    <input type="radio" name="splitType" value="8h" checked={weeklySplitType === '8h'} onChange={() => { setIsDirty(true); setWeeklySplitType('8h'); }} className="hidden" />
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-sm">Dividir em 3 Turnos (8h-16h-24h-8h)</h4>
                      <p className="text-[#8E8E8E] text-xs">Separa os itens em Manhã, Tarde e Noite.</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'global' && (
            <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
              <h3 className="text-white font-bold mb-1">Configurações do Widget Global</h3>
              <p className="text-xs text-[#8E8E8E] mb-3">O Widget Global combina o Calendário Mensal e a Lista no topo (50/50) com o Calendário Semanal na parte inferior.</p>
              
              <div className="p-3 bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
                <h4 className="text-white font-semibold text-xs mb-2">Estrutura do Widget Global:</h4>
                <div className="text-[11px] space-y-3 text-[#E0E0E0]">
                  <div>
                    <strong className="text-[#9D4EDD] block mb-1">Seção Superior (Cabeçalho Global):</strong>
                    <ul className="pl-2 space-y-1">
                      <li>• <strong>Esquerda:</strong> Filtro de Dimensões (Dimensões ▼).</li>
                      <li>• <strong>Direita:</strong> Botões de controle mestre E, T e +.</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#9D4EDD] block mb-1">Seção Central (Dividida em 50/50):</strong>
                    <ul className="pl-2 space-y-1">
                      <li>• <strong>Superior Esquerdo:</strong> Mini Calendário Mensal com cabeçalho de mês, dias da semana e grade de dias.</li>
                      <li>• <strong>Superior Direito:</strong> Lista de Tarefas e Eventos filtrados com barra de rolagem vertical.</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#9D4EDD] block mb-1">Seção Inferior (Base):</strong>
                    <ul className="pl-2 space-y-1">
                      <li>• <strong>Inferior Horizontal:</strong> Visão Semanal completa com rolagem lateral por deslizamento e o divisor roxo (|) entre as semanas.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lado Direito: Preview */}
        <div className="flex flex-col border border-[#2D2D2D] rounded-xl bg-[#1A1A1A] overflow-hidden">
          <div className="bg-[#252525] p-3 border-b border-[#2D2D2D] text-center">
            <span className="text-[#E0E0E0] text-xs font-bold uppercase tracking-wider">Preview do Widget Android</span>
          </div>
          <div className="flex-1 p-8 flex items-center justify-center bg-[#121212]/50" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"%23252525\\" fill-opacity=\\"0.4\\" fill-rule=\\"evenodd\\"%3E%3Ccircle cx=\\"3\\" cy=\\"3\\" r=\\"1\\"/%3E%3Ccircle cx=\\"13\\" cy=\\"13\\" r=\\"1\\"/%3E%3C/g%3E%3C/svg%3E")' }}>
            {activeTab === 'lista' && <WidgetTasksPreview tasks={tasks} config={{ hiddenStatuses, hiddenTaskIds, sortOrder, selectedDimension }} />}
            {activeTab === 'calendario' && <WidgetCalendarPreview config={{ calendarShowTasks, calendarShowEvents }} />}
            {activeTab === 'semanal' && <WidgetWeeklyCalendarPreview config={{ weeklyShowTasks, weeklyShowEvents, weeklySplitType }} />}
            {activeTab === 'global' && <WidgetGlobalPreview tasks={tasks} config={{ weeklyShowTasks, weeklyShowEvents, weeklySplitType, selectedDimension }} />}
          </div>
        </div>
        
      </div>

      {/* Botões de Ação */}
      <div className="mt-8 pt-6 border-t border-[#2D2D2D] flex justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || savedSuccess}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-70 ${
            savedSuccess 
              ? 'bg-[#0f9d58] text-white hover:bg-[#0b8043]' 
              : 'bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800]'
          }`}
        >
          {isSaving ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              Salvando...
            </>
          ) : savedSuccess ? (
            <>
              <span className="material-symbols-outlined text-[18px]">check</span>
              Salvo!
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">save</span>
              Salvar Configurações
            </>
          )}
        </button>
      </div>

    </div>
    </>
  );
}
