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
  const [hoursFilterMode, setHoursFilterMode] = React.useState<'all_day'|'morning'|'afternoon'|'night'|'only_items'|'custom'>('all_day');
  const [customStartHour, setCustomStartHour] = React.useState<number>(7);
  const [customEndHour, setCustomEndHour] = React.useState<number>(23);


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

      {/* Calendar Grid */}
      {format === 'monthly' ? (
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
        </div>
      ) : (
        <div className="p-2 sm:p-4 overflow-x-auto custom-scrollbar">
          {/* Menu Filtro de Horas */}
          <div className="flex flex-wrap gap-2 mb-4 items-center bg-[#1A1A1A] p-2 rounded-md border border-[#2D2D2D]">
            <span className="text-[#8E8E8E] text-xs font-bold uppercase tracking-wider mr-2">Horários:</span>
            {['all_day', 'morning', 'afternoon', 'night', 'only_items', 'custom'].map(mode => (
              <button 
                key={mode}
                onClick={() => setHoursFilterMode(mode as any)}
                className={`px-3 py-1 rounded text-[11px] font-bold transition-colors ${hoursFilterMode === mode ? 'bg-[#9D4EDD] text-white' : 'bg-[#252525] text-[#8E8E8E] hover:text-white'}`}
              >
                {mode === 'all_day' && '7h às 23h'}
                {mode === 'morning' && '☀️ Manhã'}
                {mode === 'afternoon' && '🌤️ Tarde'}
                {mode === 'night' && '🌙 Noite'}
                {mode === 'only_items' && '🎯 Com Itens'}
                {mode === 'custom' && '⚙️ Custom'}
              </button>
            ))}
            {hoursFilterMode === 'custom' && (
              <div className="flex items-center gap-2 ml-4">
                <input type="number" min="0" max="23" value={customStartHour} onChange={e => setCustomStartHour(parseInt(e.target.value))} className="w-12 bg-[#252525] text-white rounded p-1 text-xs text-center border border-[#333333]" />
                <span className="text-[#8E8E8E]">às</span>
                <input type="number" min="0" max="23" value={customEndHour} onChange={e => setCustomEndHour(parseInt(e.target.value))} className="w-12 bg-[#252525] text-white rounded p-1 text-xs text-center border border-[#333333]" />
              </div>
            )}
          </div>

          <div className="min-w-[800px] border border-[#2D2D2D] rounded-lg bg-[#121212] overflow-hidden flex flex-col">
            {/* Header Dias */}
            <div className="flex border-b border-[#2D2D2D] bg-[#1A1A1A]">
              <div className="w-[60px] shrink-0 border-r border-[#2D2D2D]"></div>
              {datesToRender.map((item, idx) => (
                <div key={idx} className="flex-1 text-center p-2 border-r border-[#2D2D2D] last:border-r-0">
                  <div className="text-[10px] text-[#8E8E8E] uppercase">{dayNames[item.date.getDay()]}</div>
                  <div className={`text-sm font-bold ${item.date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0] ? 'text-[#9D4EDD]' : 'text-white'}`}>
                    {item.date.getDate()}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Linhas de Horas */}
            <div className="relative">
              {Array.from({ length: 24 }).map((_, hour) => {
                let show = true;
                if (hoursFilterMode === 'morning') show = hour >= 6 && hour <= 12;
                else if (hoursFilterMode === 'afternoon') show = hour >= 12 && hour <= 18;
                else if (hoursFilterMode === 'night') show = hour >= 18 && hour <= 23;
                else if (hoursFilterMode === 'all_day') show = hour >= 7 && hour <= 23;
                else if (hoursFilterMode === 'custom') show = hour >= customStartHour && hour <= customEndHour;
                
                if (!show) return null;

                return (
                  <div key={hour} className="flex border-b border-dashed border-[#2D2D2D] h-[60px] group">
                    <div className="w-[60px] shrink-0 border-r border-[#2D2D2D] bg-[#1A1A1A]/50 flex items-start justify-center pt-1">
                      <span className="text-[10px] text-[#8E8E8E] font-medium">{String(hour).padStart(2, '0')}:00</span>
                    </div>
                    {datesToRender.map((item, dIdx) => (
                      <div key={dIdx} className="flex-1 border-r border-[#2D2D2D]/30 last:border-r-0 hover:bg-[#252525]/30 relative">
                         {/* Placeholder para os cartões absolutos - idealmente calculados no topo */}
                      </div>
                    ))}
                  </div>
                )
              })}
              
              {/* Eventos e Tarefas Renderizados de forma sobreposta */}
              <div className="absolute inset-0 pointer-events-none flex">
                <div className="w-[60px] shrink-0"></div>
                {datesToRender.map((item, dIdx) => {
                  const cellDateStr = item.date.toISOString().split('T')[0];
                  const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                  const cellDayName = dayOfWeekNames[item.date.getDay()];

                  // Para simplificar a POC vertical, no momento só renderizamos blocos básicos dentro da coluna
                  const dayEvts = events.filter(e => {
                    if (e.data_inicio && e.data_inicio.startsWith(cellDateStr)) return true;
                    if (e.horarios_semanais && (e.horarios_semanais as any)[cellDayName]) return true;
                    return false;
                  });

                  return (
                    <div key={dIdx} className="flex-1 relative pointer-events-auto p-1 flex flex-col gap-1">
                      {dayEvts.map(evt => (
                        <div key={evt.id} onClick={() => onEventClick && onEventClick(evt)} className="bg-[#004d40] border border-[#00695c] rounded p-1 text-[10px] text-[#e0f2f1] cursor-pointer truncate shadow-sm">
                          {evt.nome}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
