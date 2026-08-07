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

export function WidgetCalendarPreview({ config }: { config?: any }) {
  const showTasks = config?.calendarShowTasks ?? true;
  const showEvents = config?.calendarShowEvents ?? true;
  
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const startOffset = 5; // Start on Friday just for preview
  
  return (
    <div className="bg-[#1C1C1E] rounded-[28px] p-4 w-[320px] h-[340px] shadow-2xl flex flex-col mx-auto font-sans">
      <div className="flex justify-between items-center mb-4 px-2">
        <button className="text-[#8E8E8E] hover:text-white flex items-center"><span className="material-symbols-outlined text-[20px]">chevron_left</span></button>
        <h3 className="text-white font-medium text-[15px] flex-1 text-center truncate px-1">Agosto 2026</h3>
        
        <div className="flex gap-[2px] mr-1">
          <div className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center text-[9px] font-bold text-[#121212] ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'}`}>E</div>
          <div className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center text-[9px] font-bold text-white ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'}`}>T</div>
        </div>

        <button className="text-[#8E8E8E] hover:text-white flex items-center mr-2"><span className="material-symbols-outlined text-[20px]">chevron_right</span></button>
        <button className="w-8 h-8 rounded-full bg-[#9D4EDD] text-white flex items-center justify-center shadow shrink-0">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, index) => (
          <div key={index} className="text-center text-[#8E8E8E] text-[11px] font-medium">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1 flex-1">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
        ))}
        {days.map(d => {
          const hasEvent = d === 10 || d === 15 || d === 22;
          const hasTask = d === 10 || d === 12 || d === 25;
          return (
            <div key={d} className="bg-[#2A2A2C] rounded-[6px] flex flex-col items-center pt-1 pb-1 relative overflow-hidden h-[34px]">
              <span className={`text-[12px] font-medium ${d === 10 ? 'text-[#9D4EDD]' : 'text-[#E0E0E0]'}`}>{d}</span>
              <div className="flex flex-col gap-[2px] mt-auto w-[90%] items-center mb-[2px]">
                {showEvents && hasEvent && (
                   <div className="bg-[#FFCC00] rounded-[3px] w-full h-[10px] flex items-center justify-center px-1">
                     <span className="text-[#121212] text-[7px] font-bold truncate leading-none">Dem...</span>
                   </div>
                )}
                {showTasks && hasTask && (
                   <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[10px] flex items-center justify-center px-1">
                     <span className="text-white text-[7px] font-bold truncate leading-none">Tar...</span>
                   </div>
                )}
              </div>
            </div>
          );
        })}
        {Array.from({ length: 42 - (31 + startOffset) }).map((_, i) => (
          <div key={`empty-end-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
        ))}
      </div>
    </div>
  );
}

export function WidgetWeeklyCalendarPreview({ config }: { config?: any }) {
  const showTasks = config?.weeklyShowTasks ?? true;
  const showEvents = config?.weeklyShowEvents ?? true;
  const splitShifts = config?.weeklySplitShifts ?? true;
  
  return (
    <div className="bg-[#1C1C1E] rounded-[28px] p-4 w-[320px] shadow-2xl flex flex-col mx-auto font-sans min-h-[180px]">
      <div className="flex justify-between items-center mb-4 px-2">
        <button className="text-[#8E8E8E] hover:text-white flex items-center"><span className="material-symbols-outlined text-[20px]">chevron_left</span></button>
        <h3 className="text-white font-medium text-[15px] flex-1 text-center truncate px-1">Agosto 2026</h3>
        
        <div className="flex gap-[2px] mr-1">
          <div className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center text-[9px] font-bold text-[#121212] ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'}`}>E</div>
          <div className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center text-[9px] font-bold text-white ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'}`}>T</div>
        </div>

        <button className="text-[#8E8E8E] hover:text-white flex items-center mr-2"><span className="material-symbols-outlined text-[20px]">chevron_right</span></button>
        <button className="w-8 h-8 rounded-full bg-[#9D4EDD] text-white flex items-center justify-center shadow shrink-0">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, index) => (
          <div key={index} className="text-center text-[#8E8E8E] text-[11px] font-medium">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = 9 + i; // 9 to 15
          const hasEventAM = d === 10;
          const hasEventPM = d === 15;
          const hasTaskAM = d === 12;
          const hasTaskPM = d === 10;
          return (
            <div key={d} className="flex flex-col relative overflow-hidden h-[54px] pt-1">
              <span className={`text-[12px] text-center font-medium ${d === 10 ? 'text-[#9D4EDD]' : 'text-[#E0E0E0]'}`}>{d}</span>
              
              {splitShifts ? (
                <div className="flex-1 flex flex-col w-full mt-[2px] gap-[2px]">
                  {/* AM Square */}
                  <div className="bg-[#2A2A2C] rounded-[4px] h-[16px] flex flex-col items-center justify-center w-full px-[2px]">
                    {showEvents && hasEventAM && (
                       <div className="bg-[#FFCC00] rounded-[2px] w-full h-[6px]"></div>
                    )}
                    {showTasks && hasTaskAM && (
                       <div className="bg-[#9D4EDD] rounded-[2px] w-full h-[6px] mt-[1px]"></div>
                    )}
                  </div>
                  {/* PM Square */}
                  <div className="bg-[#2A2A2C] rounded-[4px] h-[16px] flex flex-col items-center justify-center w-full px-[2px]">
                    {showEvents && hasEventPM && (
                       <div className="bg-[#FFCC00] rounded-[2px] w-full h-[6px]"></div>
                    )}
                    {showTasks && hasTaskPM && (
                       <div className="bg-[#9D4EDD] rounded-[2px] w-full h-[6px] mt-[1px]"></div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 w-full mt-1 bg-[#2A2A2C] rounded-[6px] flex flex-col items-center justify-end pb-1 px-1 h-full relative -top-4 pt-4 -z-10">
                  <div className="flex flex-col gap-[2px] w-full">
                    {showEvents && (hasEventAM || hasEventPM) && (
                       <div className="bg-[#FFCC00] rounded-[2px] w-full h-[6px]"></div>
                    )}
                    {showTasks && (hasTaskAM || hasTaskPM) && (
                       <div className="bg-[#9D4EDD] rounded-[2px] w-full h-[6px]"></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WidgetEventsPreview({ events }: { events: any[] }) {
  return (
    <div className="bg-[#121212] rounded-[24px] border border-[#2D2D2D] p-4 w-[280px] h-[340px] shadow-lg flex flex-col mx-auto overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-sm">Próximos Eventos</h3>
        <button className="w-8 h-8 rounded-full bg-[#9D4EDD] text-white flex items-center justify-center transition-transform hover:scale-105 shadow">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>
      
      <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-2">
        {/* Dia 1 */}
        <div className="flex flex-col gap-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Qui., 6 de ago.</h4>
          
          <div className="bg-[#9D4EDD] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-white text-[13px] font-semibold leading-tight mb-1">Inteligência Artificial</span>
            <span className="text-white/80 text-[11px] font-medium">16:00 - 18:00</span>
          </div>
          
          <div className="bg-[#1A1A1A] border border-[#9D4EDD] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-[#9D4EDD] text-[13px] font-semibold leading-tight mb-1">PRG0010-TurmaA</span>
            <span className="text-[#9D4EDD]/80 text-[11px] font-medium">16:00 - 18:00</span>
          </div>
          
          <div className="bg-[#8534C1] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-white text-[13px] font-semibold leading-tight mb-1">Mecânica</span>
            <span className="text-white/80 text-[11px] font-medium">19:00 - 21:00</span>
          </div>
        </div>

        {/* Dia 2 */}
        <div className="flex flex-col gap-2 mt-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Sex., 7 de ago.</h4>
          
          <div className="bg-[#FFCC00] rounded-xl p-3 flex flex-col shadow-sm">
            <span className="text-[#121212] text-[13px] font-bold leading-tight mb-1">Elementos e Estratégia</span>
            <span className="text-[#121212]/80 text-[11px] font-bold">08:00 - 10:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
