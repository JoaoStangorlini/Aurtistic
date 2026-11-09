// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type CreateTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (task: any) => void;
};

const DIMENSIONS = [
  'HUB',
  'USP',
  'Projeto',
  'Filmes/series',
  'CIN',
  'tatuagens',
  'compras',
  'hobbys',
  'livros'
];

export default function CreateTaskModal({ isOpen, onClose, onTaskCreated }: CreateTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // States para os campos em português, que serão mapeados para o banco em inglês
  const [nome, setNome] = useState('');
  const [status, setStatus] = useState('BACKLOG');
  const [prioridade, setPrioridade] = useState('Baixa');
  const [categoria, setCategoria] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dimensao, setDimensao] = useState('HUB');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    
    // Pega o usuário logado (necessário pro RLS)
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError('Usuário não autenticado');
      setLoading(false);
      return;
    }

    const newTask = {
      title: nome,
      status: status,
      priority: prioridade,
      category: categoria,
      assignee: responsavel,
      due_date: data ? new Date(data).toISOString() : null,
      description: descricao,
      dimension: dimensao,
      user_id: user.id
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('tasks')
      .insert([newTask])
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      setError('Erro ao salvar tarefa. Verifique se você rodou a migração SQL.');
      setLoading(false);
      return;
    }

    onTaskCreated(insertedData);
    
    // Limpar form
    setNome('');
    setDescricao('');
    setData('');
    setCategoria('');
    setResponsavel('');
    setPrioridade('Baixa');
    setStatus('BACKLOG');
    setDimensao('HUB');
    
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-cosmic-bg border border-cosmic-surface-hover rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-cosmic-accent">Nova Tarefa</h2>
          <button onClick={onClose} className="text-cosmic-text/50 hover:text-cosmic-text text-xl">&times;</button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/20 border border-red-500 text-red-200 rounded">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Nome *</label>
              <input required value={nome} onChange={e => setNome(e.target.value)} type="text" className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none" />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Dimensão *</label>
              <select value={dimensao} onChange={e => setDimensao(e.target.value)} className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none">
                {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none">
                <option value="BACKLOG">Backlog</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none">
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Categoria</label>
              <input value={categoria} onChange={e => setCategoria(e.target.value)} type="text" className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-bold text-cosmic-text mb-1">Responsável</label>
              <input value={responsavel} onChange={e => setResponsavel(e.target.value)} type="text" className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-cosmic-text mb-1">Data</label>
              <input value={data} onChange={e => setData(e.target.value)} type="date" className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-cosmic-text mb-1">Descrição</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className="w-full p-2 bg-cosmic-surface rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none custom-scrollbar" />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-cosmic-surface-hover">
            <button type="button" onClick={onClose} className="px-6 py-2 rounded font-bold text-cosmic-text hover:bg-cosmic-surface transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="px-6 py-2 rounded font-bold bg-cosmic-accent text-cosmic-bg hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? 'Salvando...' : 'Salvar Tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
