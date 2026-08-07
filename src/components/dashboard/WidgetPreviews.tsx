import React from 'react';

export function WidgetTasksPreview({ tasks, config }: { tasks: any[], config: any }) {
  return (
    <div className="bg-[#121212] rounded-xl border border-[#2D2D2D] p-4 w-[300px] h-[250px] shadow-lg flex flex-col overflow-hidden mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-sm">Minhas Tarefas</h3>
        <span className="material-symbols-outlined text-[#8E8E8E] text-[16px]">more_horiz</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar flex-1">
        {tasks.slice(0, 5).map((t, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border border-[#8E8E8E]"></div>
            <span className="text-[#E0E0E0] text-xs truncate flex-1">{t.nome}</span>
          </div>
        ))}
        {tasks.length === 0 && <div className="text-[#8E8E8E] text-xs">Nenhuma tarefa.</div>}
      </div>
    </div>
  );
}

export function WidgetCalendarPreview() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <div className="bg-[#121212] rounded-xl border border-[#2D2D2D] p-4 w-[320px] h-[280px] shadow-lg flex flex-col mx-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white font-bold text-sm uppercase">Novembro</h3>
        <span className="text-[#8E8E8E] text-[10px]">Semanal / Mensal</span>
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => (
          <div key={d} className="text-center text-[#8E8E8E] text-[10px] font-bold">{d}</div>
        ))}
        {days.map(d => (
          <div key={d} className="text-center text-[#E0E0E0] text-[10px] flex items-center justify-center relative border border-[#2D2D2D]/30 rounded-sm">
            {d}
            {d % 5 === 0 && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#FFCC00] rounded-full"></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WidgetEventsPreview({ events }: { events: any[] }) {
  return (
    <div className="bg-[#1A202C] rounded-[24px] border border-[#2D3748] p-4 w-[280px] h-[340px] shadow-lg flex flex-col mx-auto overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-sm">Próximos Eventos</h3>
        <button className="w-8 h-8 rounded-full bg-[#4299E1] text-white flex items-center justify-center transition-transform hover:scale-105 shadow">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>
      
      <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-2">
        {/* Dia 1 */}
        <div className="flex flex-col gap-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Qui., 6 de ago.</h4>
          
          <div className="bg-[#4299E1] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-white text-[13px] font-semibold leading-tight mb-1">Inteligência Artificial</span>
            <span className="text-white/80 text-[11px] font-medium">16:00 - 18:00</span>
          </div>
          
          <div className="bg-[#1A202C] border border-[#4299E1] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-[#4299E1] text-[13px] font-semibold leading-tight mb-1">PRG0010-TurmaA</span>
            <span className="text-[#4299E1]/80 text-[11px] font-medium">16:00 - 18:00</span>
          </div>
          
          <div className="bg-[#48BB78] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-white text-[13px] font-semibold leading-tight mb-1">Mecânica</span>
            <span className="text-white/80 text-[11px] font-medium">19:00 - 21:00</span>
          </div>
        </div>

        {/* Dia 2 */}
        <div className="flex flex-col gap-2 mt-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Sex., 7 de ago.</h4>
          
          <div className="bg-[#ECC94B] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-[#744210] text-[13px] font-semibold leading-tight mb-1">Elementos e Estratégia</span>
            <span className="text-[#744210]/80 text-[11px] font-medium">08:00 - 10:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
