// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState } from 'react';
import CreateTaskModal from './CreateTaskModal';

type TaskBoardProps = {
  initialTasks: any[];
  fixedDimension?: string;
};

const DIMENSIONS = [
  'Todas',
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

export default function TaskBoard({ initialTasks, fixedDimension }: TaskBoardProps) {
  const [tasks, setTasks] = useState(initialTasks || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterDimension, setFilterDimension] = useState(fixedDimension || 'Todas');

  const handleTaskCreated = (newTask: any) => {
    setTasks([newTask, ...tasks]);
  };

  const filteredTasks = filterDimension === 'Todas' 
    ? tasks 
    : tasks.filter(t => t.dimension === filterDimension);

  const columns = [
    { id: 'BACKLOG', title: 'Backlog' },
    { id: 'IN_PROGRESS', title: 'In Progress' },
    { id: 'COMPLETED', title: 'Completed' }
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-cosmic-accent font-title">
          {fixedDimension ? `Tarefas: ${fixedDimension}` : 'Gerenciador de Tarefas'}
        </h1>
        
        <div className="flex gap-4 items-center">
          {!fixedDimension && (
            <select 
              value={filterDimension} 
              onChange={e => setFilterDimension(e.target.value)}
              className="bg-cosmic-surface text-cosmic-text p-2 rounded border border-cosmic-surface-hover focus:border-cosmic-accent focus:outline-none"
            >
              {DIMENSIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-cosmic-surface hover:bg-cosmic-surface-hover text-cosmic-accent font-bold py-2 px-6 rounded border border-cosmic-accent transition-colors"
          >
            + Nova Tarefa
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
        {columns.map((col) => (
          <div key={col.id} className="bg-cosmic-surface p-4 rounded-lg shadow-lg border border-cosmic-surface-hover flex flex-col h-full">
            <h2 className="text-xl font-bold mb-4 text-cosmic-text border-b border-cosmic-surface-hover pb-2">
              {col.title} <span className="text-sm font-normal text-cosmic-text/50">({filteredTasks.filter(t => t.status === col.id).length})</span>
            </h2>
            <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {filteredTasks.filter((t: any) => t.status === col.id).map((task: any) => (
                <div key={task.id} className="bg-cosmic-bg p-4 rounded border border-cosmic-surface hover:border-cosmic-surface-hover transition-colors relative group cursor-pointer">
                  {task.priority === 'Alta' && (
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-cosmic-accent rounded-l"></div>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold px-2 py-1 bg-cosmic-surface text-cosmic-text/70 rounded uppercase">
                      {task.dimension}
                    </span>
                    {task.priority === 'Alta' && <span className="text-cosmic-accent text-xs font-bold">ALTA</span>}
                  </div>
                  <h3 className="font-bold text-base mb-1 text-cosmic-text">{task.title}</h3>
                  {task.description && (
                    <p className="text-sm text-cosmic-text/70 mb-3 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex justify-between items-center text-xs text-cosmic-text/70 mt-2 pt-2 border-t border-cosmic-surface-hover/50">
                    <span>{task.assignee || 'Sem responsável'}</span>
                    {task.due_date && <span>{new Date(task.due_date).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
              ))}
              {filteredTasks.filter((t: any) => t.status === col.id).length === 0 && (
                <p className="text-cosmic-text/50 text-sm text-center py-4">Nenhuma tarefa</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateTaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onTaskCreated={handleTaskCreated}
      />
    </>
  );
}
