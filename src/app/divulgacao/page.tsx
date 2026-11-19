// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AurtisticDivulgacaoPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <main className="min-h-screen bg-app text-fg px-4 sm:px-8 py-12 flex flex-col items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-5">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1F9FCF]/15 border border-[#1F9FCF]/30 text-[#0F4780] dark:text-[#1F9FCF] text-xs font-bold uppercase tracking-wider">
            Aurtistic 13.0 • Creative &amp; Lab Manager
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
            Organização neuroamigável, <span className="text-accent-secondary">Cofre Local</span> e{' '}
            <span className="text-[#0F4780] dark:text-[#1F9FCF]">Gestão de Equipes</span> em um só lugar.
          </h1>
          <p className="text-sm text-fg-secondary leading-relaxed">
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
              className="py-3 px-4 rounded-2xl bg-accent-secondary text-on-accent-secondary text-xs font-black uppercase tracking-wider text-center"
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
              className="w-full max-w-[320px] aspect-[1/1.35] rounded-2xl bg-surface border border-accent-secondary/40 p-6 flex flex-col justify-between text-center shadow-2xl cursor-pointer hover:border-accent-secondary"
            >
              <div className="h-1.5 w-full flex rounded-full overflow-hidden">
                <div className="flex-1 bg-[#1F9FCF]" />
                <div className="flex-1 bg-[#F14343]" />
                <div className="flex-1 bg-[#FFCC00]" />
              </div>
              <div className="space-y-3 my-auto">
                <span className="text-xs font-mono uppercase text-accent-secondary">Folder Trifold</span>
                <h2 className="text-3xl font-black text-fg">AURTISTIC</h2>
                <p className="text-xs text-fg-secondary">
                  Agenda, Cofre Offline, Portfólio e Gestão de Organizações.
                </p>
              </div>
              <span className="py-2 px-4 rounded-full bg-accent-secondary/15 text-accent-secondary text-xs font-bold">
                Clique para abrir o trifold
              </span>
            </button>
          ) : (
            <div className="w-full space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-surface border border-border-subtle">
                <div className="p-4 rounded-xl bg-elevated border border-[#1F9FCF]/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-[#0F4780] dark:text-[#1F9FCF]">1. Tarefas &amp; Cuidados</h3>
                  <p className="text-xs text-fg-secondary">Kanban, calendário, alarmes de autocuidado e metas.</p>
                </div>
                <div className="p-4 rounded-xl bg-elevated border border-[#F14343]/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-[#B91C1C] dark:text-[#F14343]">2. Cofre &amp; Galeria</h3>
                  <p className="text-xs text-fg-secondary">Arquivos locais, backup inteligente e links de prova.</p>
                </div>
                <div className="p-4 rounded-xl bg-elevated border border-accent-secondary/30 space-y-2">
                  <h3 className="text-xs font-black uppercase text-accent-secondary">3. Gestão &amp; Studio</h3>
                  <p className="text-xs text-fg-secondary">Ponto QR, horários, estoque e criador visual HUB Studio.</p>
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 rounded-full bg-elevated border border-border-subtle text-fg text-xs font-bold cursor-pointer"
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

