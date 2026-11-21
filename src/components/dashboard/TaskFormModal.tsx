// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useEffect, useRef } from 'react';
import { Task, TaskColumn, UserFileIndexRow } from '@/types';
import { saveTask, deleteTask, saveTaskWithSubtasks } from '@/lib/offlineActions';
import { getOrganizationDetailsAction } from '@/app/(dashboard)/organizacoes/actions';
import { Badge, getBadgeColorClass } from './Badge';
import { CustomSelect } from './CustomSelect';
import { createClient } from '@/utils/supabase/client';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import { OrganizationMaterialSelector } from '@/components/organizacoes/OrganizationMaterialSelector';
import { updateFileEcosystemLinksAction } from '@/app/(dashboard)/servidor/actions';
import { formatStorageBytes } from '@/lib/edge-urls';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: (Task & { subtasks?: Task[] }) | null;
  defaultValues?: Partial<Task>;
  uniqueCategories?: string[];
  uniqueDimensions?: string[];
  columns?: TaskColumn[];
  onEditColumn?: (col: TaskColumn) => void;
  advancedSettings?: any;
  userFiles?: UserFileIndexRow[];
  onFilesUpdated?: () => void;
  activeScope?: 'all' | 'individual' | 'organization';
  activeOrgId?: string | null;
  organizations?: any[];
  subteams?: any[];
  members?: any[];
}

