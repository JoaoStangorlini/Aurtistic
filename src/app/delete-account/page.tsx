// Este programa é um software livre (Licença AGPLv3)
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAurtisticProfile, deleteAllTasks } from '@/app/(dashboard)/actions';

export default function DeleteAccountPage() {
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isDeletingTasks, setIsDeletingTasks] = useState(false);
  const router = useRouter();

  const handleDeleteProfile = async () => {
    if (!confirm('ATENÇÃO: Você está prestes a excluir PERMANENTEMENTE todas as suas tarefas e seu perfil. Tem certeza disso?')) return;
    
    setIsDeletingProfile(true);
    try {
      await deleteAurtisticProfile();
    } catch (err) {
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
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-[#121212] text-[#E0E0E0]">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <Link href="/" className="text-[#8E8E8E] hover:text-[#FFCC00] text-sm font-bold flex items-center gap-2 mb-4 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Voltar para o Dashboard
          </Link>
          <h1 className="text-3xl font-black text-[#db4437] mb-2 font-['Bukra']">Área de Exclusão</h1>
          <p className="text-[#8E8E8E]">Gerencie a remoção dos seus dados permanentemente.</p>
        </div>

        <div className="space-y-6 bg-[#1A1A1A] p-6 md:p-10 rounded-2xl border border-[#2D2D2D] shadow-xl">
          
          <div className="border border-[#db4437]/30 bg-[#db4437]/10 p-6 rounded-xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#db4437]">delete</span>
                Excluir Apenas as Tarefas
              </h2>
              <p className="text-sm text-[#A0A0A0] leading-relaxed">
                Todas as tarefas que você criou serão apagadas definitivamente do banco de dados. Sua conta, no entanto, continuará ativa e você poderá criar novas tarefas depois.
              </p>
            </div>
            <button 
              onClick={handleDeleteTasks}
              disabled={isDeletingTasks || isDeletingProfile}
              className="bg-[#2D2D2D] hover:bg-[#db4437] text-white px-6 py-3 rounded-md text-sm font-bold transition-colors w-full md:w-auto shrink-0 disabled:opacity-50"
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
              <p className="text-sm text-[#E0E0E0] leading-relaxed">
                Aviso Importante: Esta ação é imediata, irreversível e destrutiva. Ao confirmar, todos os seus dados e o seu perfil serão fisicamente deletados, e sua sessão será encerrada.
              </p>
            </div>
            <button 
              onClick={handleDeleteProfile}
              disabled={isDeletingTasks || isDeletingProfile}
              className="bg-[#db4437] hover:bg-[#b3382c] text-white px-6 py-3 rounded-md text-sm font-bold transition-colors w-full md:w-auto shrink-0 disabled:opacity-50"
            >
              {isDeletingProfile ? 'Excluindo...' : 'Excluir Tudo'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
