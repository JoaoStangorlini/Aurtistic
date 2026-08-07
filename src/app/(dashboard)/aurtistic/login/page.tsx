'use client';

import { useState } from 'react';
import { loginAurtistic, signupAurtistic, checkAurtisticUser } from '@/app/(dashboard)/aurtistic/actions';
import { useSearchParams } from 'next/navigation';

export default function AurtisticLoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || checkError;

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckError('');
    
    if (!username.trim()) {
      setCheckError('Digite um usuário válido.');
      return;
    }

    setIsLoading(true);
    try {
      const exists = await checkAurtisticUser(username);
      setMode(exists ? 'login' : 'signup');
      setStep(2);
    } catch (err) {
      setCheckError('Erro ao verificar usuário. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setCheckError('');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-8 shadow-[0_16px_40px_rgba(0,0,0,0.8)]">
        
        {/* Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/aurtistic_logo_white_v3.png" alt="Aurtistic" className="h-10 mb-4 object-contain" />
          <p className="text-[#8E8E8E] text-sm px-4">
            Digite seu nome de usuário para <strong className="text-[#FFCC00]">entrar</strong> ou <strong className="text-[#9D4EDD]">criar</strong> uma nova conta.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-md text-sm text-center font-bold">
            {error}
          </div>
        )}

        {/* Step 1: Username */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2" htmlFor="username">
                Usuário
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-[#131313] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#9D4EDD] transition-colors"
                placeholder="seu_usuario"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 font-bold py-3 rounded-lg transition-colors focus:ring-4 focus:outline-none bg-[#9D4EDD] text-white hover:bg-[#8836ce] focus:ring-[#9D4EDD]/20 disabled:opacity-50"
            >
              {isLoading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        )}

        {/* Step 2: Password (and Signup extras) */}
        {step === 2 && (
          <form className="flex flex-col gap-4" action={mode === 'login' ? loginAurtistic : signupAurtistic}>
            <input type="hidden" name="username" value={username} />
            
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-[#8E8E8E]">
                Entrando como <strong className="text-white">{username}</strong>
              </div>
              <button 
                type="button" 
                onClick={handleBack}
                className="text-[#9D4EDD] text-xs font-bold hover:underline"
              >
                Alterar
              </button>
            </div>

            {mode === 'signup' && (
              <div className="bg-[#9D4EDD]/10 border border-[#9D4EDD]/30 p-3 rounded-lg mb-2">
                <p className="text-xs text-[#E0E0E0]">
                  <strong className="text-[#9D4EDD]">Nova conta!</strong> Parece que você ainda não tem um usuário. Crie uma senha abaixo para começar.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="w-full bg-[#131313] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#FFCC00] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2" htmlFor="confirmPassword">
                    Repetir Senha
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    className="w-full bg-[#131313] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#FFCC00] transition-colors"
                    placeholder="••••••••"
                  />
                </div>
                
                <div className="mt-2 flex items-start gap-2">
                  <input 
                    type="checkbox" 
                    id="terms" 
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                    className="mt-1 accent-[#9D4EDD]"
                  />
                  <label htmlFor="terms" className="text-xs text-[#8E8E8E]">
                    Li e concordo com os <a href="#" className="text-[#9D4EDD] hover:underline">Termos de Uso</a> e a <a href="#" className="text-[#9D4EDD] hover:underline">Política de Privacidade</a>.
                  </label>
                </div>
              </>
            )}
            
            <button
              type="submit"
              className={`w-full mt-4 font-bold py-3 rounded-lg transition-colors focus:ring-4 focus:outline-none ${mode === 'login' ? 'bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800] focus:ring-[#FFCC00]/20' : 'bg-[#9D4EDD] text-white hover:bg-[#8836ce] focus:ring-[#9D4EDD]/20'}`}
            >
              {mode === 'login' ? 'Entrar no Aurtistic' : 'Criar minha Conta'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
