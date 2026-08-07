const fs = require('fs');
let content = fs.readFileSync('src/app/configurar-notificacoes/NotificationsConfigClient.tsx', 'utf8');

const replacement = `
  return (
    <>
      {hasChanges && !savedSuccess && (
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
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
`;

content = content.replace('  return (\n    <div className="max-w-4xl mx-auto space-y-8">', replacement);

const endReplacement = `
    </div>
    </>
  );
`;

content = content.replace('    </div>\n  );\n}', endReplacement + '\n}');

fs.writeFileSync('src/app/configurar-notificacoes/NotificationsConfigClient.tsx', content);
console.log('NotificationsConfigClient.tsx patcheado!');
