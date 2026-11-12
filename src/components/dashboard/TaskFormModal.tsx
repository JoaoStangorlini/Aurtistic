// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useEffect } from 'react';
import { Task, TaskColumn, UserFileIndexRow } from '@/types';
import { saveTask, deleteTask } from '@/lib/offlineActions';
import { Badge, getBadgeColorClass } from './Badge';
import { CustomSelect } from './CustomSelect';
import { createClient } from '@/utils/supabase/client';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
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
  subteams = [],
  members = [],
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
        assigned_member_ids: task.assigned_member_ids || [],
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
        assigned_member_ids: defaultValues?.assigned_member_ids || [],
      });
      setFreqType('');
      setFreqDetail('');
      setLocalSubtasks([]);
      setSelectedDimensions([initialDimensao]);
      setSelectedFile(null);
    }
  }, [task, isOpen, activeScope, activeOrgId, defaultValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      
      const dimsToSave = selectedDimensions.length > 0 ? selectedDimensions : [formData.dimensao || 'HUB'];
      
      for (let i = 0; i < dimsToSave.length; i++) {
        const currentDim = dimsToSave[i];
        
        // Se for a primeira dimensão e estamos editando uma tarefa existente, mantém o ID original
        // Caso contrário (é uma cópia para outra dimensão, ou uma nova tarefa), gera novo ID.
        const isFirst = i === 0;
        const taskId = (isFirst && task) ? formData.id : crypto.randomUUID();
        
        const taskDataToSave = {
          ...formData,
          id: taskId,
          dimensao: currentDim,
          custom_fields: Object.keys(baseCustomFields).length > 0 ? baseCustomFields : undefined
        };
        
        await saveTask(taskDataToSave);
        
        // Salva as subtarefas
        for (const st of localSubtasks) {
          let subtaskToSave: Partial<Task>;
          
          if (!st.created_at || !isFirst) {
            // Nova subtarefa ou subtarefa copiada para uma nova dimensão
            subtaskToSave = {
              ...taskDataToSave,
              ...st,
              id: crypto.randomUUID(), // Novo ID
              parent_id: taskId,
            };
            if (!st.status) subtaskToSave.status = taskDataToSave.status || 'não iniciada';
          } else {
            // Subtarefa existente sendo editada
            subtaskToSave = {
              id: st.id,
              nome: st.nome,
              status: st.status || 'não iniciada',
              parent_id: taskId,
            };
          }
          
          await saveTask(subtaskToSave);
        }
      }
      
      onClose();
    } catch (err) {
      alert('Erro ao salvar tarefa: ' + String(err));
      setUploadingImage(false);
    } finally {
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
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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
        } : {})
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

  const deleteSubtask = async (id: string) => {
    // If it's an existing subtask, we might need to delete it from DB immediately
    // but for simplicity, we can just call deleteTask if we know it exists, or just filter it.
    // Actually, if we filter it, it won't be deleted from DB on save unless we track deleted ones.
    // Let's just delete it from DB immediately to be safe, then remove from state.
    if (confirm('Deletar subtarefa?')) {
      try {
        await deleteTask(id);
        setLocalSubtasks(localSubtasks.filter(st => st.id !== id));
      } catch (err) {
        // If it wasn't in DB yet, it will throw an error or just fail silently, we can just remove from state
        setLocalSubtasks(localSubtasks.filter(st => st.id !== id));
      }
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
    : (extraCategoriaOptions.length > 0 ? [{label: 'Nenhuma', value: ''}, ...extraCategoriaOptions] : []);

  const baseDimensaoOptions = getColumnOptions('dimensao', []);
  const extraDimensaoOptions = (uniqueDimensions || [])
    .filter(d => d && d !== 'favoritas' && !baseDimensaoOptions.some(o => o.value === d))
    .map(d => ({ label: d, value: d }));
  const dimensaoOptions = baseDimensaoOptions.length > 0
    ? [...baseDimensaoOptions, ...extraDimensaoOptions]
    : (extraDimensaoOptions.length > 0 ? [{label: 'Nenhuma', value: ''}, ...extraDimensaoOptions] : []);

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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Nome da Tarefa *</label>
              <input required name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]" />
            </div>

            {/* Escopo da Tarefa: Pessoal vs Organização */}
            {organizations && organizations.length > 0 && (
              <div className="md:col-span-2 p-3.5 bg-app border border-border-subtle rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-fg-muted uppercase tracking-wider font-bold">
                    Escopo & Organização
                  </label>
                  <div className="inline-flex p-1 bg-surface border border-border-subtle rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        is_personal: true,
                        organization_id: null,
                        subteam_id: null,
                        assigned_member_ids: [],
                      }))}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        formData.is_personal
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
                        setFormData(prev => ({
                          ...prev,
                          is_personal: false,
                          organization_id: targetOrgId,
                        }));
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        !formData.is_personal
                          ? 'bg-teal-500 text-slate-950 font-black shadow-sm'
                          : 'text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">domain</span>
                      Organização
                    </button>
                  </div>
                </div>

                {!formData.is_personal && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border-subtle">
                    {/* Seletor de Organização se houver mais de uma */}
                    {organizations.length > 1 && (
                      <div>
                        <label className="block text-[11px] text-fg-muted uppercase tracking-wider mb-1 font-bold">
                          Organização
                        </label>
                        <select
                          value={formData.organization_id || ''}
                          onChange={e => setFormData(prev => ({ ...prev, organization_id: e.target.value }))}
                          className="w-full bg-surface border border-teal-500/30 text-fg rounded-lg px-3 py-2 text-xs font-bold focus:border-teal-500 focus:outline-none"
                        >
                          {organizations.map(o => (
                            <option key={o.id} value={o.id}>
                              🏛️ {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Seletor de Categoria / Eixo Obrigatório */}
                    <div className={organizations.length > 1 ? '' : 'md:col-span-2'}>
                      <label className="block text-[11px] text-fg-muted uppercase tracking-wider mb-1 font-bold">
                        Categoria da Tarefa (Eixo Obrigatório) *
                      </label>
                      <select
                        required
                        value={formData.subteam_id || ''}
                        onChange={e => setFormData(prev => ({ ...prev, subteam_id: e.target.value || null }))}
                        className="w-full bg-surface border border-border-subtle text-white rounded-lg px-3 py-2 text-xs font-bold focus:border-[#FFCC00] focus:outline-none"
                      >
                        <option value="">Selecione o Eixo (Programação, Comunicação, Pesquisa, Administração)...</option>
                        {subteams.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            👥 {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Seletor de Atribuição: Toda a Equipe ou Membro Específico */}
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-fg-muted uppercase tracking-wider font-bold">
                          Atribuição da Tarefa
                        </label>
                        <span className="text-[10px] text-teal-300">
                          {(!formData.assigned_member_ids || formData.assigned_member_ids.length === 0)
                            ? '👥 Atribuída a Toda a Equipe da Categoria'
                            : '👤 Membro(s) Específico(s)'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 p-2 bg-surface border border-border-subtle rounded-xl max-h-36 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, assigned_member_ids: [], responsavel: null }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            (!formData.assigned_member_ids || formData.assigned_member_ids.length === 0)
                              ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm'
                              : 'bg-surface border-border-subtle text-fg-muted hover:text-white'
                          }`}
                        >
                          👥 Toda a Equipe
                        </button>
                        {members.length === 0 ? (
                          <span className="text-xs text-fg-muted p-1">Nenhum membro encontrado na organização.</span>
                        ) : (
                          members.map(m => {
                            const isAssigned = (formData.assigned_member_ids || []).includes(m.id);
                            const capIcon = m.cognitive_capacity === 'normal' ? '🟢' : m.cognitive_capacity === 'reduced' ? '🟡' : '🔴';
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => {
                                    const current = prev.assigned_member_ids || [];
                                    const next = current.includes(m.id)
                                      ? current.filter(id => id !== m.id)
                                      : [...current, m.id];
                                    const firstMember = members.find(mem => next.includes(mem.id));
                                    return {
                                      ...prev,
                                      assigned_member_ids: next,
                                      responsavel: firstMember ? firstMember.full_name : prev.responsavel,
                                    };
                                  });
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                                  isAssigned
                                    ? 'bg-teal-500/20 border-teal-500 text-teal-200 font-bold shadow-sm'
                                    : 'bg-surface border-border-subtle text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface-hover'
                                }`}
                                title={m.capacity_note ? `Nota: ${m.capacity_note}` : `Capacidade: ${m.cognitive_capacity}`}
                              >
                                <span>{capIcon}</span>
                                <span>{m.full_name}</span>
                                {m.is_placeholder && (
                                  <span className="text-[10px] text-amber-400 font-mono">(placeholder)</span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Status</label>
              <CustomSelect 
                name="status" 
                value={formData.status || 'não iniciada'} 
                options={statusOptions} 
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                type="status"
                onEditColumn={columns.find(c => c.key === 'status') ? () => handleEditCol('status') : undefined}
              />
            </div>

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Prioridade</label>
              <CustomSelect name="prioridade" value={formData.prioridade || ''} onChange={handleChange} type="prioridade" options={prioridadeOptions} allowCustom={true} onEditColumn={columns.find(c => c.key === 'prioridade') ? () => handleEditCol('prioridade') : undefined} />
            </div>

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Categoria</label>
              <CustomSelect name="categoria" value={formData.categoria || ''} onChange={handleChange} type="categoria" options={categoriaOptions} allowCustom={true} onEditColumn={columns.find(c => c.key === 'categoria') ? () => handleEditCol('categoria') : undefined} />
            </div>

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Responsável</label>
              <CustomSelect name="responsavel" value={formData.responsavel || ''} onChange={handleChange} type="responsavel" options={responsavelOptions} allowCustom={true} onEditColumn={columns.find(c => c.key === 'responsavel') ? () => handleEditCol('responsavel') : undefined} />
            </div>

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Dimensão</label>
              <div className="flex flex-wrap gap-2 bg-app border border-border-subtle rounded-md p-2 min-h-[42px] max-h-[120px] overflow-y-auto">
                {dimensaoOptions.map(opt => {
                  const isSelected = selectedDimensions.includes(opt.value);
                  return (
                    <div 
                      key={opt.value}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDimensions(prev => prev.filter(d => d !== opt.value));
                        } else {
                          setSelectedDimensions(prev => [...prev, opt.value]);
                        }
                      }}
                      className={`cursor-pointer transition-all border ${isSelected ? 'border-[#FFCC00] ring-1 ring-[#FFCC00]' : 'border-transparent opacity-60 hover:opacity-100'} rounded-md`}
                    >
                      <Badge type="dimensao" value={opt.label} customColor={opt.color} />
                    </div>
                  );
                })}
                {dimensaoOptions.length === 0 && <span className="text-sm text-fg-muted p-1">Nenhuma dimensão disponível</span>}
              </div>
              <div className="mt-1 text-[10px] text-fg-secondary">Selecione múltiplas para criar cópias desta tarefa.</div>
            </div>
            
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Foto / Anexo</label>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer bg-app border border-border-subtle rounded-md px-4 py-2 hover:border-[#FFCC00] transition-colors flex items-center justify-between group">
                  <span className="text-sm text-fg-muted group-hover:text-fg truncate">
                    {selectedFile ? selectedFile.name : formData.custom_fields?.foto_url ? 'Substituir foto atual...' : 'Escolher arquivo...'}
                  </span>
                  <span className="material-symbols-outlined text-fg-muted group-hover:text-[#FFCC00] text-[20px]">upload</span>
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
                      setFormData(prev => ({
                        ...prev,
                        custom_fields: { ...(prev.custom_fields || {}), foto_url: null }
                      }));
                    }}
                    className="p-2 text-[#db4437] hover:bg-[#db4437]/10 rounded-md transition-colors"
                    title="Remover foto"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Seção: Arquivos Vinculados do Servidor (Sinergia dos 4 Pilares) */}
            <div className="bg-app border border-border-subtle rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00] text-[18px]">
                    folder_special
                  </span>
                  <label className="text-xs uppercase font-bold text-white tracking-wider">
                    Arquivos do Servidor
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFilePickerOpen(true)}
                  className="px-2.5 py-1 bg-[#FFCC00]/10 hover:bg-[#FFCC00]/20 text-[#FFCC00] border border-[#FFCC00]/30 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Anexar do Servidor
                </button>
              </div>

              {/* Lista de Arquivos Vinculados */}
              {(() => {
                const currentId = formData.id;
                const linkedFiles = userFiles.filter(
                  (f) =>
                    (currentId && Array.isArray(f.linked_task_ids) && f.linked_task_ids.includes(currentId)) ||
                    (currentId && f.linked_task_id === currentId)
                );

                if (linkedFiles.length === 0) {
                  return (
                    <p className="text-[11px] text-fg-muted">
                      Nenhum arquivo do servidor anexado a esta tarefa.
                    </p>
                  );
                }

                return (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {linkedFiles.map((file) => {
                      const isNote = file.filename.endsWith('.md') || file.filename.endsWith('.txt');
                      const isAudio = file.mime_type.startsWith('audio/');
                      const isImage = file.mime_type.startsWith('image/');
                      const iconName = isAudio ? 'audiotrack' : isImage ? 'image' : isNote ? 'description' : 'draft';
                      const iconColor = isAudio ? 'text-[#9D4EDD]' : isImage ? 'text-[#00C49F]' : 'text-[#FFCC00]';

                      return (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border-subtle hover:border-[#FFCC00]/40 transition-colors"
                        >
                          <div
                            onClick={() => {
                              if (isNote) {
                                openNoteInPlace({
                                  relativePath: file.relative_path,
                                  filename: file.filename,
                                  linkedTaskId: currentId,
                                });
                              } else if (isAudio) {
                                playAudioInPlace({
                                  relativePath: file.relative_path,
                                  filename: file.filename,
                                });
                              } else if (isImage) {
                                openPhotoInPlace({
                                  relativePath: file.relative_path,
                                  filename: file.filename,
                                  mimeType: file.mime_type,
                                  sizeBytes: file.size_bytes,
                                  exifData: file.exif_data,
                                });
                              }
                            }}
                            className="flex items-center gap-2 truncate flex-1 cursor-pointer"
                            title="Clique para visualizar in-place"
                          >
                            <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>
                              {iconName}
                            </span>
                            <span className="text-xs text-white truncate font-medium">
                              {file.filename}
                            </span>
                            <span className="text-[10px] text-fg-muted shrink-0 font-mono">
                              ({formatStorageBytes(file.size_bytes)})
                            </span>
                          </div>

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
                                  patch: {
                                    removeTaskIds: [currentId],
                                  },
                                });
                                onFilesUpdated?.();
                              } finally {
                                setUnlinkingFile(null);
                              }
                            }}
                            className="p-1 text-fg-muted hover:text-[#db4437] transition-colors ml-2"
                            title="Desvincular arquivo desta tarefa"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {unlinkingFile === file.id ? 'progress_activity' : 'link_off'}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {isFilePickerOpen && formData.id && (
              <TaskFilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                taskId={formData.id}
                taskTitle={formData.nome || 'Nova Tarefa'}
                currentlyLinkedPaths={userFiles
                  .filter(
                    (f) =>
                      (formData.id && Array.isArray(f.linked_task_ids) && f.linked_task_ids.includes(formData.id)) ||
                      (formData.id && f.linked_task_id === formData.id)
                  )
                  .map((f) => f.relative_path)}
                ticket={vaultTicket || activeTicket || ''}
                onLinkedUpdated={() => {
                  onFilesUpdated?.();
                }}
              />
            )}

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Frequência</label>
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
                    setFormData(prev => ({ ...prev, frequencia: newFreq }));
                  }}
                  className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
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
                      setFormData(prev => ({ ...prev, frequencia: `Semanal - ${val}` }));
                    }}
                    className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
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
                      setFormData(prev => ({ ...prev, frequencia: `Mensal - Dia ${val}` }));
                    }}
                    className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d.toString()}>Dia {d}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Início</label>
              <input type="date" name="inicio" value={formData.inicio || ''} onChange={handleChange} className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs text-fg-muted uppercase tracking-wider">Prazo (Data e Hora)</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      const d = new Date(); d.setDate(d.getDate() + 1);
                      d.setHours(12, 0, 0, 0); // Define 12:00 por padrão
                      setFormData(prev => ({ ...prev, prazo: new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) }))
                    }}
                    className="text-[10px] bg-surface-hover hover:bg-[var(--accent-primary)] text-white hover:text-white px-2 py-1 rounded transition-colors"
                  >Amanhã</button>
                  <button 
                    type="button"
                    onClick={() => {
                      const d = new Date(); d.setDate(d.getDate() + 7);
                      d.setHours(12, 0, 0, 0);
                      setFormData(prev => ({ ...prev, prazo: new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) }))
                    }}
                    className="text-[10px] bg-surface-hover hover:bg-[var(--accent-primary)] text-white hover:text-white px-2 py-1 rounded transition-colors"
                  >Próx. Sem.</button>
                  <button 
                    type="button"
                    onClick={() => {
                      const d = new Date(); d.setMonth(d.getMonth() + 1);
                      d.setHours(12, 0, 0, 0);
                      setFormData(prev => ({ ...prev, prazo: new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) }))
                    }}
                    className="text-[10px] bg-surface-hover hover:bg-[var(--accent-primary)] text-white hover:text-white px-2 py-1 rounded transition-colors"
                  >Próx. Mês</button>
                </div>
              </div>
              <input type="datetime-local" name="prazo" value={formData.prazo || ''} onChange={handleChange} className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Descrição</label>
              <textarea name="descricao" value={formData.descricao || ''} onChange={handleChange} rows={3} className="w-full bg-app border border-border-subtle rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] resize-y" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Sub-tarefas</label>
              <div className="bg-app border border-border-subtle rounded-xl p-4">
                <div className="space-y-2 mb-4 max-h-[150px] overflow-y-auto pr-2">
                  {localSubtasks.map(st => {
                    const isCompleted = st.status === 'completa';
                    return (
                      <div key={st.id} className="flex items-center gap-3 group">
                        <input 
                          type="checkbox" 
                          checked={isCompleted} 
                          onChange={() => toggleSubtask(st.id as string)}
                          className="w-4 h-4 rounded-sm border-border-subtle bg-surface checked:bg-[var(--accent-primary)] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className={`flex-1 text-sm ${isCompleted ? 'text-fg-muted line-through' : 'text-fg-secondary'}`}>{st.nome}</span>
                        <button type="button" onClick={() => deleteSubtask(st.id as string)} className="text-fg-muted hover:text-[#db4437] opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    );
                  })}
                  {localSubtasks.length === 0 && (
                    <div className="text-center text-fg-muted text-xs py-2">Nenhuma sub-tarefa.</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={handleAddSubtask}
                    placeholder="Adicionar item (pressione Enter)" 
                    className="flex-1 bg-transparent border border-border-subtle rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-between">
            {task ? (
              <button type="button" onClick={handleDelete} disabled={loading} className="text-[#db4437] text-sm hover:underline font-semibold">Excluir Tarefa</button>
            ) : (
              <label className={`text-[#9D4EDD] text-sm hover:underline font-semibold cursor-pointer flex items-center gap-1 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
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
    </div>
  );
}
