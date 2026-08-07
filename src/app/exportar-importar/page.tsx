'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ExportImportPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
      }
      setLoading(false);
    });
  }, [supabase]);

  const handleExportTasksCSV = async () => {
    if (!user) return;
    let query = supabase.from('tasks').select('*');
    
    if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
      // Admin: Pega tudo dele + compartilhadas
      query = query.or(`user_id.eq.${user.id},is_personal.is.null,is_personal.eq.false`);
    } else if (user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
      // LabDiv: Pega as dele + HUB compartilhadas
      query = query.or(`user_id.eq.${user.id},and(dimensao.eq.HUB,or(is_personal.is.null,is_personal.eq.false))`);
    } else {
      // Normal user: Apenas as pessoais dele
      query = query.eq('is_personal', true).eq('user_id', user.id);
    }
    
    const { data } = await query;
    if (data && data.length > 0) {
      const { downloadCSV } = await import('@/utils/csv');
      downloadCSV(data, `aurtistic_tarefas_${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      alert("Você não possui tarefas para exportar.");
    }
  };

  const handleImportTasksCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    try {
      const { parseTasksFromCSV } = await import('@/utils/csv');
      const tasks = await parseTasksFromCSV(file);
      if (tasks.length === 0) {
        alert("O arquivo CSV está vazio ou inválido.");
        return;
      }
      
      const { saveTask } = await import('@/lib/offlineActions');
      for (const t of tasks) {
        await saveTask({ ...t, user_id: user.id });
      }
      
      alert(`${tasks.length} tarefas importadas com sucesso!`);
      router.refresh();
    } catch (err) {
      alert("Erro ao importar CSV: " + String(err));
    }
    e.target.value = '';
  };

  const handleExportEventsCSV = async () => {
    if (!user) return;
    const { data } = await supabase.from('events').select('*').eq('user_id', user.id);
    
    if (data && data.length > 0) {
      const { downloadEventsCSV } = await import('@/utils/csv');
      downloadEventsCSV(data, `aurtistic_eventos_${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      alert("Você não possui eventos para exportar.");
    }
  };

  const handleImportEventsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    try {
      const { parseEventsFromCSV } = await import('@/utils/csv');
      const events = await parseEventsFromCSV(file);
      if (events.length === 0) {
        alert("O arquivo CSV está vazio ou inválido.");
        return;
      }
      
      const eventsToInsert = events.map(ev => ({ ...ev, user_id: user.id }));
      const { error } = await supabase.from('events').insert(eventsToInsert);
      
      if (error) throw error;
      
      alert(`${events.length} eventos importados com sucesso!`);
      router.refresh();
    } catch (err) {
      alert("Erro ao importar CSV: " + String(err));
    }
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-[#2D2D2D] animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8 mt-16">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-[#A0A0A0] hover:text-[#9D4EDD] transition-colors mb-4">
            <span className="material-symbols-outlined">arrow_back</span>
            Voltar para Dashboard
          </Link>
          <h1 className="text-3xl font-bold font-bukra">Exportar e Importar Dados</h1>
          <p className="text-[#A0A0A0] mt-2 font-opensans">
            Gerencie seus dados. Você pode fazer backup das suas tarefas e eventos, ou importar dados de outras plataformas via arquivo CSV.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Tarefas */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#FFCC00] text-3xl">task_alt</span>
              <h2 className="text-xl font-bold font-bukra">Tarefas</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <button 
                  onClick={handleExportTasksCSV}
                  className="w-full flex items-center justify-center gap-2 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white py-3 px-4 rounded-lg transition-colors font-medium"
                >
                  <span className="material-symbols-outlined">download</span>
                  Baixar Tarefas (CSV)
                </button>
                <p className="text-sm text-[#A0A0A0] font-opensans">
                  Gera um arquivo CSV com todas as suas tarefas ativas, ideal para backup ou uso em planilhas.
                </p>
              </div>

              <div className="space-y-2">
                <label className="w-full flex items-center justify-center gap-2 bg-[#9D4EDD]/10 text-[#9D4EDD] hover:bg-[#9D4EDD]/20 border border-[#9D4EDD]/30 py-3 px-4 rounded-lg transition-colors font-medium cursor-pointer">
                  <span className="material-symbols-outlined">upload</span>
                  Importar Tarefas (CSV)
                  <input type="file" accept=".csv" className="hidden" onChange={handleImportTasksCSV} />
                </label>
                <p className="text-sm text-[#A0A0A0] font-opensans">
                  Importa tarefas a partir de um arquivo CSV. O arquivo deve conter cabeçalhos como Nome, Descrição, etc.
                </p>
              </div>
            </div>
          </div>

          {/* Eventos */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#00E5FF] text-3xl">event</span>
              <h2 className="text-xl font-bold font-bukra">Eventos</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <button 
                  onClick={handleExportEventsCSV}
                  className="w-full flex items-center justify-center gap-2 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white py-3 px-4 rounded-lg transition-colors font-medium"
                >
                  <span className="material-symbols-outlined">download</span>
                  Baixar Eventos (CSV)
                </button>
                <p className="text-sm text-[#A0A0A0] font-opensans">
                  Gera um arquivo CSV com todos os seus eventos da agenda.
                </p>
              </div>

              <div className="space-y-2">
                <label className="w-full flex items-center justify-center gap-2 bg-[#9D4EDD]/10 text-[#9D4EDD] hover:bg-[#9D4EDD]/20 border border-[#9D4EDD]/30 py-3 px-4 rounded-lg transition-colors font-medium cursor-pointer">
                  <span className="material-symbols-outlined">upload</span>
                  Importar Eventos (CSV)
                  <input type="file" accept=".csv" className="hidden" onChange={handleImportEventsCSV} />
                </label>
                <p className="text-sm text-[#A0A0A0] font-opensans">
                  Importa eventos a partir de um arquivo CSV.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
