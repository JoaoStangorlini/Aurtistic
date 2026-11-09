const fs = require('fs');

// 1. Update TasksView.tsx
const tvPath = './src/components/dashboard/TasksView.tsx';
let tvCode = fs.readFileSync(tvPath, 'utf8');

const tvOldProp = `initialQuickSorts = ['status', 'prazo', 'prioridade', 'manual'] }: { initialTasks: Task[], initialEvents?: AgendaEvent[], displayMode?: 'tarefas' | 'eventos' | 'ambos', initialColumns?: TaskColumn[], isPersonalScope?: boolean, userId?: string, initialQuickFilters?: string[], initialQuickSorts?: string[] }) {`;

const tvNewProp = `initialQuickSorts = ['status', 'prazo', 'prioridade', 'manual'], advancedSettings = {} }: { initialTasks: Task[], initialEvents?: AgendaEvent[], displayMode?: 'tarefas' | 'eventos' | 'ambos', initialColumns?: TaskColumn[], isPersonalScope?: boolean, userId?: string, initialQuickFilters?: string[], initialQuickSorts?: string[], advancedSettings?: any }) {
  const enableSubtasks = advancedSettings.enable_subtasks !== false;
  const enableAdminFilters = advancedSettings.enable_admin_filters !== false;`;

tvCode = tvCode.replace(tvOldProp, tvNewProp);

// Update globalQuery logic if enableAdminFilters is false
const oldAdmin1 = `if (userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {`;
const newAdmin1 = `if (userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' && enableAdminFilters) {`;
tvCode = tvCode.replace(oldAdmin1, newAdmin1);

const oldAdmin2 = `} else if (userId === '7dcfe172-1cf0-4389-9abd-f340b1408386') {`;
const newAdmin2 = `} else if (userId === '7dcfe172-1cf0-4389-9abd-f340b1408386' && enableAdminFilters) {`;
tvCode = tvCode.replace(oldAdmin2, newAdmin2);

// Hide subtask rendering: buildTaskTree logic
// Search for buildTaskTree and flatten if !enableSubtasks
const oldTreeLogic = `const buildTaskTree = (flatTasks: Task[]) => {`;
const newTreeLogic = `const buildTaskTree = (flatTasks: Task[]) => {
    if (!enableSubtasks) {
      return flatTasks.map(t => ({ ...t, children: [], isExpanded: false }));
    }`;
tvCode = tvCode.replace(oldTreeLogic, newTreeLogic);

fs.writeFileSync(tvPath, tvCode);

// 2. Update AurtisticWorkspaceClient.tsx to hide sidebar if !enableWorkspaces
const awPath = './src/components/dashboard/AurtisticWorkspaceClient.tsx';
let awCode = fs.readFileSync(awPath, 'utf8');

// Add enableWorkspaces
const awRenderStart = `  const isToolsActive = Object.values(toolsConfig).some(v => v);`;
const awRenderNew = `  const enableWorkspaces = profile?.features_config?.advanced_settings?.enable_workspaces !== false;
  const isToolsActive = Object.values(toolsConfig).some(v => v);`;
awCode = awCode.replace(awRenderStart, awRenderNew);

// Pass advancedSettings to TasksView
const tvCallOld = `          <TasksView 
            initialTasks={getCurrentTasks()} 
            initialEvents={getCurrentEvents()}
            displayMode={displayMode}
            initialColumns={columns} 
            isPersonalScope={false} 
            userId={userId}
            initialQuickFilters={profile?.quick_filters || ['responsavel', 'dimensao']} 
            initialQuickSorts={profile?.quick_sorts || ['status', 'prazo', 'prioridade', 'manual']}
          />`;
const tvCallNew = `          <TasksView 
            initialTasks={getCurrentTasks()} 
            initialEvents={getCurrentEvents()}
            displayMode={displayMode}
            initialColumns={columns} 
            isPersonalScope={false} 
            userId={userId}
            initialQuickFilters={profile?.quick_filters || ['responsavel', 'dimensao']} 
            initialQuickSorts={profile?.quick_sorts || ['status', 'prazo', 'prioridade', 'manual']}
            advancedSettings={profile?.features_config?.advanced_settings || {}}
          />`;
awCode = awCode.replace(tvCallOld, tvCallNew);

// Hide sidebar
const sideOld = `<div className="w-64 bg-[#1A1A1A] border-r border-[#2D2D2D] flex flex-col h-full flex-shrink-0">`;
const sideNew = `<div className={\`w-64 bg-[#1A1A1A] border-r border-[#2D2D2D] flex flex-col h-full flex-shrink-0 \${!enableWorkspaces ? 'hidden' : ''}\`}>`;
awCode = awCode.replace(sideOld, sideNew);

fs.writeFileSync(awPath, awCode);

console.log('TasksView and WorkspaceClient patched.');
