'use client';

import { useState } from 'react';
import { login } from '@/app/login/actions';
import Loading from '@/app/loading';

export default function LoginForm({ next }: { next: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form 
      action={login}
      onSubmit={() => setIsSubmitting(true)}
      className="flex flex-col gap-4 relative"
    >
      {isSubmitting && <Loading />}

      <input type="hidden" name="next" value={next} />
      <div>
        <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full bg-[#131313] border border-[#2D2D2D] text-[#e5e2e1] px-4 py-3 rounded-lg focus:outline-none focus:border-[#FFCC00] transition-colors"
          placeholder="seu@email.com"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full bg-[#131313] border border-[#2D2D2D] text-[#e5e2e1] px-4 py-3 rounded-lg focus:outline-none focus:border-[#FFCC00] transition-colors"
          placeholder="••••••••"
        />
      </div>
      
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full mt-4 bg-[#FFCC00] text-[#121212] font-bold py-3 rounded-lg hover:bg-[#e6b800] transition-colors focus:ring-4 focus:ring-[#FFCC00]/20 disabled:opacity-50"
      >
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
