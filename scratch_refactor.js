const fs = require('fs');

const path = './src/components/dashboard/TaskCalendar.tsx';
let code = fs.readFileSync(path, 'utf8');

// The file is currently standard. We want to add hours filter state and change the return render.
// I will just use a regex or string split to inject the states at the top.

const stateInjection = `
  const [selectedDateStr, setSelectedDateStr] = React.useState<string | null>(null);
  const [hoursFilterMode, setHoursFilterMode] = React.useState<'all_day'|'morning'|'afternoon'|'night'|'only_items'|'custom'>('all_day');
  const [customStartHour, setCustomStartHour] = React.useState<number>(7);
  const [customEndHour, setCustomEndHour] = React.useState<number>(23);
`;

code = code.replace(/const \[selectedDateStr.*null\);/, stateInjection);

// Now I will inject the weekly grid render into the return statement.
// The return statement starts at: return (\n    <div className="flex flex-col w-full mt-4 bg-[#121212] rounded-lg border border-[#2D2D2D] overflow-hidden">
// We can find `{/* Calendar Grid */}` and replace the rest.

let topHalf = code.split('{/* Calendar Grid */}')[0];

const newGrid = `
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
                className={\`px-3 py-1 rounded text-[11px] font-bold transition-colors \${hoursFilterMode === mode ? 'bg-[#9D4EDD] text-white' : 'bg-[#252525] text-[#8E8E8E] hover:text-white'}\`}
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
                  <div className={\`text-sm font-bold \${item.date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0] ? 'text-[#9D4EDD]' : 'text-white'}\`}>
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
`;

fs.writeFileSync(path, topHalf + '{/* Calendar Grid */}\n' + newGrid);
console.log("Updated TaskCalendar.tsx");
