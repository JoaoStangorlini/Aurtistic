const fs = require('fs');
let content = fs.readFileSync('src/app/configurar-widget/WidgetConfigClient.tsx', 'utf8');

// Adicionar isDirty state
content = content.replace(
  'const [savedSuccess, setSavedSuccess] = useState(false);',
  'const [savedSuccess, setSavedSuccess] = useState(false);\n  const [isDirty, setIsDirty] = useState(false);'
);

// Marcar como dirty nas funções de toggle
content = content.replace(
  'const toggleTaskVisibility = (taskId: string) => {\n    setHiddenTaskIds(prev => \n      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]\n    );\n  };',
  'const toggleTaskVisibility = (taskId: string) => {\n    setIsDirty(true);\n    setHiddenTaskIds(prev => \n      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]\n    );\n  };'
);

content = content.replace(
  'const toggleStatusVisibility = (status: string) => {\n    setHiddenStatuses(prev => \n      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]\n    );\n  };',
  'const toggleStatusVisibility = (status: string) => {\n    setIsDirty(true);\n    setHiddenStatuses(prev => \n      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]\n    );\n  };'
);

// Marcar dirty no setSelectedDimension e setSortOrder. Estes podem estar no JSX.
// Vamos procurar as strings exatas para fazer replace
content = content.replace(
  /onChange=\{\(e\) => setSelectedDimension\(e\.target\.value\)\}/g,
  'onChange={(e) => { setIsDirty(true); setSelectedDimension(e.target.value); }}'
);
content = content.replace(
  /onChange=\{\(e\) => setSortOrder\(e\.target\.value\)\}/g,
  'onChange={(e) => { setIsDirty(true); setSortOrder(e.target.value); }}'
);

// Reseta o dirty no save
content = content.replace(
  'setSavedSuccess(true);',
  'setSavedSuccess(true);\n      setIsDirty(false);'
);

// Adicionar o alert renderizado no top
const replacement = `
  return (
    <>
      {isDirty && !savedSuccess && (
        <div className="fixed top-24 right-4 md:right-8 z-50 bg-[#9D4EDD] text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 border border-[#9D4EDD]/50 animate-pulse">
          <span className="material-symbols-outlined">save</span>
          <div className="flex flex-col">
            <span className="font-bold text-sm">Alterações não salvas</span>
            <span className="text-xs font-medium">Lembre-se de salvar!</span>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="ml-2 bg-[#121212] text-[#9D4EDD] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#2D2D2D] transition-colors disabled:opacity-50">
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}
    <div className="max-w-7xl mx-auto space-y-8 pb-32">
`;

content = content.replace('  return (\n    <div className="max-w-7xl mx-auto space-y-8 pb-32">', replacement);
content = content.replace('  return (\n    <div className="max-w-7xl mx-auto space-y-8">', replacement); // just in case

const endReplacement = `
    </div>
    </>
  );
`;

content = content.replace('    </div>\n  );\n}', endReplacement + '\n}');

fs.writeFileSync('src/app/configurar-widget/WidgetConfigClient.tsx', content);
console.log('WidgetConfigClient.tsx patcheado!');
