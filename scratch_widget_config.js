const fs = require('fs');

const path = './src/app/configurar-widget/WidgetConfigClient.tsx';
let code = fs.readFileSync(path, 'utf8');

// Inject imports for WidgetPreviews
code = code.replace(
  "import { Capacitor } from '@capacitor/core';",
  "import { Capacitor } from '@capacitor/core';\nimport { WidgetTasksPreview, WidgetCalendarPreview, WidgetEventsPreview } from '@/components/dashboard/WidgetPreviews';"
);

// Inject activeTab state
code = code.replace(
  "const [isSaving, setIsSaving] = useState(false);",
  "const [isSaving, setIsSaving] = useState(false);\n  const [activeTab, setActiveTab] = useState<'tarefas' | 'calendario' | 'eventos'>('tarefas');"
);

// Add Tab selector and previews in return statement
const newReturnTop = `
  return (
    <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4 md:p-6 shadow-xl max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00]">widgets</span>
            Configurar Widgets
          </h2>
          <p className="text-sm text-[#A0A0A0] mt-1">
            Personalize os widgets que aparecem na tela inicial do seu celular.
          </p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#9D4EDD] hover:bg-[#8534C1] text-white px-6 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[18px]">save</span>
          )}
          {isSaving ? 'Salvando...' : 'Salvar Preferências'}
        </button>
      </div>

      {savedSuccess && (
        <div className="bg-[#26a69a]/20 border border-[#26a69a] text-[#26a69a] px-4 py-3 rounded mb-6 flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined">check_circle</span>
          Configurações salvas com sucesso! O widget será atualizado em breve.
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2D2D2D] mb-8 pb-1 overflow-x-auto custom-scrollbar">
        {[
          { id: 'tarefas', label: 'Tarefas', icon: 'task_alt' },
          { id: 'calendario', label: 'Calendário', icon: 'calendar_month' },
          { id: 'eventos', label: 'Eventos (Lista)', icon: 'event_list' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={\`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${activeTab === tab.id ? 'border-[#9D4EDD] text-[#9D4EDD]' : 'border-transparent text-[#8E8E8E] hover:text-white'}\`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Lado Esquerdo: Configurações */}
        <div className="space-y-6">
          {activeTab === 'tarefas' && (
            <>
`;

// Find where the old return starts and replace up to " {/* 1. Statuses Ocultos */}"
const returnStartStr = 'return (';
const startIdx = code.indexOf(returnStartStr);
const statusesIdx = code.indexOf('{/* 1. Statuses Ocultos */}');

let oldReturnTop = code.substring(startIdx, statusesIdx);
code = code.replace(oldReturnTop, newReturnTop);

// Now wrap the rest of the settings in the appropriate divs and add previews to the right column
const newReturnBottom = `
            </>
          )}

          {activeTab === 'calendario' && (
            <div className="text-[#8E8E8E] text-sm">
              <h3 className="text-white font-bold mb-4">Widget de Calendário</h3>
              <p className="mb-4">Este widget mostrará uma grade mensal ou semanal com pontos indicativos para os dias que possuem tarefas ou eventos agendados.</p>
              <div className="bg-[#252525] border border-[#333333] p-4 rounded-lg flex flex-col gap-3">
                <label className="flex items-center justify-between text-white">
                  <span>Modo Padrão</span>
                  <select className="bg-[#121212] border border-[#2D2D2D] rounded p-1 text-xs">
                    <option>Mensal</option>
                    <option>Semanal</option>
                  </select>
                </label>
                <label className="flex items-center justify-between text-white">
                  <span>Mostrar Pontos (Cores)</span>
                  <input type="checkbox" className="accent-[#9D4EDD]" defaultChecked />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'eventos' && (
            <div className="text-[#8E8E8E] text-sm">
              <h3 className="text-white font-bold mb-4">Widget de Eventos</h3>
              <p className="mb-4">Este widget mostrará os seus próximos eventos agendados em formato de lista horizontal rolável.</p>
              <div className="bg-[#252525] border border-[#333333] p-4 rounded-lg flex flex-col gap-3">
                <label className="flex items-center justify-between text-white">
                  <span>Limite de Eventos</span>
                  <input type="number" defaultValue={5} min={1} max={10} className="w-16 bg-[#121212] border border-[#2D2D2D] rounded p-1 text-xs text-center" />
                </label>
              </div>
            </div>
          )}

        </div>

        {/* Lado Direito: Preview */}
        <div className="flex flex-col border border-[#2D2D2D] rounded-xl bg-[#1A1A1A] overflow-hidden">
          <div className="bg-[#252525] p-3 border-b border-[#2D2D2D] text-center">
            <span className="text-[#E0E0E0] text-xs font-bold uppercase tracking-wider">Preview do Widget Android</span>
          </div>
          <div className="flex-1 p-8 flex items-center justify-center bg-[#121212]/50" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"%23252525\\" fill-opacity=\\"0.4\\" fill-rule=\\"evenodd\\"%3E%3Ccircle cx=\\"3\\" cy=\\"3\\" r=\\"1\\"/%3E%3Ccircle cx=\\"13\\" cy=\\"13\\" r=\\"1\\"/%3E%3C/g%3E%3C/svg%3E")' }}>
            {activeTab === 'tarefas' && <WidgetTasksPreview tasks={tasks} config={{ hiddenStatuses, hiddenTaskIds, sortOrder, selectedDimension }} />}
            {activeTab === 'calendario' && <WidgetCalendarPreview />}
            {activeTab === 'eventos' && <WidgetEventsPreview events={[]} />}
          </div>
        </div>
      </div>
    </div>
  );
}
`;

// Replace the end of the return statement (from closing tags up to end of file)
const endOfSettingsIdx = code.indexOf('        </div>\n    </div>\n  );\n}');
code = code.substring(0, endOfSettingsIdx) + newReturnBottom;

fs.writeFileSync(path, code);
console.log("WidgetConfigClient.tsx refactored with tabs and previews!");
