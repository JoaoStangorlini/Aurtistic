import React from 'react';
import { Task, AgendaEvent } from '@/types';
import { Badge, getBadgeColorClass } from './Badge';

interface TaskCalendarProps {
  tasks: Task[];
  events?: AgendaEvent[];
  currentDate: Date;
  format?: 'weekly' | 'monthly';
  onDateChange: (date: Date) => void;
  onTaskClick: (task: Task) => void;
  onEventClick?: (event: AgendaEvent) => void;
}

export default function TaskCalendar({ tasks, events = [], currentDate, format = 'monthly', onDateChange, onTaskClick, onEventClick }: TaskCalendarProps) {
  const [selectedDateStr, setSelectedDateStr] = React.useState<string | null>(null);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevPeriod = () => {
    if (format === 'weekly') {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() - 7);
      onDateChange(newDate);
    } else {
      onDateChange(new Date(year, month - 1, 1));
    }
  };

  const nextPeriod = () => {
    if (format === 'weekly') {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() + 7);
      onDateChange(newDate);
    } else {
      onDateChange(new Date(year, month + 1, 1));
    }
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const datesToRender: { date: Date, isEmpty: boolean }[] = [];

  if (format === 'monthly') {
    for (let i = 0; i < firstDay; i++) {
      datesToRender.push({ date: new Date(), isEmpty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      datesToRender.push({ date: new Date(year, month, d), isEmpty: false });
    }
  } else {
    const currentDay = currentDate.getDay();
    const startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - currentDay);
    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + i);
      datesToRender.push({ date: cellDate, isEmpty: false });
    }
  }

  const days = datesToRender.map((item, index) => {
    if (item.isEmpty) {
      return <div key={`empty-${index}`} className="min-h-[100px] bg-[#1A1A1A]/30 border border-[#2D2D2D] rounded-md p-2"></div>;
    }

    const cellDate = item.date;
    const cYear = cellDate.getFullYear();
    const cMonth = cellDate.getMonth();
    const cDate = cellDate.getDate();
    
    const cellDateStr = `${cYear}-${String(cMonth + 1).padStart(2, '0')}-${String(cDate).padStart(2, '0')}`;
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = cellDateStr === todayStr;

    const dayOfWeek = cellDate.getDay();
    const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const cellDayName = dayOfWeekNames[dayOfWeek];
    const d = cDate;

    const dayTasks = tasks.filter(t => {
      if (t.prazo && t.prazo.startsWith(cellDateStr)) return true;
      if (t.frequencia && t.status !== 'completa' && t.status !== 'descartada') {
        const freq = t.frequencia;
        if (freq === 'Diária') return true;
        if (freq.startsWith('Semanal - ') && freq.includes(cellDayName)) return true;
        if (freq.startsWith('Mensal - Dia ') && freq.includes(String(d))) return true;
      }
      return false;
    });

    const isSelected = selectedDateStr === cellDateStr;

    const dayEvents = events.filter(e => {
      if (e.data_inicio && e.data_inicio.startsWith(cellDateStr)) return true;
      if (e.horarios_semanais && typeof e.horarios_semanais === 'object') {
        const evtStart = e.data_inicio ? new Date(e.data_inicio) : null;
        const evtEnd = e.data_fim ? new Date(e.data_fim) : null;
        const cellTime = cellDate.getTime();
        const isAfterStart = !evtStart || cellTime >= evtStart.getTime();
        const isBeforeEnd = !evtEnd || cellTime <= evtEnd.getTime();
        
        if (isAfterStart && isBeforeEnd) {
          if ((e.horarios_semanais as any)[cellDayName]) return true;
        }
      }
      return false;
    });

    return (
      <div 
        key={`day-${cellDateStr}`} 
        onClick={() => setSelectedDateStr(isSelected ? null : cellDateStr)}
        className={`min-h-[100px] border rounded-md p-1 sm:p-2 flex flex-col gap-1 transition-colors cursor-pointer ${isSelected ? 'border-[#FFCC00] bg-[#FFCC00]/5' : isToday ? 'border-[#9D4EDD] bg-[#9D4EDD]/5' : 'border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#8E8E8E]'}`}
      >
        <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isSelected ? 'bg-[#FFCC00] text-[#121212]' : isToday ? 'bg-[#9D4EDD] text-white' : 'text-[#8E8E8E]'}`}>
          {d}
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[150px] custom-scrollbar">
          {dayEvents.map(evt => (
            <div 
              key={`evt-${evt.id}`} 
              onClick={(e) => { e.stopPropagation(); if(onEventClick) onEventClick(evt); }}
              className="text-[10px] bg-[#004d40] border border-[#00695c] hover:border-[#009688] rounded p-1 cursor-pointer truncate transition-colors flex items-center gap-1"
              title={evt.nome}
            >
              <span className="material-symbols-outlined text-[10px] text-[#26a69a]">event</span>
              <span className="truncate text-[#e0f2f1] font-bold">{evt.nome}</span>
            </div>
          ))}
          {dayTasks.map(task => {
            const dimClass = getBadgeColorClass('dimensao', task.dimensao);
            const match = dimClass.match(/text-\[(#[0-9a-fA-F]{6})\]/);
            const dotColor = match ? match[1] : '#FFCC00';
            
            return (
            <div 
              key={task.id} 
              onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
              className="text-[10px] bg-[#252525] border border-[#333333] hover:border-[#9D4EDD] rounded p-1 cursor-pointer truncate transition-colors flex items-center gap-1"
              title={task.nome}
            >
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }}></div>
              <span className="truncate text-[#E5E2E1]">{task.nome}</span>
            </div>
            );
          })}
        </div>
      </div>
    );
  });

  return (
    <div className="flex flex-col w-full mt-4 bg-[#121212] rounded-lg border border-[#2D2D2D] overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 bg-[#1A1A1A] border-b border-[#2D2D2D]">
        <div className="flex items-center gap-2">
          <button onClick={prevPeriod} className="text-[#8E8E8E] hover:text-white transition-colors p-1 rounded hover:bg-[#252525]">
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button onClick={nextPeriod} className="text-[#8E8E8E] hover:text-white transition-colors p-1 rounded hover:bg-[#252525]">
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
          <span className="text-[#E0E0E0] font-bold text-sm">
            {format === 'weekly' 
              ? `${datesToRender[0].date.getDate()} ${monthNames[datesToRender[0].date.getMonth()].substring(0,3)} - ${datesToRender[6].date.getDate()} ${monthNames[datesToRender[6].date.getMonth()].substring(0,3)} de ${datesToRender[6].date.getFullYear()}`
              : `${monthNames[month]} de ${year}`}
          </span>
          <button onClick={goToToday} className="hidden sm:block text-xs font-bold text-[#8E8E8E] hover:text-white transition-colors px-3 py-1.5 rounded border border-[#2D2D2D] hover:border-[#8E8E8E]">
            Hoje
          </button>
        </div>
        <h3 className="text-sm sm:text-lg font-bold text-white tracking-wider">
          {monthNames[month]} {year}
        </h3>
        <div className="w-[80px] sm:w-[100px]"></div> {/* Spacer for balance */}
      </div>

      {/* Calendar Grid */}
      <div className="p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-[10px] sm:text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days}
        </div>

        {/* Selected Day Tasks */}
        {selectedDateStr && (
          <div className="mt-4 border-t border-[#2D2D2D] pt-4">
            <h4 className="text-[#FFCC00] font-bold text-sm mb-3">
              Tarefas do dia {selectedDateStr.split('-').reverse().join('/')}
            </h4>
            <div className="overflow-x-auto custom-scrollbar">
              <div className="min-w-[700px] flex flex-col gap-2">
                {/* Column Headers */}
                {tasks.filter(t => {
  if (t.prazo && t.prazo.startsWith(selectedDateStr)) return true;
  if (t.frequencia && t.status !== 'completa' && t.status !== 'descartada') {
    const d = parseInt(selectedDateStr.split('-')[2]);
    const cellDate = new Date(parseInt(selectedDateStr.split('-')[0]), parseInt(selectedDateStr.split('-')[1]) - 1, d);
    const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const cellDayName = dayOfWeekNames[cellDate.getDay()];
    
    const freq = t.frequencia;
    if (freq === 'Diária') return true;
    if (freq.startsWith('Semanal - ') && freq.includes(cellDayName)) return true;
    if (freq.startsWith('Mensal - Dia ') && freq.includes(String(d))) return true;
  }
  return false;
}).length > 0 && (
                  <div className="grid grid-cols-[1fr_80px_70px_80px_80px_80px] gap-2 items-center text-[10px] font-bold text-[#8E8E8E] uppercase tracking-wider px-3 pb-2 border-b border-[#2D2D2D] mb-1">
                    <div>Nome</div>
                    <div className="text-center">Status</div>
                    <div className="text-center">Prio</div>
                    <div className="text-center">Categoria</div>
                    <div className="text-center">Responsável</div>
                    <div className="text-center">Dimensão</div>
                  </div>
                )}

                {tasks.filter(t => {
  if (t.prazo && t.prazo.startsWith(selectedDateStr)) return true;
  if (t.frequencia && t.status !== 'completa' && t.status !== 'descartada') {
    const d = parseInt(selectedDateStr.split('-')[2]);
    const cellDate = new Date(parseInt(selectedDateStr.split('-')[0]), parseInt(selectedDateStr.split('-')[1]) - 1, d);
    const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const cellDayName = dayOfWeekNames[cellDate.getDay()];
    
    const freq = t.frequencia;
    if (freq === 'Diária') return true;
    if (freq.startsWith('Semanal - ') && freq.includes(cellDayName)) return true;
    if (freq.startsWith('Mensal - Dia ') && freq.includes(String(d))) return true;
  }
  return false;
}).length > 0 ? (
                  tasks.filter(t => {
  if (t.prazo && t.prazo.startsWith(selectedDateStr)) return true;
  if (t.frequencia && t.status !== 'completa' && t.status !== 'descartada') {
    const d = parseInt(selectedDateStr.split('-')[2]);
    const cellDate = new Date(parseInt(selectedDateStr.split('-')[0]), parseInt(selectedDateStr.split('-')[1]) - 1, d);
    const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const cellDayName = dayOfWeekNames[cellDate.getDay()];
    
    const freq = t.frequencia;
    if (freq === 'Diária') return true;
    if (freq.startsWith('Semanal - ') && freq.includes(cellDayName)) return true;
    if (freq.startsWith('Mensal - Dia ') && freq.includes(String(d))) return true;
  }
  return false;
}).map(task => {
                    const dimClass = getBadgeColorClass('dimensao', task.dimensao);
                    const match = dimClass.match(/text-\[(#[0-9a-fA-F]{6})\]/);
                    const dotColor = match ? match[1] : '#FFCC00';

                    return (
                    <div 
                      key={task.id} 
                      onClick={() => onTaskClick(task)}
                      className="grid grid-cols-[1fr_80px_70px_80px_80px_80px] gap-2 items-center bg-[#1A1A1A] border border-[#2D2D2D] hover:border-[#9D4EDD] rounded-lg p-3 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate pr-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }}></div>
                        <span className="text-white text-sm font-semibold truncate">{task.nome}</span>
                      </div>
                      <div className="flex justify-center scale-90 origin-center"><Badge type="status" value={task.status} /></div>
                      <div className="flex justify-center scale-90 origin-center"><Badge type="prioridade" value={task.prioridade} /></div>
                      <div className="flex justify-center scale-90 origin-center"><Badge type="categoria" value={task.categoria} /></div>
                      <div className="flex justify-center scale-90 origin-center"><Badge type="responsavel" value={task.responsavel} /></div>
                      <div className="flex justify-center scale-90 origin-center"><Badge type="dimensao" value={task.dimensao} /></div>
                    </div>
                    );
                  })
                ) : (
                  <div className="text-[#8E8E8E] text-xs">Nenhuma tarefa neste dia.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
