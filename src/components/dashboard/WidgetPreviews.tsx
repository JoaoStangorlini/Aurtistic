import React from 'react';

export function WidgetTasksPreview({ tasks, config }: { tasks: any[], config: any }) {
  const showTasks = config?.listShowTasks ?? true;
  const showEvents = config?.listShowEvents ?? true;

  return (
    <div className="bg-[#121212] rounded-[24px] border border-[#2D2D2D] p-4 w-[300px] h-[340px] shadow-lg flex flex-col mx-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 flex-1">
            <h3 className="text-white font-bold text-[14px]">
              {config?.filterDimension && config?.filterDimension !== 'Todas' ? config.filterDimension : 'Dimensões'}
            </h3>
            <span className="material-symbols-outlined text-[#A0A0A0] text-[18px]">expand_more</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-[24px] h-[24px] rounded-[4px] flex items-center justify-center text-[12px] font-bold text-[#121212] ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'} mr-1`}>E</div>
            <div className={`w-[24px] h-[24px] rounded-[4px] flex items-center justify-center text-[12px] font-bold text-white ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'} mr-2`}>T</div>
            <button className="w-[32px] h-[32px] flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>
        </div>
      
      <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Sex., 7 de ago.</h4>
          {showTasks && (
            <div className="bg-[#9D4EDD]/15 border border-[#9D4EDD]/30 rounded-[12px] px-3 py-2.5 flex items-center justify-between shadow-sm">
               <span className="text-white text-[13px] font-medium leading-tight truncate flex-1 mr-2">
                 Consulta no médico
               </span>
               <div className="flex items-center gap-2 flex-shrink-0">
                 <span className="material-symbols-outlined text-[#FFCC00] text-[16px]">edit</span>
                 <span className="bg-[#9D4EDD]/40 text-[#FFCC00] text-[10px] font-bold px-2 py-0.5 rounded">Hoje</span>
               </div>
            </div>
          )}
          {showEvents && (
            <div className="bg-[#FFCC00] rounded-[12px] px-3 py-2.5 flex flex-col shadow-sm">
              <span className="text-[#121212] text-[13px] font-bold leading-tight mb-0.5">Aniversário do Jorge</span>
              <span className="text-[#121212]/80 text-[11px] font-bold">19:30 - 23:00</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <h4 className="text-white font-bold text-[13px] mb-1">Sáb., 8 de ago.</h4>
          {showTasks && (
            <div className="bg-[#3B82F6]/15 border border-[#3B82F6]/30 rounded-[12px] px-3 py-2.5 flex items-center justify-between shadow-sm">
              <span className="text-white text-[13px] font-medium leading-tight truncate flex-1 mr-2">
                Aula de matemática
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="material-symbols-outlined text-[#4285F4] text-[16px]">edit</span>
                <span className="bg-[#3B82F6]/40 text-[#FFCC00] text-[10px] font-bold px-2 py-0.5 rounded">1d</span>
              </div>
            </div>
          )}
          {showEvents && (
            <div className="bg-[#3B82F6] rounded-[12px] px-3 py-2.5 flex flex-col shadow-sm">
              <span className="text-white text-[13px] font-semibold leading-tight mb-0.5">Viagem</span>
              <span className="text-white/80 text-[11px] font-medium">08:00 - 12:30</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WidgetCalendarPreview({ config }: { config?: any }) {
  const showTasks = config?.calendarShowTasks ?? true;
  const showEvents = config?.calendarShowEvents ?? true;

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonthIdx = currentDate.getMonth();

  const m1Name = `${monthNames[currentMonthIdx % 12]} ${currentYear}`;
  const m2Name = `${monthNames[(currentMonthIdx + 1) % 12]} ${currentMonthIdx + 1 > 11 ? currentYear + 1 : currentYear}`;
  const m3Name = `${monthNames[(currentMonthIdx + 2) % 12]} ${currentMonthIdx + 2 > 11 ? currentYear + 1 : currentYear}`;

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const startOffset = 5;

  return (
    <div className="bg-[#1C1C1E] rounded-[28px] p-4 w-[340px] h-[340px] shadow-2xl flex flex-col mx-auto font-sans">
      {/* Top Header: Spaced out E, T, + without arrows */}
      <div className="flex justify-between items-center mb-3 px-1">
        <h3 className="text-white font-bold text-[15px] truncate">
          {m1Name}
        </h3>

        <div className="flex items-center gap-6">
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-[#121212] cursor-pointer shadow ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'}`}>E</div>
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-white cursor-pointer shadow ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'}`}>T</div>
          <button className="w-7 h-7 rounded-full bg-[#9D4EDD] text-white flex items-center justify-center shadow shrink-0 cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>

      {/* Main Container com Rolagem Dura de 3 Meses */}
      <div 
        className="flex-1 overflow-x-auto snap-x snap-mandatory scroll-smooth custom-scrollbar flex"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* Mês 1: Mês Atual */}
        <div 
          className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col"
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
        >
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
              const isToday = d === currentDate.getDate();
              return (
                <div key={d} className="bg-[#2A2A2C] rounded-[6px] flex flex-col items-center pt-1 pb-1 relative overflow-hidden h-[34px]">
                  <span className={`text-[12px] font-bold ${isToday ? 'text-[#9D4EDD]' : 'text-[#E0E0E0]'}`}>{d}</span>
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

        {/* Mês 2: Próximo Mês */}
        <div 
          className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col"
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
        >
          <div className="text-center text-white text-[12px] font-bold mb-1">{m2Name}</div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, index) => (
              <div key={index} className="text-center text-[#8E8E8E] text-[11px] font-medium">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 flex-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={`empty2-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
            ))}
            {Array.from({ length: 30 }, (_, i) => i + 1).map(d => {
              const hasEvent = d === 5 || d === 18;
              const hasTask = d === 14 || d === 28;
              return (
                <div key={d} className="bg-[#2A2A2C] rounded-[6px] flex flex-col items-center pt-1 pb-1 relative overflow-hidden h-[34px]">
                  <span className="text-[12px] font-bold text-[#E0E0E0]">{d}</span>
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
            {Array.from({ length: 42 - (30 + 2) }).map((_, i) => (
              <div key={`empty2-end-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
            ))}
          </div>
        </div>

        {/* Mês 3: Mês Seguinte */}
        <div 
          className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col"
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
        >
          <div className="text-center text-white text-[12px] font-bold mb-1">{m3Name}</div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, index) => (
              <div key={index} className="text-center text-[#8E8E8E] text-[11px] font-medium">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`empty3-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
            ))}
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
              const hasEvent = d === 8 || d === 20;
              const hasTask = d === 11 || d === 22;
              return (
                <div key={d} className="bg-[#2A2A2C] rounded-[6px] flex flex-col items-center pt-1 pb-1 relative overflow-hidden h-[34px]">
                  <span className="text-[12px] font-bold text-[#E0E0E0]">{d}</span>
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
            {Array.from({ length: 42 - (31 + 4) }).map((_, i) => (
              <div key={`empty3-end-${i}`} className="bg-[#2A2A2C] rounded-[6px] opacity-50"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WidgetWeeklyCalendarPreview({ config }: { config?: any }) {
  const showTasks = config?.weeklyShowTasks ?? true;
  const showEvents = config?.weeklyShowEvents ?? true;
  const splitType = config?.weeklySplitType ?? '12h';
  
  return (
    <div className="bg-[#1C1C1E] rounded-[28px] p-4 w-[340px] shadow-2xl flex flex-col mx-auto font-sans h-[200px]">
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Left side buttons: E (Top), T (Middle), + (Bottom) */}
        <div className="flex flex-col justify-between items-center mr-3 shrink-0 h-full py-1">
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-[#121212] cursor-pointer shadow ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'}`}>E</div>
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-white cursor-pointer shadow ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'}`}>T</div>
          <button className="w-7 h-7 rounded-full flex items-center justify-center text-[#FFFFFF] bg-[#9D4EDD] shadow cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>

        {/* Main Grid: 21 Days (3 Weeks) Scrollable com Snap de Página Inteira */}
        <div 
          className="flex flex-1 overflow-x-auto snap-x snap-mandatory scroll-smooth custom-scrollbar pb-1 h-full"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <div className="flex w-full items-stretch h-full">
            {/* Semana 1 (7 Dias: Domingo a Sábado) */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1 h-full"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {Array.from({ length: 7 }).map((_, i) => {
                const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
                const letter = daysLetters[i];
                const d = 9 + i; // 9 (Dom) a 15 (Sáb)
                const hasEventAM = d === 10;
                const hasEventPM = d === 15;
                const hasTaskAM = d === 12;
                const hasTaskPM = d === 10;
                return (
                  <div key={d} className="flex flex-col relative h-full w-full">
                    <span className="text-center text-[#8E8E8E] text-[10px] font-medium mb-0.5">{letter}</span>
                    <span className={`text-[11px] text-center font-bold mb-1 ${d === 10 ? 'text-[#9D4EDD]' : 'text-[#E0E0E0]'}`}>{d}</span>
                    
                    {splitType === '8h' ? (
                      <div className="flex-1 flex flex-col w-full h-full gap-[3px]">
                        <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                          {showEvents && hasEventAM && (
                            <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                            </div>
                          )}
                        </div>
                        <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                          {showTasks && hasTaskAM && (
                            <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                            </div>
                          )}
                        </div>
                        <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                          {showEvents && hasEventPM && (
                            <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : splitType === '12h' ? (
                      <div className="flex-1 flex flex-col w-full h-full gap-[3px]">
                        <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                          {showEvents && hasEventAM && (
                            <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                            </div>
                          )}
                          {showTasks && hasTaskAM && (
                            <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px] mt-[1px]">
                              <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                            </div>
                          )}
                        </div>
                        <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                          {showEvents && hasEventPM && (
                            <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                            </div>
                          )}
                          {showTasks && hasTaskPM && (
                            <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px] mt-[1px]">
                              <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 w-full bg-[#2A2A2C] rounded-[6px] flex flex-col items-center justify-end pb-1 px-1 h-full relative">
                        <div className="flex flex-col gap-[2px] w-full">
                          {showEvents && (hasEventAM || hasEventPM) && (
                            <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                            </div>
                          )}
                          {showTasks && (hasTaskAM || hasTaskPM) && (
                            <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                              <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Divisor Roxo 1 */}
            <div className="w-[2px] bg-[#9D4EDD] rounded-full my-1 mx-1.5 self-stretch shrink-0" />

            {/* Semana 2 */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1 h-full"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {Array.from({ length: 7 }).map((_, i) => {
                const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
                const letter = daysLetters[i];
                const d = 16 + i;
                const hasEventAM = d === 17;
                const hasTaskPM = d === 19;
                return (
                  <div key={d} className="flex flex-col relative h-full w-full">
                    <span className="text-center text-[#8E8E8E] text-[10px] font-medium mb-0.5">{letter}</span>
                    <span className="text-[11px] text-center font-bold mb-1 text-[#E0E0E0]">{d}</span>
                    <div className="flex-1 flex flex-col w-full h-full gap-[3px]">
                      <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                        {showEvents && hasEventAM && (
                          <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                            <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                          </div>
                        )}
                      </div>
                      <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                        {showTasks && hasTaskPM && (
                          <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                            <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divisor Roxo 2 */}
            <div className="w-[2px] bg-[#9D4EDD] rounded-full my-1 mx-1.5 self-stretch shrink-0" />

            {/* Semana 3 */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1 h-full"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {Array.from({ length: 7 }).map((_, i) => {
                const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
                const letter = daysLetters[i];
                const d = 23 + i;
                const hasEventAM = d === 24;
                const hasTaskPM = d === 27;
                return (
                  <div key={d} className="flex flex-col relative h-full w-full">
                    <span className="text-center text-[#8E8E8E] text-[10px] font-medium mb-0.5">{letter}</span>
                    <span className="text-[11px] text-center font-bold mb-1 text-[#E0E0E0]">{d}</span>
                    <div className="flex-1 flex flex-col w-full h-full gap-[3px]">
                      <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                        {showEvents && hasEventAM && (
                          <div className="bg-[#FFCC00] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                            <span className="text-[#121212] text-[6px] font-bold truncate leading-none">Dem...</span>
                          </div>
                        )}
                      </div>
                      <div className="bg-[#2A2A2C] rounded-[4px] flex-1 flex flex-col items-center justify-center w-full px-[1px]">
                        {showTasks && hasTaskPM && (
                          <div className="bg-[#9D4EDD] rounded-[3px] w-full h-[11px] flex items-center justify-center px-[1px]">
                            <span className="text-white text-[6px] font-bold truncate leading-none">Tar...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WidgetGlobalPreview({ tasks, config }: { tasks?: any[]; config?: any }) {
  const showTasks = config?.weeklyShowTasks ?? true;
  const showEvents = config?.weeklyShowEvents ?? true;
  const selectedDim = config?.selectedDimension && config?.selectedDimension !== 'Todas' ? config.selectedDimension : 'Dimensões';

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const currentDate = new Date();
  const currentMonthIdx = currentDate.getMonth();

  const m1Name = monthNames[currentMonthIdx % 12];
  const m2Name = monthNames[(currentMonthIdx + 1) % 12];
  const m3Name = monthNames[(currentMonthIdx + 2) % 12];

  return (
    <div className="bg-[#1C1C1E] rounded-[28px] p-3 w-[360px] h-[380px] shadow-2xl flex flex-col mx-auto font-sans overflow-hidden">
      {/* Global Top Header: Dimensões (Left) and E, T, + (Right) */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#2D2D2D]">
        <div className="flex items-center gap-1 cursor-pointer hover:opacity-80">
          <span className="text-white text-[12px] font-bold">{selectedDim}</span>
          <span className="material-symbols-outlined text-[#A0A0A0] text-[16px]">expand_more</span>
        </div>

        <div className="flex items-center gap-5">
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-[#121212] cursor-pointer shadow ${showEvents ? 'bg-[#FFCC00]' : 'bg-[#FFCC00]/20'}`}>E</div>
          <div className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-white cursor-pointer shadow ${showTasks ? 'bg-[#9D4EDD]' : 'bg-[#9D4EDD]/20'}`}>T</div>
          <button className="w-7 h-7 rounded-full flex items-center justify-center text-[#FFFFFF] bg-[#9D4EDD] shadow cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>

      {/* Middle Half: 50% Month Calendar / 50% List */}
      <div className="flex flex-1 gap-2 border-b border-[#2D2D2D] pb-2 overflow-hidden">
        {/* Top Left: Calendário Mensal com Rolagem Dura de 3 Meses (Começando no Mês Atual) */}
        <div className="w-1/2 flex flex-col pr-1 border-r border-[#2D2D2D] overflow-hidden">
          <div 
            className="flex-1 overflow-x-auto snap-x snap-mandatory scroll-smooth custom-scrollbar flex"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {/* Mês 1: Mês Atual */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col pr-1"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-[11px] font-bold">{m1Name}</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[#8E8E8E] text-[8px] font-medium">
                <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 flex-1 overflow-y-auto custom-scrollbar">
                {Array.from({ length: 31 }).map((_, i) => {
                  const d = i + 1;
                  const hasE = d === 5 || d === 14 || d === 28;
                  const hasT = d === 10 || d === 20 || d === 31;
                  return (
                    <div key={i} className="bg-[#2A2A2C] rounded flex flex-col items-center justify-between p-0.5 h-[18px]">
                      <span className={`text-[8px] font-medium leading-none ${d === currentDate.getDate() ? 'text-[#9D4EDD] font-bold' : 'text-[#E0E0E0]'}`}>{d}</span>
                      <div className="w-full flex gap-0.5">
                        {hasE && <div className="flex-1 bg-[#FFCC00] h-[2px] rounded-[1px]" />}
                        {hasT && <div className="flex-1 bg-[#9D4EDD] h-[2px] rounded-[1px]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mês 2: Próximo Mês */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col pr-1"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-[11px] font-bold">{m2Name}</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[#8E8E8E] text-[8px] font-medium">
                <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 flex-1 overflow-y-auto custom-scrollbar">
                {Array.from({ length: 31 }).map((_, i) => {
                  const d = i + 1;
                  const hasE = d === 5 || d === 14 || d === 28;
                  const hasT = d === 10 || d === 20 || d === 31;
                  return (
                    <div key={i} className="bg-[#2A2A2C] rounded flex flex-col items-center justify-between p-0.5 h-[18px]">
                      <span className="text-[8px] text-[#E0E0E0] font-medium leading-none">{d}</span>
                      <div className="w-full flex gap-0.5">
                        {hasE && <div className="flex-1 bg-[#FFCC00] h-[2px] rounded-[1px]" />}
                        {hasT && <div className="flex-1 bg-[#9D4EDD] h-[2px] rounded-[1px]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mês 3: Mês Seguinte */}
            <div 
              className="w-full min-w-full snap-start snap-always shrink-0 flex flex-col pr-1"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-[11px] font-bold">{m3Name}</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[#8E8E8E] text-[8px] font-medium">
                <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 flex-1 overflow-y-auto custom-scrollbar">
                {Array.from({ length: 31 }).map((_, i) => {
                  const d = i + 1;
                  const hasE = d === 3 || d === 12;
                  const hasT = d === 8 || d === 22;
                  return (
                    <div key={i} className="bg-[#2A2A2C] rounded flex flex-col items-center justify-between p-0.5 h-[18px]">
                      <span className="text-[8px] text-[#E0E0E0] font-medium leading-none">{d}</span>
                      <div className="w-full flex gap-0.5">
                        {hasE && <div className="flex-1 bg-[#FFCC00] h-[2px] rounded-[1px]" />}
                        {hasT && <div className="flex-1 bg-[#9D4EDD] h-[2px] rounded-[1px]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Top Right: Lista de Tarefas / Eventos com Rolagem Suave */}
        <div className="w-1/2 flex flex-col pl-1 overflow-hidden">
          <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            <div className="bg-[#9D4EDD]/15 border border-[#9D4EDD]/30 rounded-lg p-1.5 flex items-center justify-between">
              <span className="text-white text-[10px] font-medium truncate flex-1 mr-1">Consulta médica</span>
              <span className="bg-[#9D4EDD]/40 text-[#FFCC00] text-[8px] font-bold px-1 rounded">Hoje</span>
            </div>
            <div className="bg-[#FFCC00] rounded-lg p-1.5 flex flex-col">
              <span className="text-[#121212] text-[10px] font-bold truncate">Aniversário Jorge</span>
              <span className="text-[#121212]/80 text-[8px] font-bold">19:30</span>
            </div>
            <div className="bg-[#3B82F6]/15 border border-[#3B82F6]/30 rounded-lg p-1.5 flex items-center justify-between">
              <span className="text-white text-[10px] font-medium truncate flex-1 mr-1">Aula de math</span>
              <span className="bg-[#3B82F6]/40 text-[#FFCC00] text-[8px] font-bold px-1 rounded">1d</span>
            </div>
            <div className="bg-[#9D4EDD]/15 border border-[#9D4EDD]/30 rounded-lg p-1.5 flex items-center justify-between">
              <span className="text-white text-[10px] font-medium truncate flex-1 mr-1">Reunião de trabalho</span>
              <span className="bg-[#9D4EDD]/40 text-[#FFCC00] text-[8px] font-bold px-1 rounded">2d</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Half: Semanal Horizontal com Rolagem Dura (3 Semanas de Páginas Inteiras) */}
      <div 
        className="pt-2 overflow-x-auto snap-x snap-mandatory scroll-smooth custom-scrollbar flex items-center w-full"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex w-full pb-2 items-center">
          {/* Semana 1 */}
          <div 
            className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            {Array.from({ length: 7 }).map((_, i) => {
              const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
              const letter = daysLetters[i];
              const d = 9 + i;
              const hasEvent = d % 3 === 0;
              const hasTask = d % 2 === 0;
              return (
                <div key={d} className="flex flex-col items-center bg-[#2A2A2C] rounded-md p-1 flex-1 min-h-[90px]">
                  <span className="text-[#8E8E8E] text-[9px] font-medium mb-0.5">{letter}</span>
                  <span className={`text-[11px] font-bold mb-1 ${d === 10 ? 'text-[#9D4EDD]' : 'text-[#E0E0E0]'}`}>{d}</span>
                  <div className="w-full flex-1 flex flex-col gap-1 justify-center">
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasEvent && (
                        <div className="bg-[#FFCC00] rounded px-0.5 py-0.2">
                          <span className="text-[#121212] text-[6px] font-bold block truncate leading-none">Dem...</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasTask && (
                        <div className="bg-[#9D4EDD] rounded px-0.5 py-0.2">
                          <span className="text-white text-[6px] font-bold block truncate leading-none">Tar...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Purple Divider 1 */}
          <div className="w-[2px] bg-[#9D4EDD] rounded-full my-1 mx-1 self-stretch shrink-0" />

          {/* Semana 2 */}
          <div 
            className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            {Array.from({ length: 7 }).map((_, i) => {
              const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
              const letter = daysLetters[i];
              const d = 16 + i;
              const hasEvent = d % 3 === 0;
              const hasTask = d % 2 === 0;
              return (
                <div key={d} className="flex flex-col items-center bg-[#2A2A2C] rounded-md p-1 flex-1 min-h-[90px]">
                  <span className="text-[#8E8E8E] text-[9px] font-medium mb-0.5">{letter}</span>
                  <span className="text-[11px] font-bold mb-1 text-[#E0E0E0]">{d}</span>
                  <div className="w-full flex-1 flex flex-col gap-1 justify-center">
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasEvent && (
                        <div className="bg-[#FFCC00] rounded px-0.5 py-0.2">
                          <span className="text-[#121212] text-[6px] font-bold block truncate leading-none">Dem...</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasTask && (
                        <div className="bg-[#9D4EDD] rounded px-0.5 py-0.2">
                          <span className="text-white text-[6px] font-bold block truncate leading-none">Tar...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Purple Divider 2 */}
          <div className="w-[2px] bg-[#9D4EDD] rounded-full my-1 mx-1 self-stretch shrink-0" />

          {/* Semana 3 */}
          <div 
            className="w-full min-w-full snap-start snap-always shrink-0 grid grid-cols-7 gap-1"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            {Array.from({ length: 7 }).map((_, i) => {
              const daysLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
              const letter = daysLetters[i];
              const d = 23 + i;
              const hasEvent = d % 3 === 0;
              const hasTask = d % 2 === 0;
              return (
                <div key={d} className="flex flex-col items-center bg-[#2A2A2C] rounded-md p-1 flex-1 min-h-[90px]">
                  <span className="text-[#8E8E8E] text-[9px] font-medium mb-0.5">{letter}</span>
                  <span className="text-[11px] font-bold mb-1 text-[#E0E0E0]">{d}</span>
                  <div className="w-full flex-1 flex flex-col gap-1 justify-center">
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasEvent && (
                        <div className="bg-[#FFCC00] rounded px-0.5 py-0.2">
                          <span className="text-[#121212] text-[6px] font-bold block truncate leading-none">Dem...</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#1C1C1E] rounded p-0.5 flex flex-col gap-0.5 min-h-[26px] justify-center">
                      {hasTask && (
                        <div className="bg-[#9D4EDD] rounded px-0.5 py-0.2">
                          <span className="text-white text-[6px] font-bold block truncate leading-none">Tar...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

