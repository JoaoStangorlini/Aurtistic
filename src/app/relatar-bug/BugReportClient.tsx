'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BugReportClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  
  // Feedback State
  const [feedbackType, setFeedbackType] = useState('Bug');
  const [feedbackDesc, setFeedbackDesc] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleSendFeedback = async () => {
    if (!feedbackDesc.trim()) {
      setFeedbackMsg('Por favor, descreva o problema.');
      return;
    }
    
    setFeedbackSending(true);
    setFeedbackMsg('');
    
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: feedbackType,
          descricao: feedbackDesc,
          userEmail: userEmail,
          logInfo: 'Enviado via /relatar-bug'
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        setFeedbackMsg('✅ Feedback enviado com sucesso! Nossa equipe vai analisar em breve.');
        setFeedbackDesc('');
      } else {
        setFeedbackMsg('❌ Erro: ' + (data.error || 'Falha ao enviar'));
      }
    } catch (e: any) {
      setFeedbackMsg('❌ Erro ao comunicar com servidor.');
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-8 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <span className="material-symbols-outlined text-[32px] text-[#FFCC00]">bug_report</span>
        <h1 className="text-2xl font-black text-white font-['Bukra'] tracking-tight">Relatar Bug / Feedback</h1>
      </div>
      
      <p className="text-[#A0A0A0] text-sm mb-8">
        Encontrou algum erro, tem alguma dúvida ou gostaria de sugerir uma nova funcionalidade? Descreva abaixo e a notificação será enviada diretamente aos desenvolvedores do Aurtistic.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-[#E0E0E0] mb-2">Qual é o tipo de relato?</label>
          <select 
            value={feedbackType} 
            onChange={e => setFeedbackType(e.target.value)}
            className="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FFCC00] transition-colors"
          >
            <option value="Bug">🐞 Relatar Erro / Bug</option>
            <option value="Sugestao">💡 Sugestão de Funcionalidade</option>
            <option value="Duvida">❓ Dúvida de Uso</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-[#E0E0E0] mb-2">Descrição Detalhada</label>
          <textarea 
            value={feedbackDesc}
            onChange={e => setFeedbackDesc(e.target.value)}
            rows={6}
            placeholder="Descreva o que aconteceu em detalhes. Se for um bug, como podemos reproduzi-lo?"
            className="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FFCC00] custom-scrollbar transition-colors"
          />
        </div>

        <div className="pt-4 flex gap-4">
          <button
            onClick={() => router.back()}
            className="flex-1 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white py-3 rounded-xl font-bold transition-colors"
          >
            Voltar
          </button>

          <button
            onClick={handleSendFeedback}
            disabled={feedbackSending}
            className="flex-1 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {feedbackSending ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">send</span>}
            {feedbackSending ? 'Enviando...' : 'Enviar Relatório'}
          </button>
        </div>
        
        {feedbackMsg && (
          <div className={`p-4 rounded-lg text-sm text-center font-bold mt-4 ${feedbackMsg.includes('Erro') ? 'bg-[#ff4d4d]/20 text-[#ff4d4d]' : 'bg-[#0f9d58]/20 text-[#69f0ae]'}`}>
            {feedbackMsg}
          </div>
        )}
      </div>
    </div>
  );
}
