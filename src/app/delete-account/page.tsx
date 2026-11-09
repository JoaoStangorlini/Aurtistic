// Este programa é um software livre (Licença AGPLv3)
'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAurtisticProfile, deleteAllTasks } from '@/app/(dashboard)/aurtistic/actions';
import { createClient } from '@/utils/supabase/client';
import { saveUserProfileData } from '@/app/(dashboard)/actions';

export default function DeleteAccountPage() {
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isDeletingTasks, setIsDeletingTasks] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('*').eq('id', user.id).single().then(({ data }) => {
          if (data) setProfile(data);
        });
      }
    });
  }, [supabase]);

  const handleDeleteSelectedData = async () => {
    if (!confirm("Tem certeza que deseja apagar permanentemente os dados das páginas selecionadas? Essa ação não pode ser desfeita.")) {
      return;
    }
    
    setIsClearing(true);
    try {
      const dataToReset: any = {};
      let updatedFeaturesConfig = { ...(profile?.features_config || {}) };
      
      if (selectedToDelete.includes('resumo')) {
        dataToReset.resumo = null;
      }
      if (selectedToDelete.includes('curriculo')) {
        dataToReset.curriculo = [];
      }
      if (selectedToDelete.includes('portfolio')) {
        dataToReset.portfolio = [];
        if (updatedFeaturesConfig.gallery_iframe_url) {
          delete updatedFeaturesConfig.gallery_iframe_url;
        }
        if (updatedFeaturesConfig.gallery_iframe_title) {
          delete updatedFeaturesConfig.gallery_iframe_title;
        }
        dataToReset.features_config = updatedFeaturesConfig;
      }
      
      await saveUserProfileData(dataToReset);
      
      setProfile({
        ...profile,
        ...dataToReset
      });
      
      setSelectedToDelete([]);
      alert("Conteúdo das páginas selecionadas foi apagado com sucesso!");
    } catch (e) {
      alert("Erro ao excluir dados: " + String(e));
    } finally {
      setIsClearing(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirm('ATENÇÃO: Você está prestes a excluir PERMANENTEMENTE todas as suas tarefas e seu perfil. Tem certeza disso?')) return;
    
    setIsDeletingProfile(true);
    try {
      await deleteAurtisticProfile();
    } catch (err: any) {
      if (err?.message?.includes('NEXT_REDIRECT') || String(err).includes('NEXT_REDIRECT')) {
        // O Next.js usa erros para lidar com redirecionamentos (redirect), então ignoramos aqui
        return;
      }
      alert("Erro ao deletar perfil: " + String(err));
      setIsDeletingProfile(false);
    }
  };

  const handleDeleteTasks = async () => {
    if (!confirm('ATENÇÃO: Você está prestes a excluir PERMANENTEMENTE todas as suas tarefas. Seu perfil continuará ativo. Tem certeza disso?')) return;
    
    setIsDeletingTasks(true);
    try {
      await deleteAllTasks();
      alert("Todas as suas tarefas foram excluídas com sucesso!");
      router.push('/');
    } catch (err) {
      alert("Erro ao deletar tarefas: " + String(err));
      setIsDeletingTasks(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-app text-fg-secondary">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <Link href="/" className="text-fg-muted hover:text-[#FFCC00] text-sm font-bold flex items-center gap-2 mb-4 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Voltar para o Dashboard
          </Link>
          <h1 className="text-3xl font-black text-[#db4437] mb-2 font-['Bukra']">Área de Exclusão</h1>
          <p className="text-fg-muted">Gerencie a remoção dos seus dados permanentemente.</p>
        </div>

        <div className="space-y-6 bg-surface p-6 md:p-10 rounded-2xl border border-border-subtle shadow-xl">
          
          {/* Card: Limpar Dados de Páginas / Subespaços */}
          <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/5 p-6 rounded-xl space-y-4">
            <div>
              <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FFCC00]">folder_delete</span>
                Limpar Dados de Páginas / Subespaços
              </h2>
              <p className="text-sm text-fg-secondary leading-relaxed">
                Selecione abaixo quais seções do seu painel você deseja esvaziar permanentemente (apagar todos os dados e voltar ao estado inicial):
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['resumo', 'curriculo', 'portfolio'].map(key => {
                const label = key === 'resumo' ? 'Resumo Profissional' : key === 'curriculo' ? 'Currículo' : 'Portfólio';
                return (
                  <label key={key} className="flex items-center gap-3 p-3 bg-surface-hover/60 border border-border-subtle rounded-xl cursor-pointer hover:border-red-500/50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={selectedToDelete.includes(key)}
                      onChange={() => {
                        if (selectedToDelete.includes(key)) {
                          setSelectedToDelete(selectedToDelete.filter(k => k !== key));
                        } else {
                          setSelectedToDelete([...selectedToDelete, key]);
                        }
                      }}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-600 bg-surface border-border-subtle"
                    />
                    <span className="text-fg text-xs font-semibold">{label}</span>
                  </label>
                );
              })}
            </div>

            {selectedToDelete.length > 0 && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleDeleteSelectedData}
                  disabled={isClearing}
                  className="bg-red-600 hover:bg-red-700 text-fg px-6 py-2.5 rounded-md text-xs font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                  {isClearing ? 'Limpando...' : 'Excluir Dados Selecionados'}
                </button>
              </div>
            )}
          </div>

          <div className="border border-[#db4437]/30 bg-[#db4437]/10 p-6 rounded-xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#db4437]">delete</span>
                Excluir Apenas as Tarefas
              </h2>
              <p className="text-sm text-fg-secondary leading-relaxed">
                Todas as tarefas que você criou serão apagadas definitivamente do banco de dados. Sua conta, no entanto, continuará ativa e você poderá criar novas tarefas depois.
              </p>
            </div>
            <button 
              onClick={handleDeleteTasks}
              disabled={isDeletingTasks || isDeletingProfile}
              className="bg-surface-hover hover:bg-[#db4437] text-fg px-6 py-3 rounded-md text-sm font-bold transition-colors w-full md:w-auto shrink-0 disabled:opacity-50"
            >
              {isDeletingTasks ? 'Excluindo...' : 'Excluir Só Tarefas'}
            </button>
          </div>

          <div className="border border-[#db4437]/60 bg-[#db4437]/20 p-6 rounded-xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-[#db4437] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#db4437]">delete_forever</span>
                Excluir Perfil e Tarefas
              </h2>
              <p className="text-sm text-fg-secondary leading-relaxed">
                Aviso Importante: Esta ação é imediata, irreversível e destrutiva. Ao confirmar, todos os seus dados e o seu perfil serão fisicamente deletados, e sua sessão será encerrada.
              </p>
            </div>
            <button 
              onClick={handleDeleteProfile}
              disabled={isDeletingTasks || isDeletingProfile}
              className="bg-[#db4437] hover:bg-[#b3382c] text-fg px-6 py-3 rounded-md text-sm font-bold transition-colors w-full md:w-auto shrink-0 disabled:opacity-50"
            >
              {isDeletingProfile ? 'Excluindo...' : 'Excluir Tudo'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
