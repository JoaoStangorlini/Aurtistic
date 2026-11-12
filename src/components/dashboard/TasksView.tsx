// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Task, TaskColumn, AgendaEvent, UserFileIndexRow } from '@/types';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import { formatStorageBytes } from '@/lib/edge-urls';
import { OrganizationManagementView } from '@/components/organizacoes/OrganizationManagementView';
import { OrganizationScopeToolbar } from '@/components/organizacoes/OrganizationScopeToolbar';
import { JoinOrganizationModal } from '@/components/organizacoes/JoinOrganizationModal';
import { CreateOrganizationModal } from '@/components/organizacoes/CreateOrganizationModal';
import {
  getUserOrganizationsAction,
  getOrganizationDetailsAction,
  getOrganizationMeetingsAction,
} from '@/app/(dashboard)/organizacoes/actions';

import { Badge, getBadgeColorClass } from './Badge';
import { TaskFormModal } from './TaskFormModal';
import { EventFormModal } from './EventFormModal';
import { ImportICSModal } from './ImportICSModal';
import { BulkEditModal } from './BulkEditModal';
import { OptionsEditorModal } from './OptionsEditorModal';
import TaskCalendar from './TaskCalendar';
import { useSearchParams, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { updateTaskOrders, saveTaskColumn, updateEvent, createEvent } from '@/app/(dashboard)/actions';
import { saveTask, deleteMultipleTasks, updateMultipleTasks } from '@/lib/offlineActions';
import { Preferences } from '@capacitor/preferences';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { saveTasksToCache, getTasksFromCache, getMutations, removeMutation } from '@/lib/offlineSync';
import { syncTaskNotifications } from '@/lib/notifications';
import { downloadICS } from '@/utils/ics';
import { downloadCSV } from '@/utils/csv';

export interface WidgetPluginPlugin {
  updateWidget(): Promise<void>;
}
export const WidgetPlugin = Capacitor.isPluginAvailable('WidgetPlugin')
  ? ((Capacitor as any).Plugins.WidgetPlugin as WidgetPluginPlugin)
  : registerPlugin<WidgetPluginPlugin>('WidgetPlugin');

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null, concluidaEm: string | null = null) {
  if (!dateStr) return null;
  const today = new Date();
  if (concluidaEm) {
    const concluida = new Date(concluidaEm);
    if (!isNaN(concluida.getTime())) {
      today.setTime(concluida.getTime());
    }
  }
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  deadline.setHours(0, 0, 0, 0);
  const diffTime = deadline.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getStatusWeight(status: string | null) {
  const s = (status || '').toLowerCase();
  if (s.includes('descartada')) return 1;
  if (s.includes('completa') || s.includes('conclu')) return 2;
  if (s.includes('falta testar')) return 3;
  if (s.includes('progresso') || s.includes('andamento')) return 4;
  if (s.includes('não iniciada') || s.includes('nao iniciada')) return 5;
  return 6;
}

function getPriorityWeight(p: string | null) {
  const v = (p || '').toLowerCase();
  if (v.includes('alta')) return 3;
  if (v.includes('média') || v.includes('media')) return 2;
  if (v.includes('baixa')) return 1;
  return 0;
}

const HighlightedText = ({ text, highlight }: { text: string | null, highlight: string }) => {
  if (!text) return null;
  if (!highlight.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={index} className="bg-purple-500/50 text-white rounded-sm px-0.5">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

export function TasksView({
  initialTasks: rawInitialTasks,
  initialEvents = [],
  displayMode = 'tarefas',
  initialColumns = [],
  isPersonalScope = false,
  userId,
  initialQuickFilters = ['responsavel', 'dimensao'],
  initialQuickSorts = ['status', 'prazo', 'prioridade', 'manual'],
  advancedSettings = {},
  initialUserFiles = [],
  initialOrganizations = [],
  showUnassignedBanner,
}: {
  initialTasks: Task[];
  initialEvents?: AgendaEvent[];
  displayMode?: 'tarefas' | 'eventos' | 'ambos';
  initialColumns?: TaskColumn[];
  isPersonalScope?: boolean;
  userId?: string;
  initialQuickFilters?: string[];
  initialQuickSorts?: string[];
  advancedSettings?: any;
  initialUserFiles?: UserFileIndexRow[];
  initialOrganizations?: any[];
  showUnassignedBanner?: boolean;
}) {
  const enableSubtasks = advancedSettings.enable_subtasks !== false;
  const enableAdminFilters = advancedSettings.enable_admin_filters !== false;

  const searchParams = useSearchParams();
  const globalQuery = searchParams.get('q') || '';
  
  const [columns, setColumns] = useState<TaskColumn[]>(initialColumns);
  
  const getColColor = (key: string, val: string | null | undefined) => {
    const col = columns.find(c => c.key === key);
    if (!col || !col.options) return undefined;
    const opt = col.options.find(o => o.value === (val || ''));
    return opt?.color;
  };

  const [viewMode, setViewMode] = useState<'list' | 'weekly' | 'monthly' | 'org_management'>(advancedSettings.default_view_mode || 'list');

  useEffect(() => {
    if (displayMode === 'eventos') {
      setViewMode('monthly');
    } else if (displayMode === 'ambos') {
      setViewMode('weekly');
    } else {
      setViewMode(advancedSettings.default_view_mode || 'list');
    }
  }, [displayMode, advancedSettings.default_view_mode]);
    const [calendarCurrentDate, setCalendarCurrentDate] = useState(new Date());

  const [organizations, setOrganizations] = useState<any[]>(initialOrganizations || []);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    (initialOrganizations && initialOrganizations.length > 0) ? initialOrganizations[0].id : null
  );
  const [activeScope, setActiveScope] = useState<'all' | 'individual' | 'organization'>('individual');
  const [activeOrgDetails, setActiveOrgDetails] = useState<any>(null);
  const [orgMeetings, setOrgMeetings] = useState<any[]>([]);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filePickerTaskId, setFilePickerTaskId] = useState<string | null>(null);
  const [userFiles, setUserFiles] = useState<UserFileIndexRow[]>(initialUserFiles || []);
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);
  const [isQuickFiltersExpanded, setIsQuickFiltersExpanded] = useState(false);
  const [isUnassignedTasksExpanded, setIsUnassignedTasksExpanded] = useState(false);
  const [isBatchAssigningUnassigned, setIsBatchAssigningUnassigned] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0] || null;

  const toggleQuickFiltersExpanded = useCallback(() => {
    setIsQuickFiltersExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadOrgs() {
      const res = await getUserOrganizationsAction();
      if (!ignore && res.ok && Array.isArray(res.organizations)) {
        const orgs = res.organizations;
        setOrganizations(orgs);
        if (orgs.length > 0) {
          setActiveOrgId(prev => prev || orgs[0].id);
        } else {
          setActiveScope('individual');
        }
      }
    }
    loadOrgs();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if ((activeScope === 'organization' || activeScope === 'all') && activeOrgId) {
      getOrganizationDetailsAction(activeOrgId).then(res => {
        if (res.ok && res.organization) {
          setActiveOrgDetails(res.organization);
        }
      });
      getOrganizationMeetingsAction(activeOrgId).then(res => {
        if (res.ok && res.meetings) {
          setOrgMeetings(res.meetings);
        }
      });
    }
  }, [activeScope, activeOrgId]);
  
  // Normalizar os dados que vêm do banco (migração temporária na UI)
  const initialTasks = useMemo(() => 
    rawInitialTasks.map(t => 
      t.dimensao && t.dimensao.toLowerCase() === 'pessoal' 
        ? { ...t, dimensao: 'urgente' } 
        : t
    ), 
  [rawInitialTasks]);
  
  const [localTasks, setLocalTasks] = useState(initialTasks);
  const [localEvents, setLocalEvents] = useState(initialEvents);
  const [isDailyFollowup, setIsDailyFollowup] = useState(advancedSettings.start_in_daily_followup || false);


  const [visibleExtraCols, setVisibleExtraCols] = useState<string[]>(userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? ['responsavel', 'concluida_em', 'frequencia'] : []);
  
  useEffect(() => {
    import('@capacitor/preferences').then(({ Preferences }) => {
      Preferences.get({ key: 'visibleExtraCols' }).then(res => {
        if (res.value) setVisibleExtraCols(JSON.parse(res.value));
      });
    });
  }, []);

  const toggleExtraCol = (col: string) => {
    const newCols = visibleExtraCols.includes(col) ? visibleExtraCols.filter(c => c !== col) : [...visibleExtraCols, col];
    setVisibleExtraCols(newCols);
    import('@capacitor/preferences').then(({ Preferences }) => {
      Preferences.set({ key: 'visibleExtraCols', value: JSON.stringify(newCols) });
    });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<AgendaEvent | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  
  const toggleTaskExpansion = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTasks(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleNewEvent = () => {
    setEventToEdit(null);
    setIsEventModalOpen(true);
  };
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<TaskColumn | null>(null);
  
  useEffect(() => {
    const syncOffline = async () => {
      if (window.navigator.onLine) {
        // We are online. The initialTasks from server are fresh.
        setLocalTasks(initialTasks);
        await saveTasksToCache(initialTasks);
        
        // Check if we have pending mutations
        const mutations = await getMutations();
        if (mutations.length > 0) {
          console.log('Processing offline mutations...', mutations);
          for (const m of mutations) {
            try {
              if (m.type === 'update') await saveTask(m.payload);
              if (m.type === 'delete') await deleteMultipleTasks([m.taskId]);
              await removeMutation(m.id);
            } catch (e) {
              console.error('Failed to sync mutation', m, e);
            }
          }
        }
      } else {
        // We are offline. Load from cache.
        const cached = await getTasksFromCache();
        if (cached && cached.length > 0) {
          setLocalTasks(cached);
        } else {
          setLocalTasks(initialTasks);
        }
      }
    };

    syncOffline();

    const handleOnline = () => syncOffline();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [initialTasks]);

  // Keep offline cache in sync with local UI state
  useEffect(() => {
    if (localTasks) {
      saveTasksToCache(localTasks).catch(e => console.error("Erro salvando cache offline", e));
    }
  }, [localTasks]);

  // Sync Events to Native Android Widget
  useEffect(() => {
    const syncEvents = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({
          key: 'user_events',
          value: JSON.stringify(localEvents)
        });
        if (Capacitor.isNativePlatform()) {
          try { await WidgetPlugin.updateWidget(); } catch (err) {}
        }
      } catch (e) {
        console.warn('Erro ao salvar eventos no widget:', e);
      }
    };
    syncEvents();
  }, [localEvents]);

  // Sync Favorites to Native Android Widget
  useEffect(() => {
    const syncFavorites = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const { Preferences } = await import('@capacitor/preferences');
        // Ler preferências de filtro
        let hiddenStatuses = ['completa', 'descartada', 'concluída'];
        let sortOrder = 'recentes';
        let hiddenTaskIds: string[] = [];
        
        const safeParse = (str: string | null, fallback: any) => {
          if (!str) return fallback;
          try { return JSON.parse(str); } catch (e) { return fallback; }
        };
        
        try {
          const { value: hiddenStatsVal } = await Preferences.get({ key: 'widget_hidden_statuses' });
          if (hiddenStatsVal) hiddenStatuses = safeParse(hiddenStatsVal, []);
          
          const { value: sortOrderVal } = await Preferences.get({ key: 'widget_sort_order' });
          if (sortOrderVal) sortOrder = sortOrderVal;

          const { value: hiddenIdsVal } = await Preferences.get({ key: 'widget_hidden_task_ids' });
          if (hiddenIdsVal) hiddenTaskIds = safeParse(hiddenIdsVal, []);
        } catch (e) { console.warn('Erro ao ler prefs do widget em TasksView', e); }

        let filteredTasks = localTasks.filter(t => 
          !hiddenStatuses.includes(t.status || 'não iniciada') && 
          !hiddenTaskIds.includes(t.id)
        );

        // Aplicar ordenação
        if (sortOrder === 'recentes') {
          filteredTasks.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        } else if (sortOrder === 'antigas') {
          filteredTasks.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        } else if (sortOrder === 'alfabetica') {
          filteredTasks.sort((a, b) => a.nome.localeCompare(b.nome));
        } else if (sortOrder === 'prazo_asc') {
          filteredTasks.sort((a, b) => {
            if (!a.prazo) return 1;
            if (!b.prazo) return -1;
            return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
          });
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
        await Preferences.set({
          key: 'favorite_tasks',
          value: JSON.stringify(widgetTasks)
        });
        
        // Extract and save unique dimensions for the widget filter
        const dims = Array.from(new Set(localTasks.map(t => t.dimensao).filter(Boolean)));
        await Preferences.set({
          key: 'unique_dimensions',
          value: JSON.stringify(dims)
        });

        // Save status colors mapping for Widget pencil icons
        const statusColors: Record<string, string> = {
          'completa': '#0f9d58',
          'concluída': '#0f9d58',
          'concluida': '#0f9d58',
          'falta testar': '#f4b400',
          'descartada': '#db4437',
          'em progresso': '#4285f4',
          'em andamento': '#4285f4',
          'não iniciada': '#E0E0E0',
          'nao iniciada': '#E0E0E0',
          'rascunho': '#8E8E8E'
        };
        await Preferences.set({
          key: 'status_colors',
          value: JSON.stringify(statusColors)
        });
        
        if (Capacitor.isNativePlatform()) {
          try { await WidgetPlugin.updateWidget(); } catch (err) { console.warn('Widget update failed', err); }
        }
      } catch (err) {
        console.error('Error syncing favorites to native widget', err);
      }
    };
    syncFavorites();
  }, [localTasks]);

  // Sync Notifications
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      syncTaskNotifications(localTasks);
    }
  }, [localTasks]);

  // Handle App Open from Widget
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const processWidgetIntents = async () => {
      try {
        // 1. Process pending status updates
        const { value: pendingStr } = await Preferences.get({ key: 'pending_widget_updates' });
        if (pendingStr && pendingStr !== '[]') {
          const updates = JSON.parse(pendingStr);
          if (updates.length > 0) {
            console.log("Processando fila do widget", updates);
            await Preferences.set({ key: 'pending_widget_updates', value: '[]' });
            
            let newTasks = [...localTasks];
            let modified = false;
            
            for (const update of updates) {
              if (update.action === 'create') {
                const { taskId, taskName, taskDimension } = update;
                const newTask = {
                  id: taskId,
                  nome: taskName || 'Novo Rascunho de Tarefa',
                  status: 'rascunho',
                  is_favorite: true,
                  ordem: 0,
                  prazo: new Date(Date.now() + 7 * 86400000).toISOString(),
                  dimensao: 'Rascunho'
                };
                newTasks.unshift(newTask as any);
                modified = true;
                saveTask(newTask as any).catch(e => console.error("Erro criando task do widget", e));
              } else if (update.action === 'create_event') {
                const { eventId, eventName } = update;
                const newEvent: Partial<AgendaEvent> = {
                  id: eventId,
                  nome: eventName || 'Novo Rascunho de Evento',
                  status: 'rascunho',
                  data_inicio: new Date().toISOString(),
                  dimensao: 'Rascunho',
                  is_labdiv: !isPersonalScope
                };
                setLocalEvents(prev => [newEvent as AgendaEvent, ...prev]);
                createEvent(newEvent).catch(e => console.error("Erro criando evento do widget", e));
              } else {
                const { taskId, status } = update;
                const taskIndex = newTasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                  newTasks[taskIndex] = { ...newTasks[taskIndex], status };
                  modified = true;
                  saveTask({ ...newTasks[taskIndex], status }).catch(e => console.error(e));
                }
              }
            }
            if (modified) setLocalTasks(newTasks);
          }
        }

        // 2. Process open task intent
        const { value: openTaskId } = await Preferences.get({ key: 'widget_action_open_task' });
        if (openTaskId) {
          console.log("Abrindo tarefa a partir do widget:", openTaskId);
          await Preferences.remove({ key: 'widget_action_open_task' });
          const taskToOpen = localTasks.find(t => t.id === openTaskId);
          if (taskToOpen) {
            setTaskToEdit(taskToOpen);
            setIsModalOpen(true);
          }
        }
      } catch (err) {
        console.error('Error processing widget intent', err);
      }
    };

    // Run immediately
    processWidgetIntents();

    // Run on resume
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        processWidgetIntents();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [localTasks]); // Depends on localTasks to correctly update states if something changes

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  
  const [history, setHistory] = useState<Task[][]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom'>('top');

  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  const isAurtistic = pathname?.includes('aurtistic');


  const [activeTooltip, setActiveTooltip] = useState<{
    text: string;
    top: number | 'auto';
    bottom?: number | 'auto';
    left: number;
  } | null>(null);

  const handleTooltipClick = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceNeeded = 100;

    setActiveTooltip({
      text,
      top: spaceBelow < spaceNeeded ? 'auto' : rect.bottom + 5,
      bottom: spaceBelow < spaceNeeded ? window.innerHeight - rect.top + 5 : 'auto',
      left: Math.max(10, rect.left - 64)
    });
  };

  const [quickEdit, setQuickEdit] = useState<{
    taskId: string;
    field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao';
    top: number | 'auto';
    bottom?: number | 'auto';
    left: number;
    value: string | null;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => { setQuickEdit(null); setActiveTooltip(null); };
    const handleScroll = () => { setQuickEdit(null); setActiveTooltip(null); };
    if (quickEdit || activeTooltip) {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    }
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [quickEdit, activeTooltip]);

  const handleBadgeClick = (e: React.MouseEvent, task: Task, field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao') => {
    e.stopPropagation();
    if (advancedSettings?.enable_badge_quick_edit === false) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceNeeded = 250;

    if (spaceBelow < spaceNeeded) {
      setQuickEdit({
        taskId: task.id,
        field,
        top: 'auto',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        value: task[field] || ''
      });
    } else {
      setQuickEdit({
        taskId: task.id,
        field,
        top: rect.bottom + 4,
        bottom: 'auto',
        left: rect.left,
        value: task[field] || ''
      });
    }
  };

  const handleFavoriteToggle = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    const task = localTasks.find(t => t.id === taskId);
    if (!task) return;

    const newValue = !task.is_favorite;
    
    // Find children to cascade the favorite status
    const children = localTasks.filter(t => t.parent_id === taskId);
    const taskIdsToUpdate = [taskId, ...children.map(c => c.id)];

    const updatedTasks = localTasks.map(t => taskIdsToUpdate.includes(t.id) ? { ...t, is_favorite: newValue } : t);
    setLocalTasks(updatedTasks);
    
    try {
      for (const id of taskIdsToUpdate) {
        const t = localTasks.find(x => x.id === id);
        if (t) await saveTask({ ...t, is_favorite: newValue });
      }
    } catch (err: any) {
      alert("Erro ao atualizar favorito: " + err.message);
    }
  };

  const handleEventFavoriteToggle = async (e: React.MouseEvent, event: AgendaEvent) => {
    e.stopPropagation();
    const newValue = !event.is_favorite;
    const updatedEvents = localEvents.map(evt => evt.id === event.id ? { ...evt, is_favorite: newValue } : evt);
    setLocalEvents(updatedEvents);
    try {
      await updateEvent(event.id, { is_favorite: newValue });
    } catch (err: any) {
      alert("Erro ao favoritar evento: " + err.message);
    }
  };

  const handleQuickSave = async (taskId: string, field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao', newValue: string) => {
    setQuickEdit(null);

    const isBulkEdit = selectedTasks.has(taskId) && selectedTasks.size > 1;
    const taskIdsToUpdate = isBulkEdit ? Array.from(selectedTasks) : [taskId];

    const completionStatuses = (advancedSettings?.completion_statuses || ['completa', 'concluída', 'descartada']).map((s: string) => s.toLowerCase());
    const isNewCompleted = completionStatuses.includes(newValue.toLowerCase());

    // Se a regra de alertar subtarefas pendentes estiver ativa
    if (field === 'status' && isNewCompleted && advancedSettings?.prevent_parent_completion_if_subtasks_pending) {
      for (const id of taskIdsToUpdate) {
        const subtasks = localTasks.filter(t => t.parent_id === id);
        const pendingSubtasks = subtasks.filter(st => !completionStatuses.includes((st.status || '').toLowerCase()));
        if (pendingSubtasks.length > 0) {
          const confirmComp = confirm(`Esta tarefa possui ${pendingSubtasks.length} subtarefa(s) pendente(s). Deseja realmente marcá-la como concluída?`);
          if (!confirmComp) return;
        }
      }
    }

    let updatedTasks = localTasks.map(t => taskIdsToUpdate.includes(t.id) ? { ...t, [field]: newValue } : t);
    let autoTasksToSave: Task[] = [];

    if (field === 'status') {
      const autoCompleteParent = advancedSettings?.auto_complete_parent !== false;
      const autoCompleteSubtasks = advancedSettings?.auto_complete_subtasks === true;
      const primaryCompletion = completionStatuses[0] || 'completa';

      // Regra 1: Ao concluir a tarefa mãe, se auto_complete_subtasks tiver ativo, conclui todas as filhas
      if (autoCompleteSubtasks && isNewCompleted) {
        taskIdsToUpdate.forEach(parentId => {
          const subs = updatedTasks.filter(t => t.parent_id === parentId);
          subs.forEach(sub => {
            if (!completionStatuses.includes((sub.status || '').toLowerCase())) {
              const updatedSub = { ...sub, status: newValue };
              updatedTasks = updatedTasks.map(t => t.id === sub.id ? updatedSub : t);
              autoTasksToSave.push(updatedSub);
            }
          });
        });
      }

      // Regra 2: Ao alterar status de subtarefa, se todas as filhas da mãe estiverem concluídas, conclui a mãe
      if (autoCompleteParent) {
        const parentIdsToCheck = new Set<string>();
        taskIdsToUpdate.forEach(id => {
          const t = localTasks.find(item => item.id === id);
          if (t?.parent_id) parentIdsToCheck.add(t.parent_id);
        });

        parentIdsToCheck.forEach(parentId => {
          const parentTask = updatedTasks.find(t => t.id === parentId);
          if (parentTask) {
            const allSiblings = updatedTasks.filter(t => t.parent_id === parentId);
            const allCompleted = allSiblings.every(s => completionStatuses.includes((s.status || '').toLowerCase()));

            if (allCompleted && !completionStatuses.includes((parentTask.status || '').toLowerCase())) {
              const updatedParent = { ...parentTask, status: primaryCompletion };
              updatedTasks = updatedTasks.map(t => t.id === parentId ? updatedParent : t);
              autoTasksToSave.push(updatedParent);
            }
          }
        });
      }
    }

    setLocalTasks(updatedTasks);
    
    try {
      if (isBulkEdit) {
        await updateMultipleTasks(taskIdsToUpdate, { [field]: newValue });
      } else {
        const task = localTasks.find(t => t.id === taskId);
        if (task) await saveTask({ ...task, [field]: newValue });
      }

      for (const autoT of autoTasksToSave) {
        await saveTask(autoT);
      }
    } catch (err: any) {
      alert("Erro ao atualizar: " + err.message);
    }
  };


  // Filters UI State
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  const toggleExpand = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Filters State
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  
  // Se a Navbar global mandar ?q=... nós usamos ela. Senão a local.
  const searchTerm = globalQuery || localSearchTerm;
  
  type SortOption = 'status' | 'status_inv' | 'prazo' | 'categoria' | 'prioridade_desc' | 'prioridade_asc' | 'manual' | string;
  const [sortBy, setSortBy] = useState<SortOption>('status');

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [showDraftsOnly, setShowDraftsOnly] = useState<boolean>(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Quick Filters & Custom Filters
  const [quickFilters, setQuickFilters] = useState<string[]>(initialQuickFilters || ['responsavel', 'dimensao']);
  const [quickSorts, setQuickSorts] = useState<string[]>(initialQuickSorts || ['status', 'prazo', 'prioridade', 'manual']);
  const [isQuickFiltersModalOpen, setIsQuickFiltersModalOpen] = useState(false);
  const [quickFiltersTab, setQuickFiltersTab] = useState<'visibilidade' | 'ordem'>('visibilidade');
  const [customFilters, setCustomFilters] = useState<Record<string, string[]>>({});

  // Selection
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null);

  const defaultTaskValues = useMemo(() => {
    let vals = { ...(advancedSettings.default_task_values || {}) };
    if (advancedSettings.auto_fill_dimension !== false && selectedDimensions.length === 1) {
      vals.dimensao = selectedDimensions[0];
    }

    if (vals.prazo) {
      const today = new Date();
      if (vals.prazo === 'amanha') {
        today.setDate(today.getDate() + 1);
      } else if (vals.prazo === 'proxima_semana') {
        today.setDate(today.getDate() + 7);
      } else if (vals.prazo === 'proximo_mes') {
        today.setMonth(today.getMonth() + 1);
      }
      if (['amanha', 'proxima_semana', 'proximo_mes'].includes(vals.prazo)) {
        today.setHours(12, 0, 0, 0); // Padrão: 12:00
        vals.prazo = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      }
    }

    return vals;
  }, [advancedSettings, selectedDimensions]);

  // Refs for scrolling
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const quickCreateMenuRef = useRef<HTMLDivElement>(null);
  const [isQuickCreateMenuOpen, setIsQuickCreateMenuOpen] = useState(false);

  // Close filter menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
      if (quickCreateMenuRef.current && !quickCreateMenuRef.current.contains(event.target as Node)) {
        setIsQuickCreateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Keybinds (Escape and Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if any modal is open
      if (isModalOpen || isBulkEditModalOpen) return;
      
      if (e.key === 'Escape') {
        setSelectedTasks(new Set());
        setLastSelectedTaskId(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (selectedTasks.size > 0) {
          const taskIds = Array.from(selectedTasks);
          
          if (advancedSettings?.soft_delete_to_discarded) {
            const tasksToDelete = localTasks.filter(t => taskIds.includes(t.id));
            const allDiscarded = tasksToDelete.every(t => t.status?.toLowerCase() === 'descartada');
            
            if (!allDiscarded) {
              updateMultipleTasks(taskIds, { status: 'descartada' }).then(() => {
                setLocalTasks(prev => prev.map(t => taskIds.includes(t.id) ? { ...t, status: 'descartada' } : t));
                setSelectedTasks(new Set());
                setLastSelectedTaskId(null);
              }).catch(err => alert("Erro ao descartar tarefas: " + err.message));
              return;
            }
          }

          if (advancedSettings?.confirm_on_delete === false || confirm(`Tem certeza que deseja excluir as ${selectedTasks.size} tarefas selecionadas permanentemente?`)) {
            deleteMultipleTasks(taskIds).then(() => {
              setSelectedTasks(new Set());
              setLastSelectedTaskId(null);
            }).catch(err => alert("Erro ao excluir tarefas: " + err.message));
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        setHistory(prev => {
          if (prev.length === 0) return prev;
          const prevTasks = prev[prev.length - 1];
          setLocalTasks(prevTasks);
          
          // Sync with Supabase asynchronously using Server Action
          updateTaskOrders(prevTasks.map(t => ({ id: t.id, ordem_manual: t.ordem_manual || 0 })))
            .catch(err => alert("Erro ao desfazer ordem: " + err.message));
          
          return prev.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isBulkEditModalOpen, selectedTasks, localTasks, advancedSettings]);

  const handleEdit = (task: Task) => {
    // Inject subtasks if this is a parent task
    const subtasks = localTasks.filter(t => t.parent_id === task.id);
    setTaskToEdit({ ...task, subtasks } as any);
    setIsModalOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (sortBy !== 'manual') {
      e.preventDefault();
      alert("Para reordenar, mude a ordenação para 'Manual / Personalizada' nos Filtros.");
      return;
    }
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;
    setDropTargetId(targetId);
    setDropPosition(isTop ? 'top' : 'bottom');
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId || sortBy !== 'manual') return;

    setIsUpdatingOrder(true);
    setDropTargetId(null);

    setHistory(prev => [...prev, [...localTasks]]);

    // Precisamos trabalhar com a lista já ordenada da mesma forma que o usuário vê (manual sort)
    const sortedLocal = [...localTasks].sort((a, b) => {
      let diff = (a.ordem_manual || 0) - (b.ordem_manual || 0);
      if (diff === 0) diff = getStatusWeight(a.status) - getStatusWeight(b.status);
      if (diff === 0) {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        diff = dateA - dateB;
      }
      return diff;
    });

    const draggedIndex = sortedLocal.findIndex(t => t.id === draggedTaskId);
    let targetIndex = sortedLocal.findIndex(t => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setIsUpdatingOrder(false);
      return;
    }

    let tasksToMove = [sortedLocal[draggedIndex]];

    if (selectedTasks.has(draggedTaskId) && selectedTasks.size > 1) {
      tasksToMove = sortedLocal.filter(t => selectedTasks.has(t.id));
      for (let i = sortedLocal.length - 1; i >= 0; i--) {
        if (selectedTasks.has(sortedLocal[i].id)) {
          sortedLocal.splice(i, 1);
        }
      }
    } else {
      sortedLocal.splice(draggedIndex, 1);
    }

    let newTargetIndex = sortedLocal.findIndex(t => t.id === targetTaskId);
    if (newTargetIndex === -1) newTargetIndex = sortedLocal.length;
    if (dropPosition === 'bottom') newTargetIndex += 1;

    sortedLocal.splice(newTargetIndex, 0, ...tasksToMove);

    const updatedTasks = sortedLocal.map((t, index) => ({
      ...t,
      ordem_manual: index
    }));

    setLocalTasks(updatedTasks);
    setDraggedTaskId(null);

    try {
      const updates = updatedTasks.map(t => ({
        id: t.id,
        ordem_manual: t.ordem_manual
      }));
      await updateTaskOrders(updates);
    } catch (err: any) {
      console.error("Erro ao atualizar ordem:", err);
      alert("Aviso: Falha ao salvar no banco. A coluna 'ordem_manual' existe no seu Supabase? Erro original: " + err.message);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleNew = () => {
    let newTask: any = { id: crypto.randomUUID(), status: 'não iniciada', prioridade: 'Baixa', categoria: 'Programar' };
    
    if (selectedDimensions.length === 1 && selectedDimensions[0] !== 'favoritas') {
      newTask.dimensao = selectedDimensions[0];
    }
    if (isPersonalScope) {
      newTask.is_personal = true;
    }
    
    setTaskToEdit(newTask);
    setIsModalOpen(true);
  };

  const handleNewDraftTask = async () => {
    const newTask: any = {
      id: crypto.randomUUID(),
      nome: 'Novo Rascunho de Tarefa',
      status: 'rascunho',
      is_favorite: true,
      prazo: new Date(Date.now() + 7 * 86400000).toISOString(),
      dimensao: selectedDimensions.length === 1 && selectedDimensions[0] !== 'favoritas' ? selectedDimensions[0] : 'Rascunho',
      is_personal: isPersonalScope
    };
    setLocalTasks(prev => [newTask, ...prev]);
    try {
      await saveTask(newTask);
    } catch (e) {
      console.error("Erro ao salvar rascunho de tarefa", e);
    }
  };

  const handleNewDraftEvent = async () => {
    const newEvent: Partial<AgendaEvent> = {
      id: crypto.randomUUID(),
      nome: 'Novo Rascunho de Evento',
      status: 'rascunho',
      data_inicio: new Date().toISOString(),
      dimensao: selectedDimensions.length === 1 && selectedDimensions[0] !== 'favoritas' ? selectedDimensions[0] : 'Rascunho',
      is_labdiv: !isPersonalScope
    };
    setLocalEvents(prev => [newEvent as AgendaEvent, ...prev]);
    try {
      await createEvent(newEvent);
    } catch (e) {
      console.error("Erro ao salvar rascunho de evento", e);
    }
  };

  const handleRowClick = (e: React.MouseEvent, taskId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.tagName === 'INPUT' || target.tagName === 'A' || target.textContent === 'drag_indicator') {
      return;
    }

    const isShift = e.shiftKey;
    const isCtrl = e.ctrlKey || e.metaKey;

    let newSet = new Set(selectedTasks);

    if (isShift && lastSelectedTaskId) {
      const startIdx = processedTasks.findIndex(t => t.id === lastSelectedTaskId);
      const endIdx = processedTasks.findIndex(t => t.id === taskId);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        if (!isCtrl) newSet.clear();
        
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(processedTasks[i].id);
        }
      }
    } else if (isCtrl) {
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
    } else {
      newSet.clear();
      newSet.add(taskId);
    }

    setSelectedTasks(newSet);
    setLastSelectedTaskId(taskId);
  };

  const toggleCheckbox = (e: React.MouseEvent | React.ChangeEvent, taskId: string) => {
    const isShift = (e.nativeEvent as any)?.shiftKey;
    
    let newSet = new Set(selectedTasks);

    if (isShift && lastSelectedTaskId) {
      const startIdx = processedTasks.findIndex(t => t.id === lastSelectedTaskId);
      const endIdx = processedTasks.findIndex(t => t.id === taskId);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(processedTasks[i].id);
        }
      }
    } else {
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
    }

    setSelectedTasks(newSet);
    setLastSelectedTaskId(taskId);
  };

  const scrollToBottom = () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: mainElement.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const uniqueStatuses = useMemo(() => {
    const statusCol = columns.find(c => c.key === 'status');
    const predefined = statusCol ? statusCol.options.map(o => o.value) : ['não iniciada', 'em progresso', 'falta testar', 'completa', 'descartada'];
    const fromTasks = localTasks.map(t => t.status).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks]));
  }, [localTasks, columns]);

  const uniqueCategories = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const catCol = columns.find(c => c.key === 'categoria');
    let predefined = catCol ? catCol.options.map(o => o.value) : ['Programar', 'Design', 'Marketing', 'Geral'];
    if (!isJoao) predefined = ['Trabalho', 'Estudo', 'Casa', 'Geral'];
    
    const fromTasks = localTasks.map(t => t.categoria).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks]));
  }, [localTasks, columns, userId]);

  const uniqueUsers = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const userCol = columns.find(c => c.key === 'responsavel');
    let predefined = userCol ? userCol.options.map(o => o.value) : ['João', 'Andy', 'Leo', 'Dani', 'Lorenzo', 'Nacky'];
    if (!isJoao) predefined = ['Você'];

    const fromTasks = localTasks.map(t => t.responsavel).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks])).sort();
  }, [localTasks, columns, userId]);

  const uniqueDimensions = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const dimCol = columns.find(c => c.key === 'dimensao');
    let predefined = dimCol ? dimCol.options.map(o => o.value) : ['Pessoal', 'Trabalho', 'Estudos', 'Saúde'];
    
    // For non-Stangorlini users, ignore the database options since they are polluted with Stangorlini's tags
    if (!isJoao) {
      predefined = ['Pessoal', 'Trabalho', 'Estudos', 'Saúde'];
    }

    const fromTasks = localTasks.map(t => t.dimensao).filter(Boolean) as string[];
    const fromEvents = localEvents.map(e => e.dimensao).filter(Boolean) as string[];
    let dims = Array.from(new Set([...predefined, ...fromTasks, ...fromEvents]));

    // Remove "favoritas" que estava repetido com visibilidade
    dims = dims.filter(d => d !== 'favoritas');

    if (isPersonalScope && isJoao) {
      dims = dims.filter(d => !['HUB', 'cin', 'stangorlini.web', 'tatuagens'].includes(d));
    }

    return dims.sort();
  }, [localTasks, columns, isPersonalScope, userId]);

  const toggleFilter = (list: string[], setList: (l: string[]) => void, value: string) => {
    if (list.includes(value)) {
      setList(list.filter(item => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  const toggleCustomFilter = (key: string, value: string) => {
    setCustomFilters(prev => {
      const current = prev[key] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [key]: updated };
    });
  };
  // Active filter pills for compact view
  const activeFilterPills = useMemo(() => {
    const pills: { key: string; label: string; onRemove: () => void }[] = [];
    if (showFavoritesOnly) {
      pills.push({
        key: 'fav',
        label: '★ Favoritas',
        onRemove: () => setShowFavoritesOnly(false),
      });
    }
    if (showDraftsOnly) {
      pills.push({
        key: 'draft',
        label: '📝 Rascunhos',
        onRemove: () => setShowDraftsOnly(false),
      });
    }
    selectedStatuses.forEach((s) => {
      pills.push({
        key: `status_${s}`,
        label: `Status: ${s}`,
        onRemove: () => setSelectedStatuses((prev) => prev.filter((x) => x !== s)),
      });
    });
    selectedCategories.forEach((c) => {
      pills.push({
        key: `cat_${c}`,
        label: `Cat: ${c}`,
        onRemove: () => setSelectedCategories((prev) => prev.filter((x) => x !== c)),
      });
    });
    selectedDimensions.forEach((d) => {
      pills.push({
        key: `dim_${d}`,
        label: `Dim: ${d}`,
        onRemove: () => setSelectedDimensions((prev) => prev.filter((x) => x !== d)),
      });
    });
    selectedUsers.forEach((u) => {
      pills.push({
        key: `user_${u}`,
        label: `@${u}`,
        onRemove: () => setSelectedUsers((prev) => prev.filter((x) => x !== u)),
      });
    });
    Object.entries(customFilters).forEach(([colKey, vals]) => {
      if (Array.isArray(vals)) {
        vals.forEach((v) => {
          const colName = columns.find((c) => c.key === colKey)?.name || colKey;
          pills.push({
            key: `custom_${colKey}_${v}`,
            label: `${colName}: ${v}`,
            onRemove: () =>
              setCustomFilters((prev) => ({
                ...prev,
                [colKey]: (prev[colKey] || []).filter((x) => x !== v),
              })),
          });
        });
      }
    });
    return pills;
  }, [
    showFavoritesOnly,
    showDraftsOnly,
    selectedStatuses,
    selectedCategories,
    selectedDimensions,
    selectedUsers,
    customFilters,
    columns,
  ]);

  const clearAllQuickFilters = useCallback(() => {
    setShowFavoritesOnly(false);
    setShowDraftsOnly(false);
    setSelectedStatuses([]);
    setSelectedCategories([]);
    setSelectedDimensions([]);
    setSelectedUsers([]);
    setCustomFilters({});
    setLocalSearchTerm('');
  }, []);

  // Process Events: Filter
  const processedEvents = (() => {
    let evts = [...localEvents];

    const isLabdivDim = (d?: string | null) => {
      const v = (d || '').trim().toLowerCase();
      return v === 'hub' || v === 'labdiv';
    };

    if (activeScope === 'individual') {
      evts = evts.filter(e => !e.is_labdiv && !isLabdivDim(e.dimensao));
    } else if (activeScope === 'organization') {
      const currentOrg = organizations.find(o => o.id === activeOrgId) || organizations[0];
      const isLabdivActive = !currentOrg || currentOrg.id === '1ab41410-0000-4000-8000-000000000001' ||
        currentOrg.slug?.toLowerCase().includes('labdiv') || currentOrg.name?.toLowerCase().includes('labdiv');

      evts = evts.filter(e => {
        if (isLabdivActive && (e.is_labdiv || isLabdivDim(e.dimensao))) return true;
        if ((e as any).organization_id && (e as any).organization_id === currentOrg?.id) return true;
        if (currentOrg?.name && (e.dimensao || '').trim().toLowerCase() === currentOrg.name.trim().toLowerCase()) return true;
        return false;
      });

      if (orgMeetings && orgMeetings.length > 0) {
        const meetingEvents: AgendaEvent[] = orgMeetings.map(m => ({
          id: m.id,
          user_id: userId || '',
          nome: `🏛️ [Reunião] ${m.title}`,
          descricao: m.description || `Reunião da organização ${currentOrg?.name || ''}${m.meet_url ? ` | Link: ${m.meet_url}` : ''}`,
          status: 'confirmado',
          data_inicio: m.scheduled_at ? m.scheduled_at.split('T')[0] : null,
          data_fim: m.scheduled_at ? m.scheduled_at.split('T')[0] : null,
          horarios_semanais: null,
          frequencia: 'Pontual',
          categoria: 'Reunião',
          dimensao: currentOrg?.name || 'HUB',
          created_at: m.created_at || new Date().toISOString(),
          is_labdiv: isLabdivActive,
        }));
        evts = [...evts, ...meetingEvents];
      }
    } else if (activeScope === 'all') {
      if (orgMeetings && orgMeetings.length > 0) {
        const meetingEvents: AgendaEvent[] = orgMeetings.map(m => ({
          id: m.id,
          user_id: userId || '',
          nome: `🏛️ [Reunião] ${m.title}`,
          descricao: m.description || `Reunião institucional${m.meet_url ? ` | Link: ${m.meet_url}` : ''}`,
          status: 'confirmado',
          data_inicio: m.scheduled_at ? m.scheduled_at.split('T')[0] : null,
          data_fim: m.scheduled_at ? m.scheduled_at.split('T')[0] : null,
          horarios_semanais: null,
          frequencia: 'Pontual',
          categoria: 'Reunião',
          dimensao: 'HUB',
          created_at: m.created_at || new Date().toISOString(),
          is_labdiv: true,
        }));
        evts = [...evts, ...meetingEvents];
      }
    }
    if (showDraftsOnly) {
      evts = evts.filter(e => e.status === 'rascunho');
    }
    if (selectedStatuses.length > 0) {
      evts = evts.filter(e => selectedStatuses.includes(e.status || 'confirmado'));
    }
    if (isDailyFollowup && displayMode !== 'tarefas') {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayName = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][new Date().getDay()];
      evts = evts.filter(e => {
        if (e.data_inicio && e.data_inicio.startsWith(todayStr)) return true;
        if (e.horarios_semanais && (e.horarios_semanais as any)[todayName]) {
          const evtStart = e.data_inicio ? new Date(e.data_inicio) : null;
          const evtEnd = e.data_fim ? new Date(e.data_fim) : null;
          const cellTime = new Date().getTime();
          const isAfterStart = !evtStart || cellTime >= evtStart.getTime();
          const isBeforeEnd = !evtEnd || cellTime <= evtEnd.getTime();
          if (isAfterStart && isBeforeEnd) return true;
        }
        return false;
      });
    }
    return evts;
  })();

  // Process Tasks: Filter and Sort
  const processedTasks = (() => {
    let tasks = [...localTasks];

    const isOrgTask = (t: Task) => {
      if (t.is_personal === true) return false;
      if (t.organization_id) return true;
      const dim = (t.dimensao || '').trim().toLowerCase();
      if (dim === 'hub' || dim === 'labdiv') return true;
      if (organizations.some(o => (o.name && o.name.trim().toLowerCase() === dim) || (o.slug && o.slug.trim().toLowerCase() === dim))) {
        return true;
      }
      return false;
    };

    if (activeScope === 'individual') {
      tasks = tasks.filter(t => !isOrgTask(t));
    } else if (activeScope === 'organization') {
      const currentOrg = organizations.find(o => o.id === activeOrgId) || organizations[0];
      if (!currentOrg) {
        tasks = [];
      } else {
        const currentOrgId = currentOrg.id;
        const currentOrgName = (currentOrg.name || '').trim().toLowerCase();
        const currentOrgSlug = ((currentOrg as any).slug || '').trim().toLowerCase();
        const isLabdivActive = currentOrgId === '1ab41410-0000-4000-8000-000000000001' || currentOrgSlug.includes('labdiv') || currentOrgName.includes('labdiv');

        tasks = tasks.filter(t => {
          if (t.is_personal === true) return false;
          if (t.organization_id && t.organization_id === currentOrgId) return true;
          const dim = (t.dimensao || '').trim().toLowerCase();
          if (isLabdivActive && (dim === 'hub' || dim === 'labdiv')) return true;
          if (currentOrg.name && dim === currentOrgName) return true;
          return false;
        });
      }
    }

    if (onlyMyTasks && userId) {
      tasks = tasks.filter(t => t.user_id === userId || (t.responsavel && t.responsavel.toLowerCase().includes('stangorlini')));
    }

    if (isDailyFollowup && displayMode !== 'eventos') {
      const today = new Date().toISOString().split('T')[0];
      tasks = tasks.filter(t => {
        if (!t.prazo) return false; // Se não tem prazo, não tem como saber se é pra hoje ou atrasada (esconde no modo foco)
        const taskDate = t.prazo.split('T')[0];
        const isToday = taskDate === today;
        const isPast = taskDate < today;
        const completionStatuses = advancedSettings?.completion_statuses || ['completa', 'descartada'];
        const isPending = !completionStatuses.includes(t.status || '');
        
        return isToday || (isPast && isPending);
      });
    }

    // 1. Filter Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter(t => 
        t.parent_id || (t.nome && t.nome.toLowerCase().includes(term)) || 
        (t.descricao && t.descricao.toLowerCase().includes(term))
      );
    }
    // 2. Filter Statuses
    if (selectedStatuses.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.status && selectedStatuses.includes(t.status)));
    }
    // 2.5 Filter Favorites
    if (showFavoritesOnly) {
      tasks = tasks.filter(t => t.parent_id || t.is_favorite);
    }
    // 2.6 Filter Drafts
    if (showDraftsOnly) {
      tasks = tasks.filter(t => t.parent_id || t.status === 'rascunho');
    }
    // 3. Filter Categories
    if (selectedCategories.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.categoria && selectedCategories.includes(t.categoria)));
    }
    // 4. Filter Users
    if (selectedUsers.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.responsavel && selectedUsers.includes(t.responsavel)));
    }
    // 5. Filter Dimensions
    if (selectedDimensions.length > 0) {
      if (selectedDimensions.includes('favoritas')) {
        tasks = tasks.filter(t => 
           t.parent_id || (t.is_favorite && selectedDimensions.includes('favoritas')) ||
           (t.dimensao && selectedDimensions.includes(t.dimensao))
        );
      } else {
        tasks = tasks.filter(t => t.parent_id || (t.dimensao && selectedDimensions.includes(t.dimensao)));
      }
    }

    // Keep only children whose parents survived the filtering
    const survivingParentIds = new Set(tasks.filter(t => !t.parent_id).map(t => t.id));
    tasks = tasks.filter(t => !t.parent_id || survivingParentIds.has(t.parent_id));

    const getColIndex = (key: string, val: string | null | undefined) => {
      const col = columns.find(c => c.key === key);
      if (!col || !col.options) return 9999;
      const idx = col.options.findIndex(opt => opt.value === (val || ''));
      return idx === -1 ? 9999 : idx;
    };

    // 5. Sort
    tasks.sort((a, b) => {
      if (advancedSettings?.pin_favorites_to_top) {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      }
      let primaryDiff = 0;
      
      switch(sortBy) {
        case 'status':
          primaryDiff = getColIndex('status', a.status) - getColIndex('status', b.status);
          break;
        case 'status_inv':
          primaryDiff = getColIndex('status', b.status) - getColIndex('status', a.status);
          break;
        case 'prazo':
          const pA = a.prazo ? new Date(a.prazo).getTime() : Infinity;
          const pB = b.prazo ? new Date(b.prazo).getTime() : Infinity;
          primaryDiff = pA - pB;
          break;
        case 'categoria':
          primaryDiff = getColIndex('categoria', a.categoria) - getColIndex('categoria', b.categoria);
          if (primaryDiff === 0) {
            primaryDiff = (a.categoria || '').localeCompare(b.categoria || '');
          }
          break;
        case 'prioridade_desc':
          primaryDiff = getColIndex('prioridade', a.prioridade) - getColIndex('prioridade', b.prioridade);
          break;
        case 'prioridade_asc':
          primaryDiff = getColIndex('prioridade', b.prioridade) - getColIndex('prioridade', a.prioridade);
          break;
        case 'manual':
          primaryDiff = (a.ordem_manual || 0) - (b.ordem_manual || 0);
          if (primaryDiff === 0) {
            primaryDiff = getColIndex('status', a.status) - getColIndex('status', b.status);
          }
          break;
        default:
          if (sortBy.startsWith('custom_')) {
            const colKey = sortBy.replace('custom_', '');
            const col = columns.find(c => c.key === colKey);
            const vA = (a as any)[colKey] ?? (a.custom_fields as any)?.[colKey] ?? '';
            const vB = (b as any)[colKey] ?? (b.custom_fields as any)?.[colKey] ?? '';
            if (col && col.options && col.options.length > 0) {
              const idxA = col.options.findIndex(opt => opt.value === vA);
              const idxB = col.options.findIndex(opt => opt.value === vB);
              const finalIdxA = idxA === -1 ? 9999 : idxA;
              const finalIdxB = idxB === -1 ? 9999 : idxB;
              primaryDiff = finalIdxA - finalIdxB;
            } else {
              primaryDiff = vA.localeCompare(vB);
            }
          }
          break;
      }

      if (primaryDiff !== 0) return primaryDiff;
      
      // Secundário: created_at DESC (mais novas no topo, mais antigas no fundo)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

    const interleaved: Task[] = [];
    const parentTasks = tasks.filter(t => !t.parent_id);
    
    // Group children by parent
    const childTasksByParent: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (t.parent_id) {
        if (!childTasksByParent[t.parent_id]) childTasksByParent[t.parent_id] = [];
        childTasksByParent[t.parent_id].push(t);
      }
    }

    for (const parent of parentTasks) {
       interleaved.push(parent);
       if (!collapsedTasks.has(parent.id) && childTasksByParent[parent.id]) {
           interleaved.push(...childTasksByParent[parent.id]);
       }
    }

    return interleaved;
  })();

  const hasAnyPrazo = processedTasks.some(t => t.prazo);

  return (
    <div className="w-full flex flex-col relative">
      
      {/* ========================================================
          BARRA DE COMANDO UNIFICADA (Unified Command Toolbar)
          Substitui as 4 camadas horizontais anteriores por uma
          única faixa elegante de alta densidade (~48px)
          ======================================================== */}
      <div className="w-full flex flex-col gap-2.5 mb-4 shrink-0">
        <div className="w-full bg-surface border border-border-subtle rounded-2xl p-2 md:p-2.5 shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Lado Esquerdo: Escopo (Tudo vs Individual vs Organização) integrado */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-[10px] font-black text-fg-muted uppercase tracking-wider mr-1 hidden sm:inline">Escopo:</span>
            <div className="inline-flex p-1 bg-app rounded-xl border border-border-subtle">
              {organizations && organizations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveScope('all');
                    if (viewMode === 'org_management') setViewMode('list');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeScope === 'all'
                      ? 'bg-gradient-brand text-[var(--on-accent-primary)] shadow-sm font-black'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Ver tarefas e eventos individuais e organizacionais juntos"
                >
                  <span className="material-symbols-outlined text-[15px]">public</span>
                  Tudo
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveScope('individual');
                  if (viewMode === 'org_management') setViewMode('list');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeScope === 'individual'
                    ? 'bg-gradient-brand text-[var(--on-accent-primary)] shadow-sm font-black'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">person</span>
                Individual
              </button>
              
              {organizations && organizations.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveScope('organization')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeScope === 'organization'
                      ? 'bg-gradient-brand text-[var(--on-accent-primary)] shadow-sm font-black'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">domain</span>
                  {activeOrg?.name || 'Organização'}
                  <span className="rounded-full bg-slate-900/60 px-1.5 py-0.2 text-[10px] text-teal-300 font-mono">
                    {organizations.length}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-300 hover:bg-teal-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Entrar com Código ou Criar Organização"
                >
                  <span className="material-symbols-outlined text-[15px]">domain_add</span>
                  <span>🏛️ + Entrar ou Criar Org</span>
                </button>
              )}
            </div>

            {/* Seletor se tiver mais de uma organização */}
            {activeScope === 'organization' && organizations.length > 1 && (
              <select
                value={activeOrgId || organizations[0]?.id}
                onChange={(e) => setActiveOrgId(e.target.value)}
                className="bg-surface border border-border-subtle text-fg text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--accent-primary)] cursor-pointer"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}

            {/* Ações rápidas de organização (Entrar / Criar) */}
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => setIsJoinModalOpen(true)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg border border-transparent hover:border-border-subtle transition-colors cursor-pointer"
                title="Entrar com Código de Convite"
              >
                <span className="material-symbols-outlined text-[16px]">key</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg border border-transparent hover:border-border-subtle transition-colors cursor-pointer"
                title="Criar Nova Organização"
              >
                <span className="material-symbols-outlined text-[16px]">add_business</span>
              </button>
            </div>
          </div>

          {/* Centro: Modos de Visualização (Lista | Semanal | Mensal | Equipe) */}
          <div className="flex items-center justify-center gap-1 bg-app p-1 rounded-xl border border-border-subtle shrink-0 self-center lg:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#9D4EDD] text-white shadow-sm font-black'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
              <span>Lista</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'weekly'
                  ? 'bg-[#9D4EDD] text-white shadow-sm font-black'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">view_week</span>
              <span>Semanal</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'monthly'
                  ? 'bg-[#9D4EDD] text-white shadow-sm font-black'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              <span>Mensal</span>
            </button>

            {activeScope === 'organization' && (
              <button
                type="button"
                onClick={() => setViewMode('org_management')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'org_management'
                    ? 'bg-teal-500 text-slate-950 font-black shadow-sm'
                    : 'text-teal-400 hover:bg-teal-500/10'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">groups</span>
                <span>Equipe</span>
                {activeOrgDetails?.members?.length ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                    {activeOrgDetails.members.length}
                  </span>
                ) : null}
              </button>
            )}
          </div>

          {/* Lado Direito: Ações (Filtros, Colunas, Foco, Criação, Contadores) */}
          <div className="flex items-center gap-2 justify-end shrink-0 flex-wrap" data-tour="tasks-toolbar">
            {/* Contador de tarefas e Bulk Edit */}
            <div className="flex items-center text-fg-muted text-[11px] font-bold px-2.5 py-1 bg-app rounded-lg border border-border-subtle h-[34px] text-fg-muted">
              <span className="text-[#FFCC00] text-xs mr-1">{processedTasks.length}</span>
              <span className="hidden xl:inline mr-1">/</span>
              <span className="text-white text-xs mr-1">{localTasks.length}</span>
              <span className="hidden xl:inline">visíveis</span>
              {selectedTasks.size > 1 && (
                <button
                  type="button"
                  onClick={() => setIsBulkEditModalOpen(true)}
                  className="ml-2 bg-[#9D4EDD]/20 text-[#9D4EDD] hover:bg-[#9D4EDD] hover:text-white border border-[#9D4EDD]/50 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[12px]">edit</span>
                  Editar ({selectedTasks.size})
                </button>
              )}
            </div>

            {/* Gatilho de Filtros */}
            {displayMode !== 'eventos' && advancedSettings.show_quick_filters !== false && (
              <button
                type="button"
                data-tour="tasks-quick-filters"
                onClick={toggleQuickFiltersExpanded}
                className={`h-[34px] px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  isQuickFiltersExpanded || activeFilterPills.length > 0
                    ? 'bg-[var(--accent-secondary,#FFCC00)]/15 border-[var(--accent-secondary,#FFCC00)] text-[var(--accent-secondary,#FFCC00)]'
                    : 'bg-app border border-border-subtle text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface-hover'
                }`}
                title="Filtros e Ordenação"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span>Filtros</span>
                {activeFilterPills.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-[var(--accent-secondary,#FFCC00)] text-black">
                    {activeFilterPills.length}
                  </span>
                )}
                <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isQuickFiltersExpanded ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
            )}

            {/* Editar Colunas */}
            {displayMode !== 'eventos' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
                  className="h-[34px] bg-app border border-border-subtle text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface-hover px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Editar Colunas Visíveis"
                >
                  <span className="material-symbols-outlined text-[16px]">view_column</span>
                  <span className="hidden sm:inline">Colunas</span>
                  <span className="material-symbols-outlined text-[14px]">expand_more</span>
                </button>

                {isColumnsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[240px] bg-surface border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-border-subtle">
                      <h3 className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2">Colunas</h3>
                      <div className="flex flex-col gap-1 max-h-[250px] overflow-y-auto">
                        {columns.map(col => (
                          <div key={col.id} className="flex justify-between items-center group px-2 py-1.5 hover:bg-surface-hover rounded-md transition-colors">
                            <span className="text-sm text-white truncate max-w-[150px]">{col.name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsColumnsMenuOpen(false);
                                setEditingColumn(col);
                              }}
                              className="text-fg-muted hover:text-[#FFCC00] transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center p-1"
                              title="Editar Coluna"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setIsColumnsMenuOpen(false);
                        setEditingColumn({
                          id: crypto.randomUUID(),
                          key: `custom_${Date.now()}`,
                          name: 'Nova Coluna',
                          type: 'select',
                          options: [],
                          is_native: false,
                          order_num: 0
                        });
                      }}
                      className="px-4 py-2.5 cursor-pointer transition-colors text-[#FFCC00] hover:bg-surface-hover font-bold text-xs flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      Adicionar Nova Coluna
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Foco Diário */}
            {displayMode !== 'eventos' && (
              <button
                type="button"
                onClick={() => setIsDailyFollowup(!isDailyFollowup)}
                className={`h-[34px] px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  isDailyFollowup
                    ? 'bg-[#9D4EDD] text-white border-[#9D4EDD]'
                    : 'bg-app border border-border-subtle text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface-hover'
                }`}
                title="Foco Diário (Hoje & Pendentes)"
              >
                <span className="material-symbols-outlined text-[16px]">track_changes</span>
                <span className="hidden sm:inline">Foco</span>
              </button>
            )}

            {/* Importar ICS se modo não for apenas tarefas */}
            {displayMode !== 'tarefas' && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="h-[34px] bg-app border border-border-subtle text-fg font-bold px-2.5 py-1 text-xs rounded-lg hover:bg-surface-hover hover:border-[var(--accent-primary)] transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                title="Importar de Google Agenda / .ics"
              >
                <span className="material-symbols-outlined text-[16px]">file_upload</span>
                <span className="hidden sm:inline">.ics</span>
              </button>
            )}

            {/* Criação Rápida */}
            <div className="relative shrink-0" ref={quickCreateMenuRef}>
              <button
                type="button"
                onClick={() => setIsQuickCreateMenuOpen(!isQuickCreateMenuOpen)}
                className="h-[34px] bg-gradient-brand text-[var(--on-accent-secondary)] font-black px-3 py-1 text-xs rounded-lg hover:brightness-110 transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">bolt</span>
                <span>Criar</span>
                <span className="material-symbols-outlined text-[14px]">{isQuickCreateMenuOpen ? 'expand_less' : 'expand_more'}</span>
              </button>

              {isQuickCreateMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-surface border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-fg-muted uppercase tracking-wider border-b border-border-subtle">
                    Rascunhos Rápidos
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsQuickCreateMenuOpen(false); handleNewDraftTask(); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-white hover:bg-[#9D4EDD]/20 hover:text-[#9D4EDD] transition-colors flex items-center gap-2.5 font-bold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">edit_note</span>
                    Rascunho de Tarefa
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsQuickCreateMenuOpen(false); handleNewDraftEvent(); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-white hover:bg-[#9D4EDD]/20 hover:text-[#9D4EDD] transition-colors flex items-center gap-2.5 font-bold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#9D4EDD]">event_note</span>
                    Rascunho de Evento
                  </button>

                  <div className="h-[1px] bg-border-subtle my-1" />

                  <div className="px-3 py-1.5 text-[10px] font-bold text-fg-muted uppercase tracking-wider border-b border-border-subtle">
                    Formulário Completo
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsQuickCreateMenuOpen(false); handleNew(); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-fg-secondary hover:bg-surface-hover hover:text-white transition-colors flex items-center gap-2.5 font-medium cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">add_task</span>
                    Nova Tarefa Completa
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsQuickCreateMenuOpen(false); handleNewEvent(); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-fg-secondary hover:bg-surface-hover hover:text-white transition-colors flex items-center gap-2.5 font-medium cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#9D4EDD]">calendar_add_on</span>
                    Novo Evento Completo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chips de Filtros Ativos (quando recolhido, mas houver filtros aplicados) */}
        {!isQuickFiltersExpanded && activeFilterPills.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface/70 border border-border-subtle rounded-xl overflow-x-auto hide-scrollbar">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider shrink-0">Filtros:</span>
            <div className="flex items-center gap-1.5 flex-1 overflow-x-auto hide-scrollbar">
              {activeFilterPills.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-hover border border-border-subtle text-fg shrink-0"
                >
                  <span className="truncate max-w-[130px]">{p.label}</span>
                  <button
                    type="button"
                    onClick={() => p.onRemove()}
                    className="text-fg-muted hover:text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] cursor-pointer"
                    title="Remover filtro"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={clearAllQuickFilters}
              className="text-[11px] font-bold text-fg-secondary hover:text-rose-400 px-2 py-0.5 rounded border border-border-subtle hover:border-rose-500/40 transition-colors shrink-0 cursor-pointer"
            >
              Limpar tudo
            </button>
          </div>
        )}

        {/* Painel Completo de Filtros quando Expandido */}
        {isQuickFiltersExpanded && (
          <div className="w-full bg-surface border border-border-subtle rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-3">
            {/* Header do Painel */}
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[var(--accent-secondary,#FFCC00)]">tune</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">Painel de Filtros e Ordenação</span>
                {activeFilterPills.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[var(--accent-secondary,#FFCC00)]/20 text-[var(--accent-secondary,#FFCC00)] border border-[var(--accent-secondary,#FFCC00)]/40">
                    {activeFilterPills.length} {activeFilterPills.length === 1 ? 'ativo' : 'ativos'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeFilterPills.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllQuickFilters}
                    className="text-[11px] font-bold text-fg-secondary hover:text-rose-400 px-2 py-0.5 rounded border border-border-subtle hover:border-rose-500/40 transition-colors cursor-pointer"
                  >
                    Limpar tudo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsQuickFiltersModalOpen(true)}
                  className="p-1 text-fg-muted hover:text-[var(--accent-primary,#9D4EDD)] hover:bg-surface-hover rounded transition-colors cursor-pointer"
                  title="Configurar Filtros Rápidos"
                >
                  <span className="material-symbols-outlined text-[16px]">settings</span>
                </button>
              </div>
            </div>

            {/* Row 1: Ordenação dinâmica */}
            {displayMode !== 'eventos' && quickSorts.length > 0 && (
              <div className="flex w-full overflow-x-auto hide-scrollbar items-center justify-start gap-2 shrink-0 pb-1">
                <span className="text-[10px] text-fg-muted px-1 font-bold uppercase tracking-wider shrink-0">Ordem:</span>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {quickSorts.map(sortKey => {
                    if (sortKey === 'status') {
                      return (
                        <React.Fragment key="status">
                          <button type="button" onClick={() => setSortBy('status')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === 'status' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>Padrão</button>
                          <button type="button" onClick={() => setSortBy('status_inv')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === 'status_inv' ? 'bg-[#FFCC00]/15 border-[#FFCC00] text-[#FFCC00]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>Padrão (inv)</button>
                        </React.Fragment>
                      );
                    }
                    if (sortKey === 'manual') {
                      return <button type="button" key="manual" onClick={() => setSortBy('manual')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === 'manual' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>Manual</button>;
                    }
                    if (sortKey === 'prazo') {
                      return <button type="button" key="prazo" onClick={() => setSortBy('prazo')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === 'prazo' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>Prazo</button>;
                    }
                    if (sortKey === 'prioridade') {
                      return (
                        <React.Fragment key="prioridade">
                          <button type="button" onClick={() => setSortBy('prioridade_desc')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 cursor-pointer ${sortBy === 'prioridade_desc' ? getBadgeColorClass('prioridade', 'alta') : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}><span className="material-symbols-outlined text-[12px]">arrow_upward</span> Alta</button>
                          <button type="button" onClick={() => setSortBy('prioridade_asc')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 cursor-pointer ${sortBy === 'prioridade_asc' ? getBadgeColorClass('prioridade', 'baixa') : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}><span className="material-symbols-outlined text-[12px]">arrow_downward</span> Baixa</button>
                        </React.Fragment>
                      );
                    }
                    if (sortKey === 'categoria') {
                      return <button type="button" key="categoria" onClick={() => setSortBy('categoria')} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === 'categoria' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>Categoria</button>;
                    }
                    const col = columns.find(c => c.key === sortKey);
                    if (col) {
                      return (
                        <button type="button" key={`custom_${sortKey}`} onClick={() => setSortBy(`custom_${sortKey}`)} className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${sortBy === `custom_${sortKey}` ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>{col.name}</button>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {/* Row 2: Status (Visibilidade) */}
            {displayMode !== 'eventos' && (
              <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start">
                <span className="text-[10px] text-fg-muted px-1 font-bold uppercase tracking-wider shrink-0">Status:</span>
                <button
                  type="button"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={`h-[26px] px-2 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center gap-1 cursor-pointer ${
                    showFavoritesOnly ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Apenas Favoritas"
                >
                  <span className={`material-symbols-outlined text-[12px] ${showFavoritesOnly ? 'text-[#FFCC00]' : ''}`}>star</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraftsOnly(!showDraftsOnly)}
                  className={`h-[26px] px-2.5 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center gap-1 cursor-pointer ${
                    showDraftsOnly ? 'bg-[#8E8E8E]/20 border-[#8E8E8E] text-fg-muted' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[12px] ${showDraftsOnly ? 'text-fg-muted' : ''}`}>draft</span> Rascunhos
                </button>
                {uniqueStatuses.map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggleFilter(selectedStatuses, setSelectedStatuses, s)}
                    className={`h-[26px] px-2.5 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center cursor-pointer ${
                      selectedStatuses.includes(s) ? getBadgeColorClass('status', s) : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Filtros Customizados baseados no quickFilters */}
            {displayMode !== 'eventos' && quickFilters.map(filterKey => {
              const col = columns.find(c => c.key === filterKey);
              let options: string[] = [];
              let isSelected: (val: string) => boolean = () => false;
              let onToggle: (val: string) => void = () => {};
              let onClear: () => void = () => {};
              let isAllSelected = false;
              let isHidden = false;

              if (filterKey === 'responsavel') {
                options = uniqueUsers;
                isSelected = (v) => selectedUsers.includes(v);
                onToggle = (v) => toggleFilter(selectedUsers, setSelectedUsers, v);
                onClear = () => setSelectedUsers([]);
                isAllSelected = selectedUsers.length === 0;
                if (isPersonalScope) isHidden = true;
              } else if (filterKey === 'dimensao') {
                options = uniqueDimensions;
                isSelected = (v) => selectedDimensions.includes(v);
                onToggle = (v) => toggleFilter(selectedDimensions, setSelectedDimensions, v);
                onClear = () => setSelectedDimensions([]);
                isAllSelected = selectedDimensions.length === 0;
              } else if (filterKey === 'status') {
                options = uniqueStatuses;
                isSelected = (v) => selectedStatuses.includes(v);
                onToggle = (v) => toggleFilter(selectedStatuses, setSelectedStatuses, v);
                onClear = () => setSelectedStatuses([]);
                isAllSelected = selectedStatuses.length === 0;
              } else if (filterKey === 'categoria') {
                options = uniqueCategories;
                isSelected = (v) => selectedCategories.includes(v);
                onToggle = (v) => toggleFilter(selectedCategories, setSelectedCategories, v);
                onClear = () => setSelectedCategories([]);
                isAllSelected = selectedCategories.length === 0;
              } else if (col) {
                options = col.options.map(o => o.value);
                isSelected = (v) => (customFilters[filterKey] || []).includes(v);
                onToggle = (v) => toggleCustomFilter(filterKey, v);
                onClear = () => setCustomFilters(prev => ({ ...prev, [filterKey]: [] }));
                isAllSelected = (customFilters[filterKey] || []).length === 0;
              }

              options = options.filter(o => o && o.trim() !== '');
              if (isHidden || options.length === 0) return null;

              return (
                <div key={filterKey} className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start">
                  <span className="text-[10px] text-fg-muted px-1 font-bold uppercase tracking-wider shrink-0">
                    {col ? col.name : filterKey}:
                  </span>
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={onClear}
                      className={`h-[26px] px-2.5 text-[11px] rounded-md border transition-colors font-bold shrink-0 cursor-pointer ${
                        isAllSelected ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                      }`}
                    >
                      Todas
                    </button>
                  )}
                  {filterKey === 'dimensao' && (
                    <button
                      type="button"
                      data-tour="filter-only-mine"
                      onClick={() => setOnlyMyTasks((prev) => !prev)}
                      className={`h-[26px] px-2.5 text-[11px] rounded-md border transition-all font-bold shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        onlyMyTasks
                          ? 'bg-[var(--accent-primary,#9D4EDD)] text-white border-[var(--accent-primary,#9D4EDD)] shadow-sm'
                          : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                      }`}
                    >
                      <span>🎯 Apenas Minhas</span>
                    </button>
                  )}
                  {options.map(o => (
                    <button
                      type="button"
                      key={o}
                      onClick={() => onToggle(o)}
                      className={`h-[26px] px-2.5 text-[11px] ${filterKey === 'responsavel' ? 'rounded-full' : 'rounded-md'} border transition-colors font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
                        isSelected(o) ? getBadgeColorClass(filterKey, o) : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                      }`}
                    >
                      {filterKey === 'responsavel' && <span className="material-symbols-outlined text-[12px]">person</span>}
                      {o}
                    </button>
                  ))}
                </div>
              );
            })}

            {/* Acompanhamento se estiver em eventos ou ambos */}
            {(displayMode === 'eventos' || displayMode === 'ambos') && (
              <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start">
                <span className="text-[10px] text-fg-muted px-1 font-bold uppercase tracking-wider shrink-0">
                  Acompanhamento:
                </span>
                <button
                  type="button"
                  onClick={() => setIsDailyFollowup(!isDailyFollowup)}
                  className={`h-[26px] px-3 text-[11px] rounded-md border transition-colors font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
                    isDailyFollowup ? 'bg-[#9D4EDD] text-white border-[#9D4EDD]' : 'bg-surface border border-border-subtle text-fg-muted hover:text-fg hover:bg-surface-hover'
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px]">today</span>
                  Hoje & Pendentes
                </button>
              </div>
            )}

            {/* Exportação */}
            {advancedSettings?.show_export_buttons !== false && (
              <div className="pt-2 border-t border-border-subtle flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">
                  Exportar ({processedTasks.length} visíveis):
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadCSV(processedTasks, 'tarefas.csv')}
                    className="flex items-center gap-1.5 px-2.5 py-1 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 rounded text-xs font-semibold transition-colors cursor-pointer"
                    title="Baixar em formato CSV"
                  >
                    <span className="material-symbols-outlined text-[14px]">table</span>
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadICS(processedTasks, 'tarefas.ics')}
                    className="flex items-center gap-1.5 px-2.5 py-1 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 rounded text-xs font-semibold transition-colors cursor-pointer"
                    title="Baixar em formato de calendário ICS"
                  >
                    <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                    Agenda (ICS)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seção Expansível de Tarefas Sem Responsável na Área de Tarefas (Apenas na aba Gestão ou no filtro de Organização) */}
      {(() => {
        const isOrgContext =
          showUnassignedBanner === true ||
          activeScope === 'organization';

        if (!isOrgContext) return null;

        const unassignedList = localTasks.filter(
          (t) =>
            (!t.responsavel || t.responsavel.trim() === '' || t.responsavel === 'Sem Responsável') &&
            (!t.assigned_member_ids || t.assigned_member_ids.length === 0)
        );
        if (unassignedList.length === 0) return null;

        return (
          <div className="w-full mt-3 p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsUnassignedTasksExpanded((prev) => !prev)}
                className="flex items-center gap-2 cursor-pointer text-left group"
              >
                <span className="material-symbols-outlined text-amber-400 text-[20px] group-hover:scale-110 transition-transform">
                  assignment_late
                </span>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Tarefas Sem Responsável ({unassignedList.length})
                </span>
                <span className="material-symbols-outlined text-amber-400/80 text-[16px]">
                  {isUnassignedTasksExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBatchAssigningUnassigned}
                  onClick={async () => {
                    setIsBatchAssigningUnassigned(true);
                    try {
                      const myName = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? 'João' : 'Eu';
                      for (const t of unassignedList) {
                        const updated: Task = {
                          ...t,
                          responsavel: myName,
                          user_id: userId || t.user_id,
                        };
                        await saveTask(updated);
                      }
                      setLocalTasks((prev) =>
                        prev.map((t) => {
                          const isUn =
                            (!t.responsavel || t.responsavel.trim() === '' || t.responsavel === 'Sem Responsável') &&
                            (!t.assigned_member_ids || t.assigned_member_ids.length === 0);
                          if (isUn) {
                            return {
                              ...t,
                              responsavel: myName,
                              user_id: userId || t.user_id,
                            };
                          }
                          return t;
                        })
                      );
                    } finally {
                      setIsBatchAssigningUnassigned(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">done_all</span>
                  <span>{isBatchAssigningUnassigned ? 'Atribuindo...' : 'Atribuir Todas para Mim'}</span>
                </button>
              </div>
            </div>

            {isUnassignedTasksExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-amber-500/20">
                {unassignedList.map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-lg bg-surface border border-border-subtle flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-fg block truncate">{task.nome}</span>
                      <span className="text-[10px] text-fg-muted">{task.categoria || 'Geral'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const myName = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? 'João' : 'Eu';
                        const updated: Task = {
                          ...task,
                          responsavel: myName,
                          user_id: userId || task.user_id,
                        };
                        await saveTask(updated);
                        setLocalTasks((prev) =>
                          prev.map((t) => (t.id === task.id ? updated : t))
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Assumir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {viewMode === 'list' && displayMode !== 'eventos' && (
        <div data-tour="tasks-main-view" className="flex flex-col gap-2 mt-4 custom-scrollbar overflow-x-auto w-full border border-border-subtle rounded-lg relative overflow-hidden" style={{ minHeight: '600px' }}>
          <div ref={desktopContainerRef} style={{ overflowAnchor: 'none' }} className="hidden md:block overflow-x-auto bg-surface border border-border-subtle rounded-lg relative">
            <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead className="bg-surface-hover border-b border-border-subtle sticky top-0 z-10">
            <tr>
              <th className="p-4 w-[100px] text-center">
                <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTasks(new Set(processedTasks.map(t => t.id)));
                  } else {
                    setSelectedTasks(new Set());
                  }
                }} checked={selectedTasks.size === processedTasks.length && processedTasks.length > 0} />
              </th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider text-center w-[60px]">
                <div className="flex items-center justify-center gap-1 relative group/tooltip cursor-help w-fit mx-auto">
                  Ação <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    Botões de edição e sub-tarefas.
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider w-[220px]">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Nome <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-left font-normal normal-case tracking-normal left-0">
                    O nome principal da sua tarefa.
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Status <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    O estágio atual da tarefa (Ex: Em progresso).
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Prioridade <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    Nível de urgência (Alta, Média, Baixa).
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Categoria <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    O tipo de ação (Ex: Programar, Estudar).
                  </div>
                </div>
              </th>
              {visibleExtraCols.includes("responsavel") && <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Responsável</th>}
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Criada em</th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Início</th>
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Prazo</th>
              {hasAnyPrazo && <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Dias Restantes</th>}
              {visibleExtraCols.includes("concluida_em") && <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Concluída em</th>}
              {visibleExtraCols.includes("frequencia") && <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Freq.</th>}
              <th className="p-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Dimensão <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    A grande área da sua vida (Pessoal, Saúde, etc).
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {localTasks.length === 0 && (
              <tr>
                <td colSpan={14} className="p-8 text-center text-fg-muted">
                  Nenhuma tarefa encontrada. Clique em <span className="text-[#FFCC00] font-bold">+ Nova Tarefa</span> para começar.
                </td>
              </tr>
            )}
            {processedTasks.map(task => (
              <React.Fragment key={task.id}>
              <tr 
                draggable={sortBy === 'manual' ? true : undefined}
                onDragStart={sortBy === 'manual' ? (e) => handleDragStart(e, task.id) : undefined}
                onDragOver={sortBy === 'manual' ? (e) => handleDragOver(e, task.id) : undefined}
                onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
                onDrop={sortBy === 'manual' ? (e) => handleDrop(e, task.id) : undefined}
                onDragEnd={sortBy === 'manual' ? () => setDropTargetId(null) : undefined}
                onClick={(e) => handleRowClick(e, task.id)}
                className={`transition-colors group ${selectedTasks.has(task.id) ? 'bg-[#9D4EDD]/10' : 'hover:bg-surface-hover'} ${draggedTaskId === task.id ? 'opacity-50' : ''} ${dropTargetId === task.id ? (dropPosition === 'top' ? 'border-t-2 border-[#9D4EDD]' : 'border-b-2 border-[#9D4EDD]') : 'border-b border-[#FFCC00]/30 hover:border-[#9D4EDD]'}`}
              >
                <td className="p-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className={`material-symbols-outlined text-fg-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
                    <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
                    <button onClick={(e) => handleFavoriteToggle(e, task.id)} className={`transition-colors flex items-center justify-center ${task.is_favorite ? 'text-[#FFCC00]' : 'text-fg-muted hover:text-[#FFCC00]'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${task.is_favorite ? 'filled' : ''}`} style={task.is_favorite ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
                    </button>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button 
                    onClick={() => handleEdit(task)}
                    className="text-fg-muted hover:text-[#9D4EDD] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </td>
                <td className="p-4 text-sm font-medium text-white break-words" title={task.descricao || ''}>
                  <div className={`flex items-center gap-2 ${task.parent_id ? 'pl-3 border-l-2 border-[#FFCC00] ml-4 scale-[0.97] origin-left' : ''}`}>
                    {!task.parent_id && localTasks.some(t => t.parent_id === task.id) && (
                      <button onClick={(e) => toggleExpand(e, task.id)} className="text-fg-muted hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">{!collapsedTasks.has(task.id) ? 'expand_more' : 'chevron_right'}</span>
                      </button>
                    )}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <HighlightedText text={task.nome} highlight={searchTerm} />
                        {(task as any).custom_fields?.foto_url && (
                          <a href={(task as any).custom_fields.foto_url} target="_blank" rel="noopener noreferrer" className="text-fg-muted hover:text-[#9D4EDD] flex items-center transition-colors" title="Ver foto">
                            <span className="material-symbols-outlined text-[16px]">image</span>
                          </a>
                        )}
                      </div>
                      {task.descricao && (
                        <div className="mt-1 flex flex-col items-start w-full pr-2">
                          <div className={`text-xs text-fg-secondary transition-all ${(expandedTasks.includes(task.id) || advancedSettings?.auto_expand_descriptions) ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>
                            <HighlightedText text={task.descricao} highlight={searchTerm} />
                          </div>
                          {(!advancedSettings?.auto_expand_descriptions && (task.descricao.length > 80 || task.descricao.includes('\n'))) && (
                            <button 
                              onClick={(e) => toggleTaskExpansion(task.id, e)}
                              className="text-[#9D4EDD] text-[10px] font-bold mt-1 flex items-center hover:underline"
                            >
                              {expandedTasks.includes(task.id) ? (
                                <>Ver menos <span className="material-symbols-outlined text-[14px]">expand_less</span></>
                              ) : (
                                <>Ver mais <span className="material-symbols-outlined text-[14px]">expand_more</span></>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'status')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar status"><Badge type="status" value={task.status} customColor={getColColor('status', task.status)} /></div></td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'prioridade')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar prioridade"><Badge type="prioridade" value={task.prioridade} customColor={getColColor('prioridade', task.prioridade)} /></div></td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'categoria')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar categoria"><Badge type="categoria" value={task.categoria} customColor={getColColor('categoria', task.categoria)} /></div></td>
                {!isPersonalScope && <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'responsavel')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar responsável"><Badge type="responsavel" value={task.responsavel} customColor={getColColor('responsavel', task.responsavel)} /></div></td>}
                <td className="p-4 text-xs text-fg-secondary">{formatDate(task.created_at)}</td>
                <td className="p-4 text-xs text-fg-secondary">{formatDate(task.inicio)}</td>
                <td className="p-4 text-xs text-fg-secondary">{formatDate(task.prazo)}</td>
                {hasAnyPrazo && (
                  <td className="p-4 text-xs">
                    {task.prazo ? (
                      (() => {
                        if (task.status === 'completa') {
                          const days = getDaysUntil(task.prazo, task.concluida_em);
                          if (days === null) return <span className="text-[#9D4EDD] font-bold">Concluída</span>;
                          return <span className="text-[#9D4EDD] font-bold">Concluída ({days > 0 ? `+${days}d` : `${days}d`})</span>;
                        }
                        if (task.status === 'descartada') return <span className="text-fg-muted font-bold">-</span>;
                        const days = getDaysUntil(task.prazo);
                        if (days === null) return '-';
                        if (days < 0) return <span className="text-[#db4437] font-bold">Atrasada ({-days}d)</span>;
                        if (days === 0) return <span className="text-[#db4437] font-bold">Hoje!</span>;
                        return <span className="text-[#FFCC00] font-bold">{days} dias</span>;
                      })()
                    ) : '-'}
                  </td>
                )}
                <td className="p-4 text-xs text-fg-secondary">{formatDate(task.concluida_em)}</td>
                <td className="p-4 text-xs text-fg-secondary">{task.frequencia || '-'}</td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'dimensao')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar dimensão"><Badge type="dimensao" value={task.dimensao} customColor={getColColor('dimensao', task.dimensao)} /></div></td>
              </tr>
              </React.Fragment>
            ))}
            {processedTasks.length === 0 && (
              <tr>
                <td colSpan={13} className="p-8 text-center text-fg-muted text-sm">Nenhuma tarefa encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View (Cards) */}
      <div ref={mobileContainerRef} style={{ overflowAnchor: 'none' }} className="md:hidden space-y-4 pb-20 mt-4">
        {processedTasks.map(task => (
          <div 
            key={task.id} 
            draggable={sortBy === 'manual' ? true : undefined}
            onDragStart={sortBy === 'manual' ? (e) => handleDragStart(e, task.id) : undefined}
            onDragOver={sortBy === 'manual' ? (e) => handleDragOver(e, task.id) : undefined}
            onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
            onDrop={sortBy === 'manual' ? (e) => handleDrop(e, task.id) : undefined}
            onDragEnd={sortBy === 'manual' ? () => setDropTargetId(null) : undefined}
            onClick={(e) => handleRowClick(e, task.id)}
            className={`border rounded-lg p-4 flex flex-col gap-3 relative transition-colors ${selectedTasks.has(task.id) ? 'bg-[#9D4EDD]/10 border-[#9D4EDD]/30' : 'bg-surface border border-border-subtle hover:border-[var(--accent-primary)]'} ${draggedTaskId === task.id ? 'opacity-50' : ''} ${dropTargetId === task.id ? (dropPosition === 'top' ? 'border-t-2 border-[#9D4EDD]' : 'border-b-2 border-[#9D4EDD]') : ''} ${task.parent_id ? 'border-l-2 border-l-[#FFCC00] ml-4 scale-[0.97] origin-left' : ''}`}
          >
            <div className="absolute top-4 right-4 flex items-center gap-3">
              <button onClick={(e) => handleFavoriteToggle(e, task.id)} className={`transition-colors flex items-center justify-center ${task.is_favorite ? 'text-[#FFCC00]' : 'text-fg-muted hover:text-[#FFCC00]'}`}>
                <span className={`material-symbols-outlined text-[18px] ${task.is_favorite ? 'filled' : ''}`} style={task.is_favorite ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
              </button>
              <input type="checkbox" className="accent-[#9D4EDD] rounded-sm w-4 h-4" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
              <button 
                onClick={() => handleEdit(task)}
                className="text-fg-muted hover:text-[#9D4EDD]"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className={`pr-16 flex items-start gap-2`}>
              {!task.parent_id && localTasks.some(t => t.parent_id === task.id) && (
                <button onClick={(e) => toggleExpand(e, task.id)} className="text-fg-muted hover:text-white transition-colors flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[20px]">{!collapsedTasks.has(task.id) ? 'expand_more' : 'chevron_right'}</span>
                </button>
              )}
              {(!task.parent_id || !localTasks.some(t => t.parent_id === task.id)) && (
                <span className={`material-symbols-outlined text-fg-muted text-[18px] mt-0.5 ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
              )}
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  <div className="flex items-center gap-2">
                    <HighlightedText text={task.nome} highlight={searchTerm} />
                    {(task as any).custom_fields?.foto_url && (
                      <a href={(task as any).custom_fields.foto_url} target="_blank" rel="noopener noreferrer" className="text-fg-muted hover:text-[#9D4EDD] flex items-center transition-colors" title="Ver foto">
                        <span className="material-symbols-outlined text-[16px]">image</span>
                      </a>
                    )}
                  </div>
                </h3>
                {task.descricao && (
                  <div className="mt-1 flex flex-col items-start w-full">
                    <p className={`text-[11px] text-fg-secondary transition-all ${(expandedTasks.includes(task.id) || advancedSettings?.auto_expand_descriptions) ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                      <HighlightedText text={task.descricao} highlight={searchTerm} />
                    </p>
                    {(!advancedSettings?.auto_expand_descriptions && (task.descricao.length > 100 || task.descricao.includes('\n'))) && (
                      <button 
                        onClick={(e) => toggleTaskExpansion(task.id, e)}
                        className="text-[#9D4EDD] text-[10px] font-bold mt-1 flex items-center hover:underline"
                      >
                        {expandedTasks.includes(task.id) ? (
                          <>Ver menos <span className="material-symbols-outlined text-[14px]">expand_less</span></>
                        ) : (
                          <>Ver mais <span className="material-symbols-outlined text-[14px]">expand_more</span></>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-1 pl-6 pr-2">
              <div className="flex justify-between items-center text-center mb-1 gap-1">
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-fg-muted font-semibold uppercase tracking-wider truncate">Status</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Estágio atual.")}><span className="material-symbols-outlined text-[6px] text-fg-muted">help</span></div>
</div>
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-fg-muted font-semibold uppercase tracking-wider truncate">Prio</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Nível de urgência.")}><span className="material-symbols-outlined text-[6px] text-fg-muted">help</span></div>
</div>
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-fg-muted font-semibold uppercase tracking-wider truncate">Categ</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Tipo de ação.")}><span className="material-symbols-outlined text-[6px] text-fg-muted">help</span></div>
</div>
                {visibleExtraCols.includes("responsavel") && <span className="text-[9px] text-fg-muted font-semibold uppercase tracking-wider flex-1 truncate">Resp</span>}
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-fg-muted font-semibold uppercase tracking-wider truncate">Dim</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Área da vida.")}><span className="material-symbols-outlined text-[6px] text-fg-muted">help</span></div>
</div>
              </div>
              <div className="flex justify-between items-center text-center gap-1">
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'status')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="status" value={task.status} customColor={getColColor('status', task.status)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'prioridade')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="prioridade" value={task.prioridade} customColor={getColColor('prioridade', task.prioridade)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'categoria')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="categoria" value={task.categoria} customColor={getColColor('categoria', task.categoria)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'responsavel')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="responsavel" value={task.responsavel} customColor={getColColor('responsavel', task.responsavel)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'dimensao')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="dimensao" value={task.dimensao} customColor={getColColor('dimensao', task.dimensao)} /></div></div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 border-t border-border-subtle pt-2 pb-1 text-[9px] text-fg-secondary pl-6 pr-2">
              <span className="truncate">Cria: {formatDate(task.created_at)}</span>
              <span className="truncate">Ini: {formatDate(task.inicio)}</span>
              <span className="truncate flex items-center gap-1">
                Fim: {formatDate(task.prazo)}
                {task.prazo && (
                  (() => {
                    if (task.status === 'completa') {
                      const days = getDaysUntil(task.prazo, task.concluida_em);
                      if (days === null) return <span className="text-[#9D4EDD] font-bold">Concluída</span>;
                      return <span className="text-[#9D4EDD] font-bold">Concluída ({days > 0 ? `+${days}d` : `${days}d`})</span>;
                    }
                    if (task.status === 'descartada') return <span className="text-fg-muted font-bold">-</span>;
                    const days = getDaysUntil(task.prazo);
                    if (days === null) return null;
                    if (days < 0) return <span className="text-[#db4437] font-bold">({-days}d)</span>;
                    if (days === 0) return <span className="text-[#db4437] font-bold">Hoje!</span>;
                    return <span className="text-[#FFCC00] font-bold">{days}d</span>;
                  })()
                )}
              </span>
              <span className="truncate">Concl: {formatDate(task.concluida_em)}</span>
            </div>
            {task.descricao && (
              <div className="mt-2 text-xs text-gray-300">
                <div className="font-semibold text-gray-500 mb-1">Descrição</div>
                <div className="whitespace-pre-wrap">{task.descricao}</div>
              </div>
            )}
          </div>
        ))}
        {localTasks.length === 0 && (
          <div className="p-4 bg-surface rounded-lg border border-border-subtle shadow-sm relative animate-pulse-slow">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  Bem-vindo! Tarefa de exemplo.
                  <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                    <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                    <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-left font-normal normal-case tracking-normal left-0">
                      O nome principal da sua tarefa.
                    </div>
                  </div>
                </h3>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between text-[10px] bg-surface-hover p-2 rounded text-fg">
                <span className="text-fg-muted font-bold uppercase tracking-wider">Status</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    O estágio atual da tarefa (Ex: Em progresso).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-surface-hover p-2 rounded text-fg">
                <span className="text-fg-muted font-bold uppercase tracking-wider">Dimensão</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    A grande área da sua vida (Pessoal, Saúde, etc).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-surface-hover p-2 rounded text-fg">
                <span className="text-fg-muted font-bold uppercase tracking-wider">Prioridade</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    Nível de urgência (Alta, Média, Baixa).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-surface-hover p-2 rounded text-fg">
                <span className="text-fg-muted font-bold uppercase tracking-wider">Categoria</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-fg-muted">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-app text-fg text-[11px] rounded border border-border-subtle shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    O tipo de ação (Ex: Programar, Estudar).
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center text-fg-muted text-xs">
              Nenhuma tarefa encontrada.<br/>Clique em <span className="text-[#FFCC00] font-bold">+ Nova Tarefa</span> para começar.
            </div>
          </div>
        )}
        {processedTasks.length === 0 && localTasks.length > 0 && (
          <div className="p-8 text-center text-fg-muted text-sm bg-surface rounded-lg border border-border-subtle">
            Nenhuma tarefa encontrada.
          </div>
        )}
      </div>
      </div>
      )}

      {viewMode !== 'list' && (
          <TaskCalendar 
            currentDate={calendarCurrentDate} 
            onDateChange={setCalendarCurrentDate} 
            format={viewMode === 'monthly' ? 'monthly' : 'weekly'}
            tasks={displayMode === 'eventos' ? [] : processedTasks} 
            events={displayMode === 'tarefas' ? [] : processedEvents}
            onTaskClick={(t) => { setTaskToEdit(t); setIsModalOpen(true); }}
            onEventClick={(e) => { setEventToEdit(e); setIsEventModalOpen(true); }}
          />
        )}
        
        {/* Events List */}
        {displayMode !== 'tarefas' && (
          <div className="mt-8 border border-border-subtle rounded-lg p-4 bg-surface/50">
            <h3 className="text-fg-muted uppercase font-bold text-xs mb-4">Próximos Eventos</h3>
            {processedEvents.length === 0 ? (
              <div className="text-sm text-fg-muted">Nenhum evento programado.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {processedEvents.map(evt => (
                  <div key={evt.id} onClick={() => { setEventToEdit(evt); setIsEventModalOpen(true); }} className="flex flex-col p-3 bg-surface border border-border-subtle hover:bg-surface-hover rounded hover:border-[#9D4EDD]/50 transition-colors cursor-pointer relative group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#26a69a] text-[16px]">event</span>
                        <span className="font-bold text-sm text-fg-secondary">{evt.nome}</span>
                      </div>
                      <button onClick={(e) => handleEventFavoriteToggle(e, evt)} className={`transition-colors flex items-center justify-center ${evt.is_favorite ? 'text-[#FFCC00]' : 'text-fg-muted hover:text-[#FFCC00] opacity-0 group-hover:opacity-100'}`}>
                        <span className={`material-symbols-outlined text-[18px] ${evt.is_favorite ? 'filled' : ''}`} style={evt.is_favorite ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
                      </button>
                    </div>
                    {(evt.data_inicio || evt.horarios_semanais) && (
                      <div className="text-xs text-fg-muted mt-1 pl-6">
                        {evt.frequencia === 'Semanal' && evt.horarios_semanais 
                          ? Object.entries(evt.horarios_semanais).map(([dia, h]: [string, any]) => `${dia} (${h.inicio} - ${h.fim})`).join(', ')
                          : evt.data_inicio ? new Date(evt.data_inicio).toLocaleDateString() : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button className="mt-4 px-4 py-2 bg-[#9D4EDD] text-white font-bold text-xs rounded-md hover:bg-[#8534C1] transition-colors shadow-sm" onClick={handleNewEvent}>
              + Novo Evento
            </button>
          </div>
        )}

      {/* Floating Action Buttons Container */}
      <div className={`fixed right-6 z-[999] flex flex-col items-center gap-4 ${isAurtistic ? 'bottom-40 md:bottom-24' : 'bottom-24 md:bottom-8'}`}>
        
        {/* Floating Bulk Edit Button */}
        {selectedTasks.size > 0 && (
          <button 
            onClick={() => setIsBulkEditModalOpen(true)}
            className="bg-[#9D4EDD] hover:bg-[#8A3BCE] text-[#FFFFFF] p-3 rounded-full shadow-[0_8px_32px_rgba(157,78,221,0.3)] transition-all duration-300 flex items-center justify-center group"
            title="Editar Selecionadas"
          >
            <span className="material-symbols-outlined font-bold">edit</span>
          </button>
        )}

        {/* Floating Scroll to Top Button */}
        {isAurtistic && (
          <button 
            onClick={scrollToTop}
            className="bg-surface hover:bg-surface-hover border border-[#FFCC00]/50 hover:border-[#9D4EDD] text-fg-muted hover:text-[#9D4EDD] p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center group"
            title="Ir para o topo"
          >
            <span className="material-symbols-outlined">arrow_upward</span>
          </button>
        )}

        {/* Floating Novo Evento Button */}
        {displayMode !== 'tarefas' && (
          <button 
            onClick={handleNewEvent}
            className="bg-[#9D4EDD] hover:bg-[#8338c7] text-[#FFFFFF] p-3 rounded-full shadow-[0_8px_32px_rgba(157,78,221,0.3)] transition-all duration-300 flex items-center justify-center group"
            title="Novo Evento"
          >
            <span className="material-symbols-outlined font-bold">event</span>
          </button>
        )}

        {/* Floating Nova Tarefa Button */}
        {displayMode !== 'eventos' && (
          <button 
            onClick={handleNew}
            className={`bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] p-3 rounded-full shadow-[0_8px_32px_rgba(255,204,0,0.3)] transition-all duration-300 flex items-center justify-center group ${localTasks.length === 0 ? 'animate-pulse ring-4 ring-[#FFCC00]/50' : ''}`}
            title="Nova Tarefa"
          >
            <span className="material-symbols-outlined font-bold">add</span>
          </button>
        )}

        {/* Floating Scroll to Bottom Button */}
        <button 
          onClick={scrollToBottom}
          className="bg-surface hover:bg-surface-hover border border-[#FFCC00]/50 hover:border-[#9D4EDD] text-fg-muted hover:text-[#9D4EDD] p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center group"
          title="Ir para o fundo (Mais Recentes)"
        >
          <span className="material-symbols-outlined">arrow_downward</span>
        </button>
      </div>

      {/* Modals */}
      <TaskFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        task={taskToEdit} 
        defaultValues={defaultTaskValues}
        uniqueCategories={uniqueCategories} 
        uniqueDimensions={uniqueDimensions}
        columns={columns}
        onEditColumn={(col) => setEditingColumn(col)}
        advancedSettings={advancedSettings}
        activeScope={activeScope}
        activeOrgId={activeOrgId}
        organizations={organizations}
        subteams={activeOrgDetails?.subteams || []}
        members={activeOrgDetails?.members || []}
        userFiles={userFiles}
        onFilesUpdated={() => {}}
      />
      <BulkEditModal 
        isOpen={isBulkEditModalOpen} 
        onClose={() => setIsBulkEditModalOpen(false)} 
        taskIds={Array.from(selectedTasks)} 
        tasks={localTasks} 
        onSuccess={() => { setIsBulkEditModalOpen(false); setSelectedTasks(new Set()); setLastSelectedTaskId(null); }} 
        uniqueCategories={uniqueCategories} 
        uniqueDimensions={uniqueDimensions}
        columns={columns}
        onEditColumn={(col) => setEditingColumn(col)}
      />

      <EventFormModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        event={eventToEdit}
        defaultValues={defaultTaskValues}
        uniqueDimensions={uniqueDimensions}
        isLabdivScope={!isPersonalScope}
        columns={columns}
        onEditColumn={(col) => setEditingColumn(col)}
        onSuccess={() => {
          setIsEventModalOpen(false);
          // O NextJS revalidatePath atualizará a página para mostrar o novo evento
          window.location.reload(); 
        }}
      />

      <ImportICSModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          setIsImportModalOpen(false);
          window.location.reload();
        }}
      />
      
      {editingColumn && (
        <OptionsEditorModal
          column={editingColumn!}
          onClose={() => setEditingColumn(null)}
          onSave={async (updatedColumn) => {
            await saveTaskColumn(updatedColumn);
            setColumns(prev => prev.map(c => c.id === updatedColumn.id ? updatedColumn : c));
          }}
        />
      )}

      
      {/* Active Tooltip Dropdown */}
      {activeTooltip && (
        <div
          className="fixed z-[100] w-32 p-2 bg-app text-fg text-[10px] rounded border border-border-subtle shadow-xl text-center font-normal normal-case tracking-normal"
          style={{ top: activeTooltip.top, bottom: activeTooltip.bottom, left: activeTooltip.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeTooltip.text}
        </div>
      )}

      {/* Quick Edit Dropdown */}
      {quickEdit && (
        <div 
          className="fixed z-[100] bg-surface border border-border-subtle rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden min-w-[140px]"
          style={{ top: quickEdit.top, bottom: quickEdit.bottom, left: quickEdit.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-[250px] overflow-y-auto flex flex-col py-1">
            {(() => {
              const col = columns.find(c => c.key === quickEdit.field);
              let opts = (col?.options || []).map((o: any) => o.value || o);
              
              // Se for categoria ou dimensão, mescla com os valores únicos existentes nas tarefas para não perder nada
              if (quickEdit.field === 'categoria') opts = Array.from(new Set([...opts, ...uniqueCategories]));
              if (quickEdit.field === 'dimensao') opts = Array.from(new Set([...opts, ...uniqueDimensions.filter(d => d !== 'favoritas')]));
              
              const displayOpts = Array.from(new Set([...opts, ""])); // Sempre permite limpar (Nenhum)

              return displayOpts.map(option => {
                const optStr = String(option);
                return (
                  <button 
                    key={optStr} 
                    className={`text-left px-3 py-2 text-xs hover:bg-surface-hover transition-colors ${quickEdit.value?.toLowerCase() === optStr.toLowerCase() ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-fg-secondary'}`} 
                    onClick={() => handleQuickSave(quickEdit.taskId, quickEdit.field, optStr)}
                  >
                    {optStr === "" ? "Nenhum" : (quickEdit.field === 'status' ? optStr.charAt(0).toUpperCase() + optStr.slice(1) : optStr)}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}
      {/* Modal Quick Filters */}
      {isQuickFiltersModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border-subtle rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-app">
              <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent-secondary)]">settings</span>
                Filtros Rápidos
              </h2>
              <button 
                onClick={() => setIsQuickFiltersModalOpen(false)}
                className="text-fg-muted hover:text-fg transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex w-full border-b border-border-subtle bg-surface">
               <button className={`flex-1 py-3 text-sm font-bold transition-colors cursor-pointer ${quickFiltersTab === 'visibilidade' ? 'text-[var(--accent-secondary)] border-b-2 border-[var(--accent-secondary)]' : 'text-fg-muted hover:text-fg'}`} onClick={() => setQuickFiltersTab('visibilidade')}>Visibilidade</button>
               <button className={`flex-1 py-3 text-sm font-bold transition-colors cursor-pointer ${quickFiltersTab === 'ordem' ? 'text-[var(--accent-secondary)] border-b-2 border-[var(--accent-secondary)]' : 'text-fg-muted hover:text-fg'}`} onClick={() => setQuickFiltersTab('ordem')}>Ordem</button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              
              {quickFiltersTab === 'visibilidade' ? (
                <>
                  <p className="text-xs text-fg-secondary mb-2">Selecione quais colunas você quer que apareçam como botões para filtrar as tarefas.</p>
                  
                  {['status', 'categoria', 'responsavel', 'dimensao'].map(key => {
                    if (isPersonalScope && key === 'responsavel') return null;
                    const isSelected = quickFilters.includes(key);
                    const labels: Record<string, string> = {
                      'status': 'Status',
                      'categoria': 'Categoria',
                      'responsavel': 'Responsável',
                      'dimensao': 'Dimensão'
                    };
                    return (
                      <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-surface-hover rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newFilters = [...quickFilters];
                            if (e.target.checked) newFilters.push(key);
                            else newFilters = newFilters.filter(k => k !== key);
                            setQuickFilters(newFilters);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-fg-muted group-hover:text-fg-secondary'}`}>{labels[key]}</span>
                      </label>
                    );
                  })}

                  {columns.length > 0 && <hr className="border-border-subtle my-2" />}

                  {columns.map(col => {
                    if (col.type !== 'select') return null;
                    const staticKeys = ['status', 'categoria', 'responsavel', 'dimensao', 'prioridade', 'prazo', 'manual'];
                    if (staticKeys.includes(col.key)) return null;
                    const isSelected = quickFilters.includes(col.key);
                    return (
                      <label key={col.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-surface-hover rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newFilters = [...quickFilters];
                            if (e.target.checked) newFilters.push(col.key);
                            else newFilters = newFilters.filter(k => k !== col.key);
                            setQuickFilters(newFilters);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-fg-muted group-hover:text-fg-secondary'}`}>{col.name}</span>
                      </label>
                    );
                  })}
                </>
              ) : (
                <>
                  <p className="text-xs text-fg-secondary mb-2">Selecione quais colunas podem ser usadas para ordenar a visualização das tarefas (Linha ORDEM).</p>
                  
                  {['status', 'prazo', 'prioridade', 'categoria', 'manual'].map(key => {
                    const isSelected = quickSorts.includes(key);
                    const labels: Record<string, string> = {
                      'status': 'Status (Padrão)',
                      'prazo': 'Prazo',
                      'prioridade': 'Prioridade',
                      'categoria': 'Categoria',
                      'manual': 'Manual (Arrastar)'
                    };
                    return (
                      <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-surface-hover rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newSorts = [...quickSorts];
                            if (e.target.checked) newSorts.push(key);
                            else newSorts = newSorts.filter(k => k !== key);
                            setQuickSorts(newSorts);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-fg-muted group-hover:text-fg-secondary'}`}>{labels[key]}</span>
                      </label>
                    );
                  })}

                  {columns.length > 0 && <hr className="border-border-subtle my-2" />}

                  {columns.map(col => {
                    const staticKeys = ['status', 'categoria', 'responsavel', 'dimensao', 'prioridade', 'prazo', 'manual'];
                    if (staticKeys.includes(col.key)) return null;
                    const isSelected = quickSorts.includes(col.key);
                    return (
                      <label key={col.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-surface-hover rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newSorts = [...quickSorts];
                            if (e.target.checked) newSorts.push(col.key);
                            else newSorts = newSorts.filter(k => k !== col.key);
                            setQuickSorts(newSorts);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-fg-muted group-hover:text-fg-secondary'}`}>{col.name}</span>
                      </label>
                    );
                  })}
                </>
              )}

            </div>

            <div className="p-4 border-t border-border-subtle bg-app flex justify-end">
              <button
                onClick={async () => {
                  try {
                    const { saveQuickPreferences } = await import('@/app/(dashboard)/actions');
                    await saveQuickPreferences(quickFilters, quickSorts);
                    setIsQuickFiltersModalOpen(false);
                  } catch(e: any) {
                    alert('Erro ao salvar preferências: ' + e.message);
                  }
                }}
                className="bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold py-2 px-6 rounded-md transition-colors text-sm"
              >
                Salvar Preferências
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Módulo de Gestão da Organização (quando viewMode === 'org_management') */}
      {viewMode === 'org_management' && activeScope === 'organization' && (
        <div className="w-full mt-4">
          <OrganizationManagementView
            organization={activeOrgDetails?.organization || activeOrgDetails || activeOrg}
            subteams={activeOrgDetails?.subteams || []}
            members={activeOrgDetails?.members || []}
            tasks={processedTasks}
            meetings={orgMeetings}
            currentUserId={userId || ''}
            userEvents={processedEvents}
            onMeetingsUpdated={async () => {
              if (activeOrgId) {
                const res = await getOrganizationMeetingsAction(activeOrgId);
                if (res.ok && res.meetings) {
                  setOrgMeetings(res.meetings);
                }
              }
            }}
          />
        </div>
      )}

      {/* Modais de Gestão e Criação de Organizações */}
      <JoinOrganizationModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onJoinedSuccess={async (orgId) => {
          setIsJoinModalOpen(false);
          setActiveOrgId(orgId);
          setActiveScope('organization');
          const res = await getUserOrganizationsAction();
          if (res.ok && res.organizations) {
            setOrganizations(res.organizations);
          }
        }}
      />

      <CreateOrganizationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreatedSuccess={async (orgId) => {
          setIsCreateModalOpen(false);
          setActiveOrgId(orgId);
          setActiveScope('organization');
          const res = await getUserOrganizationsAction();
          if (res.ok && res.organizations) {
            setOrganizations(res.organizations);
          }
        }}
      />

      {/* Modal de Anexo de Arquivos nas Tarefas */}
      {filePickerTaskId && (
        <TaskFilePickerModal
          isOpen={Boolean(filePickerTaskId)}
          onClose={() => setFilePickerTaskId(null)}
          taskId={filePickerTaskId}
          taskTitle={localTasks.find(t => t.id === filePickerTaskId)?.nome || 'Tarefa'}
          currentlyLinkedPaths={(localTasks.find(t => t.id === filePickerTaskId) as any)?.arquivos_vinculados || []}
          ticket=""
          onLinkedUpdated={() => {
            setFilePickerTaskId(null);
          }}
        />
      )}
    </div>
  );
}
