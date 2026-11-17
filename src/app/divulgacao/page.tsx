// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AurtisticDivulgacaoPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#070b14] text-white px-4 sm:px-8 py-12 flex flex-col items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-5">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1F9FCF]/15 border border-[#1F9FCF]/30 text-[#1F9FCF] text-xs font-bold uppercase tracking-wider">
            Aurtistic 13.0 • Creative &amp; Lab Manager
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
            Organização neuroamigável, <span className="text-[#FFCC00]">Cofre Local</span> e{' '}
            <span className="text-[#1F9FCF]">Gestão de Equipes</span> em um só lugar.
          </h1>
          <p className="text-sm text-gray-300 leading-relaxed">
            Feito para estudantes, criadores e laboratórios: gerencie tarefas, metas, escalas,
            ponto QR, portfólio verificado e seus arquivos locais offline.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              href="/login"
              className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#0F4780] to-[#1F9FCF] text-white text-xs font-black uppercase tracking-wider text-center"
            >
              Entrar no Aurtistic
            </Link>
            <Link
              href="/"
              className="py-3 px-4 rounded-2xl bg-[#FFCC00] text-slate-950 text-xs font-black uppercase tracking-wider text-center"
            >
              Abrir Painel
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col items-center">
          {!isOpen ? (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="w-full max-w-[320px] aspect-[1/1.35] rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#050811] border border-[#FFCC00]/40 p-6 flex flex-col justify-between text-center shadow-2xl cursor-pointer hover:border-[#FFCC00]"
            >
              <div className="h-1.5 w-full flex rounded-full overflow-hidden">
                <div className="flex-1 bg-[#1F9FCF]" />
                <div className="flex-1 bg-[#F14343]" />
                <div className="flex-1 bg-[#FFCC00]" />
              </div>
              <div className="space-y-3 my-auto">
                <span className="text-xs font-mono uppercase text-[#FFCC00]">Folder Trifold</span>
                <h2 className="text-3xl font-black">AURTISTIC</h2>
                <p className="text-xs text-gray-300">
                  Agenda, Cofre Offline, Portfólio e Gestão de Organizações.
                </p>
              </div>
              <span className="py-2 px-4 rounded-full bg-[#FFCC00]/15 text-[#FFCC00] text-xs font-bold">
                Clique para abrir o trifold
              </span>
            </button>
          ) : (
            <div className="w-full space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-[#09101f] border border-white/15">
                <div className="p-4 rounded-xl bg-white/[0.04] border border-[#1F9FCF]/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-[#1F9FCF]">1. Tarefas &amp; Cuidados</h3>
                  <p className="text-xs text-gray-300">Kanban, calendário, alarmes de autocuidado e metas.</p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.04] border border-[#F14343]/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-[#F14343]">2. Cofre &amp; Galeria</h3>
                  <p className="text-xs text-gray-300">Arquivos locais, backup inteligente e links de prova.</p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.04] border border-[#FFCC00]/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-[#FFCC00]">3. Gestão &amp; Studio</h3>
                  <p className="text-xs text-gray-300">Ponto QR, horários, estoque e criador visual HUB Studio.</p>
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 rounded-full bg-white/10 text-xs font-bold cursor-pointer"
                >
                  Dobrar panfleto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