export function TaskFormModal({
  isOpen,
  onClose,
  task,
  defaultValues,
  uniqueCategories,
  uniqueDimensions,
  columns = [],
  onEditColumn,
  advancedSettings = {},
  userFiles = [],
  onFilesUpdated,
  activeScope = 'individual',
  activeOrgId = null,
  organizations = [],
  subteams: subteamsProp = [],
  members: membersProp = [],
}: TaskFormModalProps) {
  const { openNoteInPlace, openPhotoInPlace, playAudioInPlace, activeTicket, vaultTicket } = useAurtisticMedia();
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [unlinkingFile, setUnlinkingFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [freqType, setFreqType] = useState('');
  const [freqDetail, setFreqDetail] = useState('');

  // Local state for subtasks (both existing and newly added in this session)
  const [localSubtasks, setLocalSubtasks] = useState<Partial<Task>[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formData, setFormData] = useState<Partial<Task>>(() => ({
    id: crypto.randomUUID(),
    nome: '',
    status: 'não iniciada',
    prioridade: 'Baixa',
    categoria: 'Programar',
    responsavel: 'João',
    dimensao: 'HUB',
    inicio: '',
    prazo: '',
    descricao: '',
    frequencia: ''
  }));

  useEffect(() => {
    if (task) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        id: task.id,
        nome: task.nome,
        status: task.status,
        prioridade: task.prioridade || '',
        categoria: task.categoria || '',
        responsavel: task.responsavel || '',
        dimensao: task.dimensao || '',
        inicio: task.inicio ? task.inicio.split('T')[0] : '',
        prazo: task.prazo && !isNaN(new Date(task.prazo).getTime()) ? new Date(new Date(task.prazo).getTime() - (new Date(task.prazo).getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '',
        descricao: task.descricao || '',
        frequencia: task.frequencia || '',
        is_personal: task.is_personal !== undefined ? task.is_personal : (task.organization_id ? false : true),
        organization_id: task.organization_id || null,
        subteam_id: task.subteam_id || null,
        assigned_subteam_ids: task.assigned_subteam_ids?.length
          ? task.assigned_subteam_ids
          : (task.subteam_id ? [task.subteam_id] : []),
        assigned_member_ids: task.assigned_member_ids || [],
        custom_fields: task.custom_fields || {},
      });

      let fType = '';
      let fDetail = '';
      if (task.frequencia) {
        if (task.frequencia.startsWith('Semanal')) {
          fType = 'Semanal';
          fDetail = task.frequencia.split(' - ')[1] || 'Segunda';
        } else if (task.frequencia.startsWith('Mensal')) {
          fType = 'Mensal';
          fDetail = task.frequencia.split(' - ')[1]?.replace('Dia ', '') || '1';
        } else {
          fType = task.frequencia;
        }
      }
      setFreqType(fType);
      setFreqDetail(fDetail);
      setLocalSubtasks(task.subtasks || []);
      setSelectedDimensions(task.dimensao ? [task.dimensao] : ['HUB']);
      setSelectedFile(null);
    } else {
      const newId = crypto.randomUUID();
      const initialDimensao = defaultValues?.dimensao || 'HUB';
      const isOrgScope = activeScope === 'organization' || (activeScope === 'all' && Boolean(activeOrgId));
      const autoOrgId = defaultValues?.organization_id || (isOrgScope ? activeOrgId : null);
      const isPersonal = defaultValues?.is_personal !== undefined
        ? defaultValues.is_personal
        : (activeScope === 'organization' ? false : (autoOrgId ? false : true));

      setFormData({
        id: newId,
        nome: defaultValues?.nome || '',
        status: defaultValues?.status || 'não iniciada',
        prioridade: defaultValues?.prioridade || 'Baixa',
        categoria: defaultValues?.categoria || 'Programar',
        responsavel: defaultValues?.responsavel || 'João',
        dimensao: initialDimensao,
        inicio: defaultValues?.inicio || '',
        prazo: defaultValues?.prazo || '',
        descricao: defaultValues?.descricao || '',
        frequencia: defaultValues?.frequencia || '',
        is_personal: isPersonal,
        organization_id: autoOrgId,
        subteam_id: defaultValues?.subteam_id || null,
        assigned_subteam_ids: defaultValues?.assigned_subteam_ids?.length
          ? defaultValues.assigned_subteam_ids
          : (defaultValues?.subteam_id ? [defaultValues.subteam_id] : []),
        assigned_member_ids: defaultValues?.assigned_member_ids || [],
        custom_fields: defaultValues?.custom_fields || {},
      });
      setFreqType('');
      setFreqDetail('');
      setLocalSubtasks([]);
      setSelectedDimensions([initialDimensao]);
      setSelectedFile(null);
    }
  }, [task, isOpen, activeScope, activeOrgId, defaultValues]);

  // Recarrega equipes e membros sempre que a organização do formulário mudar
  const [loadedOrg, setLoadedOrg] = useState<{ id: string; subteams: any[]; members: any[] } | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [filterMembersBySubteams, setFilterMembersBySubteams] = useState(true);
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);

  const formOrgId = formData.organization_id || null;
  const formIsPersonal = Boolean(formData.is_personal);
  const propsCoverOrg = Boolean(formOrgId) && formOrgId === activeOrgId && (subteamsProp.length + membersProp.length) > 0;
  const loadedOrgId = loadedOrg?.id;

  useEffect(() => {
    if (!isOpen || !formOrgId || formIsPersonal || propsCoverOrg || loadedOrgId === formOrgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrgLoading(true);
    getOrganizationDetailsAction(formOrgId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && 'subteams' in res) {
          setLoadedOrg({ id: formOrgId, subteams: res.subteams || [], members: res.members || [] });
        }
      })
      .catch(() => { /* mantém listas vazias */ })
      .finally(() => { if (!cancelled) setOrgLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, formOrgId, formIsPersonal, propsCoverOrg, loadedOrgId]);

  const subteams: any[] = propsCoverOrg
    ? subteamsProp
    : (loadedOrg && loadedOrg.id === formOrgId ? loadedOrg.subteams : []);
  const members: any[] = propsCoverOrg
    ? membersProp
    : (loadedOrg && loadedOrg.id === formOrgId ? loadedOrg.members : []);

  // Estados dos 3 Accordions Material Design 3 (Frente 2.7.7: Modal em 2 Níveis)
  const [isDelegationOpen, setIsDelegationOpen] = useState(() => {
    if (!task) return false;
    return !task.is_personal && ((task.assigned_subteam_ids?.length || 0) > 0 || (task.assigned_member_ids?.length || 0) > 0);
  });
  const [isSubtasksOpen, setIsSubtasksOpen] = useState(() => (task?.subtasks?.length || 0) > 0);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(() => Boolean(task?.frequencia || (task?.custom_fields && Object.keys(task.custom_fields).length > 0)));
  const isSubmittingRef = useRef(false);

  // ⚠️ Early return DEVE vir DEPOIS de todos os hooks (Rules of Hooks)
  if (!isOpen) return null;

  const selectedSubteamIds = formData.assigned_subteam_ids || [];
  const visibleMembers = (filterMembersBySubteams && selectedSubteamIds.length > 0)
    ? members.filter(m => selectedSubteamIds.includes(m.subteam_id) || (formData.assigned_member_ids || []).includes(m.id))
    : members;

  const toggleInList = (list: string[] | undefined, id: string) => {
    const current = list || [];
    return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  };

  const updateSubtask = (id: string, patch: Partial<Task>) => {
    setLocalSubtasks(prev => prev.map(st => (st.id === id ? { ...st, ...patch } : st)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;
    if (!formData.is_personal && formData.organization_id
      && (formData.assigned_subteam_ids?.length || 0) === 0
      && (formData.assigned_member_ids?.length || 0) === 0) {
      setIsDelegationOpen(true);
      alert('Selecione ao menos uma equipe ou um indivíduo responsável pela tarefa da organização.');
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      let photoUrl = formData.custom_fields?.foto_url || null;

      if (selectedFile) {
        setUploadingImage(true);
        const supabase = createClient();
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('task_images')
          .upload(filePath, selectedFile);

        if (uploadError) {
          throw new Error('Erro ao fazer upload da imagem: ' + uploadError.message);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('task_images')
          .getPublicUrl(filePath);

        photoUrl = publicUrl;
        setUploadingImage(false);
      }

      const baseCustomFields = { ...(formData.custom_fields || {}) };
      if (photoUrl) {
        baseCustomFields.foto_url = photoUrl;
      }

      const rawDims = selectedDimensions.length > 0 ? selectedDimensions : [formData.dimensao || 'HUB'];
      const dimsToSave = Array.from(new Set(rawDims));

      for (let i = 0; i < dimsToSave.length; i++) {
        const currentDim = dimsToSave[i];

        // Se for a primeira dimensão, usa o ID já gerado/existente de formData (idempotente contra duplo envio)
        // Caso contrário (cópia para outra dimensão), gera novo ID.
        const isFirst = i === 0;
        const taskId = (isFirst && formData.id) ? formData.id : crypto.randomUUID();

        const taskDataToSave = {
          ...formData,
          id: taskId,
          dimensao: currentDim,
          custom_fields: Object.keys(baseCustomFields).length > 0 ? baseCustomFields : undefined
        };

        const selectedSubs = taskDataToSave.assigned_subteam_ids || [];
        const parentPayload: Partial<Task> = {
          ...taskDataToSave,
          assigned_subteam_ids: selectedSubs,
          subteam_id: selectedSubs[0] ?? null,
        };

        const subtasksForDim: Partial<Task>[] = localSubtasks.map((st) => {
          const delegated = (st.assigned_subteam_ids?.length || 0) > 0 || (st.assigned_member_ids?.length || 0) > 0;
          const memberNames = members
            .filter(m => (st.assigned_member_ids || []).includes(m.id))
            .map(m => m.full_name)
            .join(', ');
          return {
            ...st,
            // Cópias para outras dimensões recebem novos IDs
            id: isFirst ? st.id : undefined,
            parent_id: taskId,
            status: st.status || taskDataToSave.status || 'não iniciada',
            responsavel: delegated ? (memberNames || null) : (st.responsavel ?? taskDataToSave.responsavel ?? null),
          };
        });

        await saveTaskWithSubtasks(parentPayload, subtasksForDim);
      }

      onClose();
    } catch (err) {
      alert('Erro ao salvar tarefa: ' + String(err));
      setUploadingImage(false);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const { parseTasksFromCSV } = await import('@/utils/csv');
      const tasks = await parseTasksFromCSV(file);
      if (tasks.length === 0) {
        alert("O arquivo CSV está vazio ou inválido.");
        setLoading(false);
        return;
      }

      const { saveTask } = await import('@/lib/offlineActions');
      for (const t of tasks) {
        await saveTask({ ...t, user_id: formData.user_id });
      }

      alert(`${tasks.length} tarefas importadas com sucesso!`);
      onClose(); // Fechar o modal após importar

      // We might need to refresh the page, but saving tasks via actions revalidates paths
    } catch (err) {
      alert("Erro ao importar CSV: " + String(err));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
    e.target.value = '';
  };

  const handleDelete = async () => {
    if (!task || !task.id) return;
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    setLoading(true);
    try {
      await deleteTask(task.id);
      onClose();
    } catch (err) {
      alert('Erro ao deletar: ' + String(err));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!newSubtaskTitle.trim()) return;
      const inheritAttrs = advancedSettings?.inherit_parent_attributes !== false;

      const newSubtask: Partial<Task> = {
        id: crypto.randomUUID(),
        nome: newSubtaskTitle.trim(),
        status: 'não iniciada',
        parent_id: formData.id,
        ...(inheritAttrs ? {
          categoria: formData.categoria,
          dimensao: formData.dimensao,
          responsavel: formData.responsavel,
          prazo: formData.prazo,
          prioridade: formData.prioridade
        } : {}),
        subteam_id: null,
        assigned_subteam_ids: [],
        assigned_member_ids: [],
      };

      const updatedSubtasks = [...localSubtasks, newSubtask];
      setLocalSubtasks(updatedSubtasks);
      setNewSubtaskTitle('');
    }
  };

  const toggleSubtask = (id: string) => {
    const completionStatuses = (advancedSettings?.completion_statuses || ['completa', 'concluída', 'descartada']).map((s: string) => s.toLowerCase());
    const primaryCompletion = completionStatuses[0] || 'completa';
    const autoCompleteParent = advancedSettings?.auto_complete_parent !== false;

    const nextSubtasks = localSubtasks.map(st => {
      if (st.id === id) {
        const isCompleted = completionStatuses.includes((st.status || '').toLowerCase());
        return { ...st, status: isCompleted ? 'não iniciada' : primaryCompletion };
      }
      return st;
    });

    setLocalSubtasks(nextSubtasks);

    // Se auto_complete_parent estiver ativado e todas as subtarefas estiverem concluídas
    if (autoCompleteParent && nextSubtasks.length > 0) {
      const allCompleted = nextSubtasks.every(st => completionStatuses.includes((st.status || '').toLowerCase()));
      if (allCompleted) {
        setFormData(prev => ({ ...prev, status: primaryCompletion }));
      }
    }
  };

  const deleteSubtask = (id: string) => {
    // Remoção apenas local: a subtarefa órfã é apagada do banco ao salvar (saveTaskWithSubtasks)
    if (confirm('Remover subtarefa? (será excluída ao salvar a tarefa)')) {
      setLocalSubtasks(prev => prev.filter(st => st.id !== id));
      if (expandedSubtaskId === id) setExpandedSubtaskId(null);
    }
  };

  // Helper to get options for a column key
  const getColumnOptions = (key: string, defaultOptions: any[] = []) => {
    const col = columns.find(c => c.key === key);
    if (!col) return defaultOptions;
    return col.options.map(o => ({ label: o.label, value: o.value, color: o.color }));
  };

  const statusOptions = getColumnOptions('status', [
    { label: 'Não iniciada', value: 'não iniciada' },
    { label: 'Em progresso', value: 'em progresso' },
    { label: 'Falta testar', value: 'falta testar' },
    { label: 'Completa', value: 'completa' },
    { label: 'Descartada', value: 'descartada' }
  ]);

  const prioridadeOptions = getColumnOptions('prioridade', [
    { label: 'Nenhuma', value: '' },
    { label: 'Baixa', value: 'Baixa' },
    { label: 'Média', value: 'Média' },
    { label: 'Alta', value: 'Alta' }
  ]);

  const responsavelOptions = getColumnOptions('responsavel', [
    { label: 'Nenhum', value: '' },
    { label: 'João', value: 'João' },
    { label: 'Andy', value: 'Andy' },
    { label: 'Leo', value: 'Leo' },
    { label: 'Dani', value: 'Dani' },
    { label: 'Lorenzo', value: 'Lorenzo' },
    { label: 'Nacky', value: 'Nacky' }
  ]);

  const baseCategoriaOptions = getColumnOptions('categoria', []);
  const extraCategoriaOptions = (uniqueCategories || [])
    .filter(c => c && !baseCategoriaOptions.some(o => o.value === c))
    .map(c => ({ label: c, value: c }));
  const categoriaOptions = baseCategoriaOptions.length > 0
    ? [...baseCategoriaOptions, ...extraCategoriaOptions]
    : (extraCategoriaOptions.length > 0 ? [{ label: 'Nenhuma', value: '' }, ...extraCategoriaOptions] : []);

  const baseDimensaoOptions = getColumnOptions('dimensao', []);
  const extraDimensaoOptions = (uniqueDimensions || [])
    .filter(d => d && d !== 'favoritas' && !baseDimensaoOptions.some(o => o.value === d))
    .map(d => ({ label: d, value: d }));
  const dimensaoOptions = baseDimensaoOptions.length > 0
    ? [...baseDimensaoOptions, ...extraDimensaoOptions]
    : (extraDimensaoOptions.length > 0 ? [{ label: 'Nenhuma', value: '' }, ...extraDimensaoOptions] : []);

  const handleEditCol = (key: string) => {
    if (!onEditColumn) return;
    const col = columns.find(c => c.key === key);
    if (col) onEditColumn(col);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 pb-24 sm:pb-4">
      <div className="bg-surface border border-border-subtle rounded-3xl shadow-xl w-full max-w-3xl max-h-[75vh] sm:max-h-[90vh] flex flex-col">

        <div className="flex justify-between items-center p-6 border-b border-border-subtle">
          <h2 className="text-xl font-bold text-[#FFCC00]">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* SEÇÃO PRINCIPAL (SEMPRE VISÍVEL NO TOPO) */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                Nome da Tarefa *
              </label>
              <input
                required
                name="nome"
                value={formData.nome || ''}
                onChange={handleChange}
                placeholder="Ex: Desenvolver nova landing page institucional"
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFCC00] transition-colors"
              />
            </div>

            {/* Escopo & Organização */}
            {organizations && organizations.length > 0 && (
              <div className="p-3 bg-app border border-border-subtle rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted uppercase tracking-wider font-bold">
                    Escopo:
                  </span>
                  <div className="inline-flex p-1 bg-surface border border-border-subtle rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          is_personal: true,
                          organization_id: null,
                          subteam_id: null,
                          assigned_subteam_ids: [],
                          assigned_member_ids: [],
                        }))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${formData.is_personal
                          ? 'bg-[#FFCC00] text-[#121212] shadow-sm font-black'
                          : 'text-fg-secondary hover:text-fg'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetOrgId = formData.organization_id || activeOrgId || organizations[0].id;
                        setFormData((prev) => ({
                          ...prev,
                          is_personal: false,
                          organization_id: targetOrgId,
                        }));
                        if ((formData.assigned_subteam_ids?.length || 0) === 0 && (formData.assigned_member_ids?.length || 0) === 0) {
                          setIsDelegationOpen(true);
                        }
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${!formData.is_personal
                          ? 'bg-teal-500 text-slate-950 font-black shadow-sm'
                          : 'text-fg-secondary hover:text-fg'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">domain</span>
                      Organização
                    </button>
                  </div>
                </div>

                {!formData.is_personal && organizations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-fg-muted uppercase tracking-wider font-bold hidden sm:inline">
                      Organização:
                    </span>
                    <OrganizationMaterialSelector
                      organizations={organizations}
                      selectedOrgId={formData.organization_id || null}
                      onSelectOrg={(id) => {
                        if (id) {
                          setFormData((prev) => ({
                            ...prev,
                            organization_id: id,
                            subteam_id: null,
                            assigned_subteam_ids: [],
                            assigned_member_ids: [],
                          }));
                          setIsDelegationOpen(true);
                        }
                      }}
                      compact={true}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Linha Compacta M3: Status, Prioridade e Prazo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-fg-muted uppercase tracking-wider mb-1 font-bold">
                  Status
                </label>
                <CustomSelect
                  name="status"
                  value={formData.status || 'não iniciada'}
                  options={statusOptions}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  type="status"
                  onEditColumn={columns.find((c) => c.key === 'status') ? () => handleEditCol('status') : undefined}
                />
              </div>

              <div>
                <label className="block text-[11px] text-fg-muted uppercase tracking-wider mb-1 font-bold">
                  Prioridade
                </label>
                <CustomSelect
                  name="prioridade"
                  value={formData.prioridade || ''}
                  onChange={handleChange}
                  type="prioridade"
                  options={prioridadeOptions}
                  allowCustom={true}
                  onEditColumn={columns.find((c) => c.key === 'prioridade') ? () => handleEditCol('prioridade') : undefined}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] text-fg-muted uppercase tracking-wider font-bold">
                    Prazo
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(12, 0, 0, 0);
                        setFormData((prev) => ({
                          ...prev,
                          prazo: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
                        }));
                      }}
                      className="text-[9px] bg-surface-hover hover:bg-[#FFCC00] text-fg hover:text-black px-1.5 py-0.5 rounded transition-colors"
                    >
                      Amanhã
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        d.setHours(12, 0, 0, 0);
                        setFormData((prev) => ({
                          ...prev,
                          prazo: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
                        }));
                      }}
                      className="text-[9px] bg-surface-hover hover:bg-[#FFCC00] text-fg hover:text-black px-1.5 py-0.5 rounded transition-colors"
                    >
                      +7d
                    </button>
                  </div>
                </div>
                <input
                  type="datetime-local"
                  name="prazo"
                  value={formData.prazo || ''}
                  onChange={handleChange}
                  className="w-full bg-app border border-border-subtle rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* ACCORDION 1: DELEGAÇÃO (EQUIPES & INDIVÍDUOS) - Visível no modo Organização */}
          {!formData.is_personal && (
            <div
              className={`border rounded-2xl overflow-hidden transition-all ${isDelegationOpen
                  ? 'border-teal-500/50 bg-surface shadow-md'
                  : 'border-border-subtle bg-app hover:border-teal-500/30'
                }`}
            >
              <button
                type="button"
                onClick={() => setIsDelegationOpen((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[18px] text-teal-400">group</span>
                  <span className="text-xs font-black uppercase tracking-wider text-fg">
                    1. Delegação (Equipes &amp; Indivíduos)
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedSubteamIds.length > 0 || (formData.assigned_member_ids?.length || 0) > 0
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                  >
                    {selectedSubteamIds.length === 0 && (formData.assigned_member_ids?.length || 0) === 0
                      ? '⚠️ Obrigatório selecionar equipe/membro'
                      : `${selectedSubteamIds.length} equipe(s) • ${formData.assigned_member_ids?.length || 0} membro(s)`}
                  </span>
                </div>
                <span
                  className={`material-symbols-outlined text-[18px] text-fg-muted transition-transform duration-200 ${isDelegationOpen ? 'rotate-180' : ''
                    }`}
                >
                  expand_more
                </span>
              </button>

              {isDelegationOpen && (
                <div className="p-4 border-t border-border-subtle space-y-3.5 bg-black/20">
                  {orgLoading && (
                    <div className="text-[11px] text-teal-300">Carregando equipes e membros da organização...</div>
                  )}

                  {/* Equipes */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] text-fg-muted uppercase tracking-wider font-bold">
                        Equipes responsáveis
                      </label>
                      <span className="text-[10px] text-teal-300">
                        {selectedSubteamIds.length === 0 ? 'Nenhuma equipe' : `${selectedSubteamIds.length} selecionada(s)`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-surface border border-border-subtle rounded-xl max-h-28 overflow-y-auto">
                      {subteams.length === 0 ? (
                        <span className="text-xs text-fg-muted p-1">Nenhuma equipe cadastrada nesta organização.</span>
                      ) : (
                        subteams.map((sub) => {
                          const active = selectedSubteamIds.includes(sub.id);
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() =>
                                setFormData((prev) => {
                                  const next = toggleInList(prev.assigned_subteam_ids, sub.id);
                                  return { ...prev, assigned_subteam_ids: next, subteam_id: next[0] ?? null };
                                })
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${active
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm'
                                  : 'bg-surface border-border-subtle text-fg-secondary hover:text-white'
                                }`}
                            >
                              👥 {sub.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Indivíduos */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <label className="block text-[11px] text-fg-muted uppercase tracking-wider font-bold">
                        Indivíduos responsáveis
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-fg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterMembersBySubteams}
                          onChange={(e) => setFilterMembersBySubteams(e.target.checked)}
                          className="w-3 h-3"
                        />
                        Filtrar pelas equipes selecionadas
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-surface border border-border-subtle rounded-xl max-h-32 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, assigned_member_ids: [], responsavel: null }))}
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${!formData.assigned_member_ids || formData.assigned_member_ids.length === 0
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm'
                            : 'bg-surface border-border-subtle text-fg-muted hover:text-white'
                          }`}
                      >
                        Sem indivíduo específico
                      </button>
                      {visibleMembers.map((m) => {
                        const isAssigned = (formData.assigned_member_ids || []).includes(m.id);
                        const capIcon =
                          m.cognitive_capacity === 'normal' ? '🟢' : m.cognitive_capacity === 'reduced' ? '🟡' : '🔴';
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => {
                                const next = toggleInList(prev.assigned_member_ids, m.id);
                                const firstMember = members.find((mem) => next.includes(mem.id));
                                return {
                                  ...prev,
                                  assigned_member_ids: next,
                                  responsavel: firstMember ? firstMember.full_name : prev.responsavel,
                                };
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${isAssigned
                                ? 'bg-teal-500/20 border-teal-500 text-teal-200 font-bold shadow-sm'
                                : 'bg-surface border-border-subtle text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface-hover'
                              }`}
                            title={
                              m.capacity_note
                                ? `Nota: ${m.capacity_note}`
                                : `Capacidade: ${m.cognitive_capacity}`
                            }
                          >
                            <span>{capIcon}</span>
                            <span>{m.full_name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}



          {/* ACCORDION 2: SUBTAREFAS / CHECKLIST */}
          <div
            className={`border rounded-2xl overflow-hidden transition-all ${isSubtasksOpen
                ? 'border-accent-primary/50 bg-surface shadow-md'
                : 'border-border-subtle bg-app hover:border-border-strong'
              }`}
          >
            <button
              type="button"
              onClick={() => setIsSubtasksOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-accent-primary">checklist</span>
                <span className="text-xs font-black uppercase tracking-wider text-fg">
                  2. Subtarefas / Checklist
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-fg-secondary">
                  {localSubtasks.length === 0
                    ? '0 subtarefas'
                    : `${localSubtasks.filter((st) => st.status === 'completa' || st.status === 'concluída').length}/${localSubtasks.length} concluídas`}
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[18px] text-fg-muted transition-transform duration-200 ${isSubtasksOpen ? 'rotate-180' : ''
                  }`}
              >
                expand_more
              </span>
            </button>

            {isSubtasksOpen && (
              <div className="p-4 border-t border-border-subtle space-y-3 bg-black/20">
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {localSubtasks.map((st) => {
                    const isCompleted = st.status === 'completa' || st.status === 'concluída';
                    const stId = st.id as string;
                    const isOrgTask = !formData.is_personal && Boolean(formData.organization_id);
                    const expanded = expandedSubtaskId === stId;
                    const stSubteams = st.assigned_subteam_ids || [];
                    const stMembers = st.assigned_member_ids || [];

                    return (
                      <div
                        key={stId}
                        className={`p-2.5 rounded-xl border transition-all ${isCompleted
                            ? 'bg-surface/40 border-border-subtle opacity-70'
                            : 'bg-surface border-border-subtle'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isCompleted}
                              onChange={() => toggleSubtask(stId)}
                              className="rounded border-border-subtle text-[var(--accent-primary)] focus:ring-0 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={st.nome || ''}
                              onChange={(e) => updateSubtask(stId, { nome: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                              className={`flex-1 bg-transparent text-xs focus:outline-none focus:border-b focus:border-accent-primary ${isCompleted ? 'text-fg-muted line-through' : 'text-fg'
                                }`}
                            />
                            {(stSubteams.length + stMembers.length) > 0 && (
                              <span className="text-[10px] text-teal-300 font-bold">
                                {stSubteams.length}👥 {stMembers.length}👤
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isOrgTask && (
                              <button
                                type="button"
                                onClick={() => setExpandedSubtaskId(expanded ? null : stId)}
                                className={`p-1 rounded hover:bg-surface-hover text-xs ${expanded ? 'text-teal-400' : 'text-fg-muted hover:text-fg'
                                  }`}
                                title="Delegar esta subtarefa"
                              >
                                <span className="material-symbols-outlined text-[16px]">group_add</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteSubtask(stId)}
                              className="p-1 rounded text-fg-muted hover:text-[#db4437] transition-colors"
                              title="Excluir subtarefa"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </div>

                        {isOrgTask && expanded && (
                          <div className="mt-2.5 pt-2 border-t border-border-subtle space-y-2 text-xs">
                            <div>
                              <div className="text-[10px] uppercase font-bold text-fg-muted mb-1">Equipes da Subtarefa</div>
                              <div className="flex flex-wrap gap-1">
                                {subteams.map((sub) => {
                                  const active = stSubteams.includes(sub.id);
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() => {
                                        const next = toggleInList(st.assigned_subteam_ids, sub.id);
                                        updateSubtask(stId, { assigned_subteam_ids: next, subteam_id: next[0] ?? null });
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${active
                                          ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                          : 'border-border-subtle text-fg-secondary hover:text-white'
                                        }`}
                                    >
                                      {sub.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase font-bold text-fg-muted mb-1">Indivíduos da Subtarefa</div>
                              <div className="flex flex-wrap gap-1">
                                {members.map((m) => {
                                  const active = stMembers.includes(m.id);
                                  return (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() =>
                                        updateSubtask(stId, { assigned_member_ids: toggleInList(st.assigned_member_ids, m.id) })
                                      }
                                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${active
                                          ? 'bg-teal-500/20 border-teal-500 text-teal-200 font-bold'
                                          : 'border-border-subtle text-fg-secondary hover:text-fg'
                                        }`}
                                    >
                                      {m.full_name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {localSubtasks.length === 0 && (
                    <div className="text-center text-fg-muted text-xs py-2">
                      Nenhuma subtarefa criada. Digite abaixo para adicionar.
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={handleAddSubtask}
                    placeholder="Adicionar subtarefa (pressione Enter)"
                    className="flex-1 bg-surface border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-fg focus:outline-none focus:border-[#FFCC00]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 3: MAIS OPÇÕES (DIMENSÃO, CATEGORIA, RECORRÊNCIA, NOTAS & COFRE) */}
          <div
            className={`border rounded-2xl overflow-hidden transition-all ${isMoreOptionsOpen
                ? 'border-border-strong bg-surface shadow-md'
                : 'border-border-subtle bg-app hover:border-border-strong'
              }`}
          >
            <button
              type="button"
              onClick={() => setIsMoreOptionsOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-fg-muted">tune</span>
                <span className="text-xs font-black uppercase tracking-wider text-fg">
                  3. Mais Opções (Dimensão, Recorrência, Notas &amp; Cofre)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-fg-secondary">
                  {selectedDimensions.length > 0 ? `${selectedDimensions.length} dimensão(ões)` : 'Padrão'}
                  {freqType ? ` • ${freqType}` : ''}
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[18px] text-fg-muted transition-transform duration-200 ${isMoreOptionsOpen ? 'rotate-180' : ''
                  }`}
              >
                expand_more
              </span>
            </button>

            {isMoreOptionsOpen && (
              <div className="p-4 border-t border-border-subtle space-y-4 bg-black/20">
                {/* Dimensão e Categoria */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                      Dimensões
                    </label>
                    <div className="flex flex-wrap gap-1.5 bg-surface border border-border-subtle rounded-xl p-2 min-h-[42px] max-h-28 overflow-y-auto">
                      {dimensaoOptions.map((opt) => {
                        const isSelected = selectedDimensions.includes(opt.value);
                        return (
                          <div
                            key={opt.value}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedDimensions((prev) => prev.filter((d) => d !== opt.value));
                              } else {
                                setSelectedDimensions((prev) => [...prev, opt.value]);
                              }
                            }}
                            className={`cursor-pointer transition-all border ${isSelected ? 'border-[#FFCC00] ring-1 ring-[#FFCC00]' : 'border-transparent opacity-60 hover:opacity-100'
                              } rounded-md`}
                          >
                            <Badge type="dimensao" value={opt.label} customColor={opt.color} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[10px] text-fg-muted">Selecione múltiplas para criar cópias automáticas.</div>
                  </div>

                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                      Categoria
                    </label>
                    <CustomSelect
                      name="categoria"
                      value={formData.categoria || ''}
                      onChange={handleChange}
                      type="categoria"
                      options={categoriaOptions}
                      allowCustom={true}
                      onEditColumn={columns.find((c) => c.key === 'categoria') ? () => handleEditCol('categoria') : undefined}
                    />
                  </div>
                </div>

                {/* Recorrência e Início */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                      Frequência / Recorrência
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={freqType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFreqType(val);
                          let newDetail = '';
                          if (val === 'Semanal') newDetail = 'Segunda';
                          if (val === 'Mensal') newDetail = '1';
                          setFreqDetail(newDetail);

                          let newFreq = val;
                          if (val === 'Semanal') newFreq = `Semanal - ${newDetail}`;
                          if (val === 'Mensal') newFreq = `Mensal - Dia ${newDetail}`;
                          setFormData((prev) => ({ ...prev, frequencia: newFreq }));
                        }}
                        className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFCC00]"
                      >
                        <option value="">Nenhuma</option>
                        <option value="Diária">Diária</option>
                        <option value="Semanal">Semanal</option>
                        <option value="Mensal">Mensal</option>
                      </select>
                      {freqType === 'Semanal' && (
                        <select
                          value={freqDetail}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFreqDetail(val);
                            setFormData((prev) => ({ ...prev, frequencia: `Semanal - ${val}` }));
                          }}
                          className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFCC00]"
                        >
                          <option value="Segunda">Segunda</option>
                          <option value="Terça">Terça</option>
                          <option value="Quarta">Quarta</option>
                          <option value="Quinta">Quinta</option>
                          <option value="Sexta">Sexta</option>
                          <option value="Sábado">Sábado</option>
                          <option value="Domingo">Domingo</option>
                        </select>
                      )}
                      {freqType === 'Mensal' && (
                        <select
                          value={freqDetail}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFreqDetail(val);
                            setFormData((prev) => ({ ...prev, frequencia: `Mensal - Dia ${val}` }));
                          }}
                          className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFCC00]"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d.toString()}>
                              Dia {d}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                      Data de Início
                    </label>
                    <input
                      type="date"
                      name="inicio"
                      value={formData.inicio || ''}
                      onChange={handleChange}
                      className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Foto / Anexo */}
                <div>
                  <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                    Foto / Anexo Local
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 cursor-pointer bg-surface border border-border-subtle rounded-xl px-3.5 py-2 hover:border-[#FFCC00] transition-colors flex items-center justify-between group">
                      <span className="text-xs text-fg-muted group-hover:text-fg truncate">
                        {selectedFile
                          ? selectedFile.name
                          : formData.custom_fields?.foto_url
                            ? 'Substituir foto atual...'
                            : 'Escolher arquivo local...'}
                      </span>
                      <span className="material-symbols-outlined text-fg-muted group-hover:text-[#FFCC00] text-[18px]">
                        upload
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSelectedFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                    {(selectedFile || formData.custom_fields?.foto_url) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setFormData((prev) => ({
                            ...prev,
                            custom_fields: { ...(prev.custom_fields || {}), foto_url: null },
                          }));
                        }}
                        className="p-2 text-[#db4437] hover:bg-[#db4437]/10 rounded-xl transition-colors"
                        title="Remover foto"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Arquivos do Cofre (Sinergia dos 4 Pilares) */}
                <div className="bg-surface border border-border-subtle rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#FFCC00] text-[18px]">folder_special</span>
                      <label className="text-xs uppercase font-bold text-white tracking-wider">
                        Arquivos do Servidor / Cofre
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFilePickerOpen(true)}
                      className="px-2.5 py-1 bg-[#FFCC00]/10 hover:bg-[#FFCC00]/20 text-[#FFCC00] border border-[#FFCC00]/30 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      Anexar do Cofre
                    </button>
                  </div>

                  {(() => {
                    const currentId = formData.id;
                    const linkedFiles = userFiles.filter(
                      (f) =>
                        (currentId && Array.isArray(f.linked_task_ids) && f.linked_task_ids.includes(currentId)) ||
                        (currentId && f.linked_task_id === currentId)
                    );

                    if (linkedFiles.length === 0) {
                      return <p className="text-[11px] text-fg-muted">Nenhum arquivo do cofre anexado a esta tarefa.</p>;
                    }

                    return (
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {linkedFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-app border border-border-subtle text-xs"
                          >
                            <span className="truncate text-white">{file.filename}</span>
                            <button
                              type="button"
                              disabled={unlinkingFile === file.id}
                              onClick={async () => {
                                if (!currentId) return;
                                setUnlinkingFile(file.id);
                                try {
                                  await updateFileEcosystemLinksAction({
                                    relativePath: file.relative_path,
                                    filename: file.filename,
                                    mimeType: file.mime_type,
                                    sizeBytes: file.size_bytes,
                                    patch: { removeTaskIds: [currentId] },
                                  });
                                  onFilesUpdated?.();
                                } finally {
                                  setUnlinkingFile(null);
                                }
                              }}
                              className="text-fg-muted hover:text-[#db4437] transition-colors"
                              title="Desvincular"
                            >
                              <span className="material-symbols-outlined text-[16px]">link_off</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Descrição Detalhada */}
                <div>
                  <label className="block text-xs text-fg-muted uppercase tracking-wider mb-1.5 font-bold">
                    Descrição Detalhada / Links de Apoio
                  </label>
                  <textarea
                    name="descricao"
                    value={formData.descricao || ''}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Adicione orientações, links ou anotações contextuais..."
                    className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#FFCC00] resize-y"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-between">
            {task ? (
              <button type="button" onClick={handleDelete} disabled={loading} className="text-[#db4437] text-sm hover:underline font-semibold">Excluir Tarefa</button>
            ) : (
              <label className={`text-accent-primary text-sm hover:underline font-semibold cursor-pointer flex items-center gap-1 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="material-symbols-outlined text-[18px]">upload</span>
                Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={loading} />
              </label>
            )}
            <div className="flex gap-4">
              <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2 border border-border-subtle text-fg rounded-md hover:bg-surface-hover text-sm font-semibold transition-colors cursor-pointer">Cancelar</button>
              <button type="submit" disabled={loading} className="px-6 py-2 bg-[#FFCC00] text-black rounded-md hover:bg-[#e6b800] text-sm font-bold transition-colors shadow-sm disabled:opacity-50">
                {loading ? 'Salvando...' : 'Salvar Tarefa'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Modal de Anexar Arquivos do Cofre (A28) */}
      {isFilePickerOpen && (
        <TaskFilePickerModal
          isOpen={isFilePickerOpen}
          onClose={() => setIsFilePickerOpen(false)}
          taskId={formData.id || task?.id || ''}
          taskTitle={formData.nome || task?.nome || 'Tarefa'}
          ticket={activeTicket || vaultTicket || ''}
          onLinkedUpdated={() => {
            onFilesUpdated?.();
          }}
        />
      )}
    </div>
  );
}
