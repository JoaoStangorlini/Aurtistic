'use client';

import { useState, useEffect, useRef } from 'react';
import { Task } from '@/types';
import { saveTask, deleteTask } from '@/app/(dashboard)/actions';
import { getBadgeColorClass } from './Badge';
import { CustomSelect } from './CustomSelect';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: (Task & { subtasks?: Task[] }) | null;
  uniqueCategories?: string[];
  uniqueDimensions?: string[];
}

export function TaskFormModal({ isOpen, onClose, task, uniqueCategories, uniqueDimensions }: TaskFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [freqType, setFreqType] = useState('');
  const [freqDetail, setFreqDetail] = useState('');
  
  // Local state for subtasks (both existing and newly added in this session)
  const [localSubtasks, setLocalSubtasks] = useState<Partial<Task>[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const generatedIdRef = useRef(crypto.randomUUID());

  const [formData, setFormData] = useState<Partial<Task>>({
    id: generatedIdRef.current,
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
  });

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
        prazo: task.prazo ? task.prazo.split('T')[0] : '',
        descricao: task.descricao || '',
        frequencia: task.frequencia || ''
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
    } else {
      generatedIdRef.current = crypto.randomUUID();
      setFormData({
        id: generatedIdRef.current,
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
      });
      setFreqType('');
      setFreqDetail('');
      setLocalSubtasks([]);
    }
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parentId = formData.id;
      // 1. Save the parent task
      await saveTask(formData);
      
      // 2. Save all local subtasks
      for (const st of localSubtasks) {
        // Inherit everything from parent that isn't explicitly set differently
        const subtaskToSave = {
          ...formData, // inherit all parent properties (dimensao, prioridade, etc)
          ...st,       // overwrite with subtask specific properties (nome, id, completed status, etc)
          parent_id: parentId, // link to parent
        };
        // Clean up some fields that shouldn't be inherited or have special meaning
        if (!st.status) subtaskToSave.status = formData.status || 'não iniciada';
        
        await saveTask(subtaskToSave);
      }
      
      onClose();
    } catch (err) {
      alert('Erro ao salvar tarefa: ' + String(err));
    } finally {
      setLoading(false);
    }
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
      e.preventDefault();
      if (newSubtaskTitle.trim() === '') return;
      
      const newSubtask: Partial<Task> = {
        id: crypto.randomUUID(),
        nome: newSubtaskTitle.trim(),
        status: 'não iniciada',
        parent_id: formData.id
      };
      
      setLocalSubtasks([...localSubtasks, newSubtask]);
      setNewSubtaskTitle('');
    }
  };

  const toggleSubtask = (id: string) => {
    setLocalSubtasks(localSubtasks.map(st => {
      if (st.id === id) {
        const isCompleted = st.status === 'completa';
        return { ...st, status: isCompleted ? 'não iniciada' : 'completa' };
      }
      return st;
    }));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-center p-6 border-b border-[#2D2D2D]">
          <h2 className="text-xl font-bold text-[#FFCC00]">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
          <button onClick={onClose} className="text-[#A0A0A0] hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Nome da Tarefa *</label>
              <input required name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]" />
            </div>

            {(() => {
              const catOptions = [
                { value: "", label: "Nenhuma" },
                ...Array.from(new Set([...(["Programar", "Pesquisar", "touch the grass", "reunir", "post", "outros"]), ...(uniqueCategories || [])])).map(c => ({ value: c, label: c }))
              ];
              
              const dimOptions = [
                { value: "", label: "Nenhuma" },
                ...Array.from(new Set([...(["HUB", "urgente", "USP", "filmes/series", "cin", "tatuagens", "compras", "hobbys", "livros", "stangorlini.web", "fotografia"]), ...(uniqueDimensions || [])])).map(d => ({ value: d, label: d }))
              ];

              return (
                <>
                  <div>
                    <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Status</label>
                    <CustomSelect name="status" value={formData.status || ''} onChange={handleChange} type="status" options={[{"value":"não iniciada","label":"Não iniciada"},{"value":"em progresso","label":"Em progresso"},{"value":"falta testar","label":"Falta testar"},{"value":"completa","label":"Completa"},{"value":"descartada","label":"Descartada"}]} />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Prioridade</label>
                    <CustomSelect name="prioridade" value={formData.prioridade || ''} onChange={handleChange} type="prioridade" options={[{"value":"","label":"Nenhuma"},{"value":"Baixa","label":"Baixa"},{"value":"Média","label":"Média"},{"value":"Alta","label":"Alta"}]} />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Categoria</label>
                    <CustomSelect name="categoria" value={formData.categoria || ''} onChange={handleChange} type="categoria" options={catOptions} allowCustom={true} />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Responsável</label>
                    <CustomSelect name="responsavel" value={formData.responsavel || ''} onChange={handleChange} type="responsavel" options={[{"value":"","label":"Nenhum"},{"value":"João","label":"João"},{"value":"Andy","label":"Andy"},{"value":"Leo","label":"Leo"},{"value":"Dani","label":"Dani"},{"value":"Lorenzo","label":"Lorenzo"},{"value":"Nacky","label":"Nacky"}]} />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Dimensão</label>
                    <CustomSelect name="dimensao" value={formData.dimensao || ''} onChange={handleChange} type="dimensao" options={dimOptions} allowCustom={true} />
                  </div>
                </>
              );
            })()}

            <div>
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Frequência</label>
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
                  className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
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
                    className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
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
                    className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00]"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d.toString()}>Dia {d}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Início</label>
              <input type="date" name="inicio" value={formData.inicio || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]" />
            </div>

            <div>
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Prazo</label>
              <input type="date" name="prazo" value={formData.prazo || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark]" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Descrição</label>
              <textarea name="descricao" value={formData.descricao || ''} onChange={handleChange} rows={3} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] resize-y" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-[#8E8E8E] uppercase tracking-wider mb-2">Sub-tarefas</label>
              <div className="bg-[#121212] border border-[#2D2D2D] rounded-xl p-4">
                <div className="space-y-2 mb-4 max-h-[150px] overflow-y-auto pr-2">
                  {localSubtasks.map(st => {
                    const isCompleted = st.status === 'completa';
                    return (
                      <div key={st.id} className="flex items-center gap-3 group">
                        <input 
                          type="checkbox" 
                          checked={isCompleted} 
                          onChange={() => toggleSubtask(st.id as string)}
                          className="w-4 h-4 rounded-sm border-[#444] bg-[#1a1a1a] checked:bg-[#9D4EDD] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className={`flex-1 text-sm ${isCompleted ? 'text-[#8E8E8E] line-through' : 'text-[#E0E0E0]'}`}>{st.nome}</span>
                        <button type="button" onClick={() => deleteSubtask(st.id as string)} className="text-[#8E8E8E] hover:text-[#db4437] opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    );
                  })}
                  {localSubtasks.length === 0 && (
                    <div className="text-center text-[#8E8E8E] text-xs py-2">Nenhuma sub-tarefa.</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={handleAddSubtask}
                    placeholder="Adicionar item (pressione Enter)" 
                    className="flex-1 bg-transparent border border-[#2D2D2D] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#9D4EDD]" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-between">
            {task ? (
              <button type="button" onClick={handleDelete} disabled={loading} className="text-[#db4437] text-sm hover:underline font-semibold">Excluir Tarefa</button>
            ) : <div />}
            <div className="flex gap-4">
              <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2 border border-[#2D2D2D] text-white rounded-md hover:bg-[#252525] text-sm font-semibold transition-colors">Cancelar</button>
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
