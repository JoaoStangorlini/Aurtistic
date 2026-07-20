// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { saveUserProfileData } from '@/app/(dashboard)/actions';

import Image from 'next/image';
import Link from 'next/link';

interface ResumoClientProps {
  initialProfile: any;
}


export default function ResumoClient({ initialProfile }: ResumoClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Parse resumo JSON or fallback to standard structure
  const defaultResumo = {
    tagline: 'FOTÓGRAFO & DEV & FÍSICO',
    title: 'SEU NOME AQUI',
    subtitle: 'Descreva sua atuação principal, projetos de pesquisa ou especialidades.',
    button1_text: 'Agendar Reunião',
    button1_url: '#',
    button2_text: 'Ver GitHub',
    button2_url: '#',
    profile_image_url: '/perfil.jpeg',
    description: 'Escreva um resumo detalhado sobre você, sua formação, objetivos profissionais e principais conquistas.'
  };

  let initialResumoData = defaultResumo;
  try {
    if (profile?.resumo) {
      initialResumoData = JSON.parse(profile.resumo);
    }
  } catch (e) {
    // If it's pure text, convert to object
    if (profile?.resumo) {
      initialResumoData = { ...defaultResumo, description: profile.resumo };
    }
  }

  const [resumoData, setResumoData] = useState(initialResumoData);

  const handleSave = async (dataToSave = resumoData) => {
    setIsSaving(true);
    try {
      const jsonStr = JSON.stringify(dataToSave);
      await saveUserProfileData({ resumo: jsonStr });
      setProfile({ ...profile, resumo: jsonStr });
      setIsEditing(false);
    } catch (e) {
      alert("Erro ao salvar resumo: " + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseDefaultTemplate = () => {
    const template = {
      tagline: 'FOTÓGRAFO & DEV & FÍSICO',
      title: 'JOÃO PAULO STANGORLINI',
      subtitle: 'Focando em pesquisa científica, desenvolvimento full-stack e organization acadêmica através do Aurtistic.',
      button1_text: 'Agendar Reunião',
      button1_url: 'https://calendar.app.google/tELr1q8ky4G98EL58',
      button2_text: 'Ver GitHub',
      button2_url: 'https://github.com/JoaoStangorlini',
      profile_image_url: '/perfil.jpeg',
      description: 'Estudante de Física no Instituto de Física (USP - Butantã) com perfil voltado à tecnologia e educação. Experiência prática em desenvolvimento Web (PWA), design (web e gráfico), otimização, manutenção e montagem de hardware de alta performance.'
    };
    setResumoData(template);
    handleSave(template);
  };

  // If empty (no custom or default setup), show blank setup screen
  const isSetupEmpty = !profile?.resumo;

  if (isSetupEmpty && !isEditing) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-8 bg-[#121212] text-center">
        <div className="max-w-md p-8 bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl shadow-xl backdrop-blur-md">
          <span className="material-symbols-outlined text-[64px] text-[#FFCC00] mb-4">description</span>
          <h2 className="text-2xl font-bold text-white mb-2">Configure seu Resumo</h2>
          <p className="text-[#A0A0A0] text-sm mb-6">
            Sua seção de Resumo Profissional está vazia. Você pode iniciar escrevendo do zero ou usar nosso modelo padrão inspirado no João Paulo.
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleUseDefaultTemplate}
              className="w-full py-2.5 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Usar Modelo Padrão (Estilo João)
            </button>
            <button 
              onClick={() => setIsEditing(true)}
              className="w-full py-2.5 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white font-bold rounded-lg text-sm transition-colors"
            >
              Escrever do Zero
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-[#121212] text-[#F5F5F5] font-['Open_Sans'] overflow-y-auto">
      {/* Workspace Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 border-b border-[#2D2D2D]/30 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <Image 
              src="/aurtistic-icon.png" 
              alt="Aurtistic Logo" 
              width={36} 
              height={36}
              className="h-9 w-9 object-contain"
            />
            <h1 className="text-3xl font-black text-white font-['Bukra'] tracking-tighter">
              Aurtistic <span className="text-[#FFCC00] text-lg font-bold font-sans align-middle ml-2">creative manager</span>
            </h1>
          </div>
          <p className="text-sm text-[#8E8E8E] mt-1.5">Apresentação profissional e resumo de qualificações.</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {isEditing && (
            <button 
              onClick={() => {
                setResumoData(initialResumoData);
                setIsEditing(false);
              }}
              className="px-4 py-2 text-sm text-[#A0A0A0] hover:text-white transition-colors animate-fade-in"
            >
              Cancelar
            </button>
          )}
          <button 
            disabled={isSaving}
            onClick={() => {
              if (isEditing) {
                handleSave();
              } else {
                setIsEditing(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2D2D2D] hover:border-[#FFCC00] text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
              {isEditing ? 'done' : 'edit'}
            </span>
            {isSaving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Editar Subespaço'}
          </button>
        </div>
      </div>


      {isEditing ? (
        /* EDITOR MODE */
        <div className="max-w-4xl mx-auto w-full bg-[#1A1A1A] border border-[#2D2D2D] p-6 md:p-8 rounded-2xl space-y-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-[#2D2D2D] pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00]">edit_note</span>
            Editar Resumo Profissional
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Tag/Rótulo</label>
              <input 
                type="text"
                value={resumoData.tagline}
                onChange={e => setResumoData({...resumoData, tagline: e.target.value})}
                placeholder="Ex: FOTÓGRAFO & DEV & FÍSICO"
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Nome Principal / Título</label>
              <input 
                type="text"
                value={resumoData.title}
                onChange={e => setResumoData({...resumoData, title: e.target.value})}
                placeholder="Ex: JOÃO PAULO STANGORLINI"
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Subtítulo / Descrição Curta</label>
            <textarea 
              value={resumoData.subtitle}
              onChange={e => setResumoData({...resumoData, subtitle: e.target.value})}
              rows={3}
              placeholder="Descreva brevemente sua atuação..."
              className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD] resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Texto do Botão 1</label>
              <input 
                type="text"
                value={resumoData.button1_text}
                onChange={e => setResumoData({...resumoData, button1_text: e.target.value})}
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mt-2 mb-1">URL do Botão 1</label>
              <input 
                type="text"
                value={resumoData.button1_url}
                onChange={e => setResumoData({...resumoData, button1_url: e.target.value})}
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Texto do Botão 2</label>
              <input 
                type="text"
                value={resumoData.button2_text}
                onChange={e => setResumoData({...resumoData, button2_text: e.target.value})}
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mt-2 mb-1">URL do Botão 2</label>
              <input 
                type="text"
                value={resumoData.button2_url}
                onChange={e => setResumoData({...resumoData, button2_url: e.target.value})}
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Link da Imagem de Perfil</label>
              <input 
                type="text"
                value={resumoData.profile_image_url}
                onChange={e => setResumoData({...resumoData, profile_image_url: e.target.value})}
                className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Biografia / Resumo Detalhado</label>
            <textarea 
              value={resumoData.description}
              onChange={e => setResumoData({...resumoData, description: e.target.value})}
              rows={6}
              placeholder="Escreva sua trajetória profissional e competências..."
              className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD] resize-y"
            />
          </div>
        </div>
      ) : (
        /* VISUAL PREVIEW / VIEW MODE */
        <div className="max-w-5xl mx-auto w-full space-y-16 py-10 relative z-10">
          {/* Hero Section */}
          <section className="flex flex-col-reverse md:grid md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7 space-y-6 text-center md:text-left">
              {resumoData.tagline && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#3B1E43] border border-[#5A2E65] text-[#FFCC00] rounded-full text-xs font-bold uppercase tracking-wider">
                  {resumoData.tagline}
                </div>
              )}
              <h1 className="text-5xl md:text-6xl font-['Bukra'] font-black text-white leading-tight">
                {resumoData.title}
              </h1>
              <p className="text-lg text-[#A0A0A0] max-w-xl mx-auto md:mx-0">
                {resumoData.subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
                {resumoData.button1_text && (
                  <a href={resumoData.button1_url} target="_blank" rel="noreferrer" className="bg-[#FFCC00] text-[#121212] px-8 py-3 rounded-md text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#e6b800] transition-colors">
                    {resumoData.button1_text}
                  </a>
                )}
                {resumoData.button2_text && (
                  <a href={resumoData.button2_url} target="_blank" rel="noreferrer" className="bg-[#1E1E1E] border border-[#FFCC00] text-white px-8 py-3 rounded-md text-sm font-bold flex items-center justify-center gap-2 hover:border-[#3B1E43] hover:bg-[#3B1E43]/50 transition-colors">
                    {resumoData.button2_text}
                  </a>
                )}
              </div>
            </div>
            <div className="md:col-span-5 relative group w-full max-w-[300px] md:max-w-none mx-auto">
              <div className="absolute -inset-4 bg-[#FFCC00]/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="aspect-square bg-[#1E1E1E] border border-[#FFCC00] rounded-2xl overflow-hidden p-2 transform md:rotate-3 hover:rotate-0 transition-transform duration-500">
                <img 
                  className="w-full h-full object-cover rounded-xl saturate-[0.7] hover:saturate-100 transition-all duration-700" 
                  alt="Profile Photo" 
                  src={resumoData.profile_image_url || '/perfil.jpeg'} 
                  onError={(e) => {
                    // Fallback to default
                    (e.target as HTMLImageElement).src = '/perfil.jpeg';
                  }}
                />
              </div>
            </div>
          </section>

          {/* Description Block */}
          {resumoData.description && (
            <section className="space-y-6 max-w-3xl">
              <h2 className="text-3xl font-['Bukra'] font-bold text-white border-l-4 border-[#FFCC00] pl-4">Resumo Profissional</h2>
              <p className="text-[#A0A0A0] leading-relaxed text-lg whitespace-pre-line">
                {resumoData.description}
              </p>
            </section>
          )}

          {/* Featured Projects / Bento Grid */}
          <section className="space-y-12" id="projects">
            <div>
              <h2 className="text-3xl font-['Bukra'] font-bold text-white">Portfólio de Software & Design</h2>
              <p className="text-[#A0A0A0] mt-2">Sistemas, interfaces e soluções criadas como Desenvolvedor e Designer.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* O Grande Card com borda gradiente */}
              <div className="md:col-span-12 rounded-2xl p-[2px] bg-gradient-to-r from-[#F14343] via-[#FFCC00] to-[#0F4780]">
                <div className="bg-[#1E1E1E] rounded-[14px] h-full flex flex-col overflow-hidden">
                  <div className="p-8 pb-4 md:pb-8 border-b border-[#2D2D2D] text-center md:text-left flex items-center justify-center md:justify-start">
                    <h2 className="text-3xl font-['Bukra'] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F14343] via-[#FFCC00] to-[#0F4780]">
                      HUB LabDiv
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#2D2D2D] flex-1">
                    <div className="p-8 flex flex-col justify-between min-h-[320px] group hover:bg-[#252525] transition-colors relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-[#F14343]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="space-y-4 relative z-10">
                        <h3 className="text-2xl font-['Bukra'] font-bold text-white">O HUB</h3>
                        <p className="text-[#A0A0A0] font-medium">Acesse o HUB de comunicação cientifica do IFUSP.</p>
                      </div>
                      <div className="mt-8 pt-4 flex flex-col gap-3 relative z-10">
                        <a href="https://hub-lab-div.vercel.app" target="_blank" rel="noreferrer" className="w-full text-center py-2 bg-[#F14343]/10 text-[#F14343] hover:bg-[#F14343]/20 border border-[#F14343]/30 rounded-md font-bold transition-colors">
                          Acessar o Site
                        </a>
                        <a href="#" className="w-full text-center py-2 bg-[#F14343] text-white hover:bg-[#d63a3a] rounded-md font-bold transition-colors flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined text-[20px]">android</span>
                          Baixar o App
                        </a>
                      </div>
                    </div>

                    <a href="https://hub-lab-div.vercel.app/apresentacao" target="_blank" rel="noreferrer" className="p-8 flex flex-col justify-between min-h-[320px] group hover:bg-[#252525] transition-colors relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-[#FFCC00]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="space-y-4 relative z-10">
                        <h3 className="text-2xl font-['Bukra'] font-bold text-white">Apresentação</h3>
                        <p className="text-[#A0A0A0] font-medium">Veja a apresentação do projeto, conheça mais sobre a plataforma e como implementar ela em seu instituto.</p>
                      </div>
                      <div className="mt-8 border-t border-[#2D2D2D] group-hover:border-[#FFCC00]/50 pt-4 flex justify-between items-center text-[#FFCC00] font-bold transition-colors relative z-10">
                        Ver Apresentação
                        <span className="text-xl group-hover:translate-x-2 transition-transform">→</span>
                      </div>
                    </a>

                    <a href="https://hub-lab-div.vercel.app/labdiv" target="_blank" rel="noreferrer" className="p-8 flex flex-col justify-between min-h-[320px] group hover:bg-[#252525] transition-colors relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-[#0F4780]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="space-y-4 relative z-10">
                        <h3 className="text-2xl font-['Bukra'] font-bold text-white">Página do LabDiv</h3>
                        <p className="text-[#A0A0A0] font-medium">Conheça mais sobre o Laboratorio de Expressao e Divulgacao do IFUSP.</p>
                      </div>
                      <div className="mt-8 border-t border-[#2D2D2D] group-hover:border-[#0F4780]/50 pt-4 flex justify-between items-center text-[#5fa8ff] font-bold transition-colors relative z-10">
                        Conhecer o LabDiv
                        <span className="text-xl group-hover:translate-x-2 transition-transform">→</span>
                      </div>
                    </a>
                  </div>
                </div>
              </div>

              {/* Aurtistic Card */}
              <div className="md:col-span-12 rounded-2xl p-[2px] bg-gradient-to-r from-[#9D4EDD] to-[#FFCC00]">
                <div className="bg-[#1E1E1E] rounded-[14px] flex flex-col md:flex-row items-center justify-between p-8 hover:bg-[#252525] transition-colors gap-6 group">
                  <div className="space-y-4 text-center md:text-left flex-1">
                    <div className="flex items-center justify-center md:justify-start gap-3">
                      <span className="material-symbols-outlined text-4xl text-[#FFCC00]">psychology</span>
                      <h3 className="text-3xl font-['Bukra'] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFCC00] to-[#9D4EDD]">
                        Aurtistic
                      </h3>
                    </div>
                    <p className="text-[#A0A0A0] max-w-3xl">Um ecossistema focado e livre de distrações para organização pessoal. Planeje suas tarefas e rotinas no seu próprio ritmo.</p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-3 min-w-[200px]">
                    <Link href="/" className="w-full text-center px-6 py-3 bg-[#FFCC00]/10 text-[#FFCC00] hover:bg-[#FFCC00]/20 border border-[#FFCC00]/30 rounded-lg font-bold transition-colors">
                      Acessar o Site
                    </Link>
                    <a href="#" className="w-full text-center px-6 py-3 bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800] rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[20px]">android</span>
                      Baixar o App
                    </a>
                  </div>
                </div>
              </div>

              {/* Stangorlini.web Card */}
              <div className="md:col-span-12 rounded-2xl p-[2px] bg-gradient-to-r from-[#FFCC00]/50 to-[#FFCC00]">
                <div className="bg-[#1E1E1E] rounded-[14px] flex flex-col md:flex-row items-center justify-between p-8 hover:bg-[#252525] transition-colors gap-6 group">
                  <div className="space-y-4 text-center md:text-left flex-1">
                    <div className="flex items-center justify-center md:justify-start gap-3">
                      <span className="material-symbols-outlined text-4xl text-[#FFCC00]">terminal</span>
                      <h3 className="text-3xl font-['Bukra'] font-black text-[#FFCC00]">
                        stangorlini.web
                      </h3>
                    </div>
                    <p className="text-[#A0A0A0] max-w-3xl">Meu portfólio pessoal e plataforma de currículo. O ecossistema principal que conecta todos os meus projetos, galerias e ferramentas.</p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-3 min-w-[200px]">
                    <Link href="/" className="w-full text-center px-6 py-3 bg-[#FFCC00]/10 text-[#FFCC00] hover:bg-[#FFCC00]/20 border border-[#FFCC00]/30 rounded-lg font-bold transition-colors">
                      Acessar o Site
                    </Link>
                    <a href="#" className="w-full text-center px-6 py-3 bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800] rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[20px]">android</span>
                      Baixar o App
                    </a>
                  </div>
                </div>
              </div>
              <div className="md:col-span-12 bg-[#121212] border border-[#FFCC00] p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center min-h-[150px] hover:border-[#F5F5F5] transition-colors gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <h3 className="text-xl font-['Bukra'] font-bold text-white">Projetos & Código Fonte (GitHub)</h3>
                  <p className="text-[#A0A0A0] max-w-2xl">Explore meus repositórios, códigos abertos e o histórico de commits dos projetos em andamento.</p>
                </div>
                <a href="https://github.com/JoaoStangorlini" target="_blank" rel="noreferrer" className="shrink-0 px-8 py-3 bg-[#F5F5F5] border border-[#FFCC00] text-[#121212] text-sm font-bold rounded-md hover:bg-[#D4D4D4] transition-colors flex items-center gap-2">
                  Acessar GitHub
                  <span>→</span>
                </a>
              </div>
            </div>
          </section>

          {/* Gallery */}
          <section className="space-y-12" id="gallery">
            <div>
              <h2 className="text-3xl font-['Bukra'] font-bold text-white">Portfólio de Fotografias</h2>
              <p className="text-[#A0A0A0] mt-2">Registros profissionais, eventos e ensaios fotográficos.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/portfolio" className="aspect-square bg-[#1E1E1E] border border-[#FFCC00] rounded-xl overflow-hidden hover:border-[#3B1E43] transition-all group block">
                <img src="/galeria1.jpg" alt="Galeria 1" className="w-full h-full object-cover transition-all duration-500" />
              </Link>
              <Link href="/portfolio" className="aspect-square bg-[#1E1E1E] border border-[#FFCC00] rounded-xl overflow-hidden hover:border-[#3B1E43] transition-all group block">
                <img src="/galeria2.jpg" alt="Galeria 2" className="w-full h-full object-cover transition-all duration-500" />
              </Link>
              <Link href="/portfolio" className="aspect-square bg-[#1E1E1E] border border-[#FFCC00] rounded-xl overflow-hidden hover:border-[#3B1E43] transition-all group block">
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQnXnwq7H7F6pHq6hll9SKv-E9uqH1KA0qixi_lmBd-_Q&s=10" alt="Galeria 3" className="w-full h-full object-cover transition-all duration-500" />
              </Link>
              <Link href="/portfolio" className="aspect-square bg-[#1E1E1E] border border-[#FFCC00] rounded-xl overflow-hidden hover:border-[#3B1E43] transition-all group block">
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSc9QM4zJd-GuLxWzGiKHLJmzEhFfnmOPxB3pOkhO127siK2SCw4LsNlAI&s=10" alt="Galeria 4" className="w-full h-full object-cover transition-all duration-500" />
              </Link>
            </div>
            <div className="pt-4 flex justify-center">
              <Link href="/portfolio" className="px-8 py-3 bg-[#1E1E1E] border border-[#FFCC00] text-white text-sm font-bold rounded-md hover:bg-[#3B1E43] hover:border-[#5A2E65] transition-colors">
                Ver Portfólio Completo
              </Link>
            </div>
          </section>

          {/* Vida Acadêmica */}
          <section className="space-y-12" id="academic">
            <div>
              <h2 className="text-3xl font-['Bukra'] font-bold text-white">Vida Acadêmica</h2>
              <p className="text-[#A0A0A0] mt-2">Materiais de estudo, projetos de pesquisa, docência e estágios.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#1E1E1E] border border-[#FFCC00] p-8 rounded-2xl flex flex-col justify-between min-h-[200px] hover:border-[#3B1E43] transition-colors gap-6 group">
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-[#3B1E43] text-white rounded-full flex items-center justify-center mb-6">
                    <span className="font-bold text-xl">📚</span>
                  </div>
                  <h3 className="text-xl font-['Bukra'] font-bold text-white">Acervo Acadêmico (Drive)</h3>
                  <p className="text-[#A0A0A0]">Pasta da graduação contendo livros, artigos e materiais de pesquisa estruturados para consulta rápida.</p>
                </div>
                <a href="https://drive.google.com/drive/folders/1RoiZANniDllDSuJiDkgoZLuRVGetej7b?usp=drive_link" target="_blank" rel="noreferrer" className="inline-flex w-max px-8 py-3 bg-[#3B1E43] text-white text-sm font-bold rounded-md hover:bg-[#5A2E65] transition-colors items-center gap-2">
                  Acessar Drive
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </a>
              </div>

              <div className="bg-[#1E1E1E] border border-[#FFCC00] p-8 rounded-2xl flex flex-col justify-between min-h-[200px] hover:border-[#0F4780] transition-colors gap-6 group">
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-[#0F4780] text-white rounded-full flex items-center justify-center mb-6">
                    <span className="font-bold text-xl">🔬</span>
                  </div>
                  <h3 className="text-xl font-['Bukra'] font-bold text-white">Projetos de Pesquisa & Docência</h3>
                  <p className="text-[#A0A0A0]">Trabalhos de iniciação científica, estágios e auxílio à docência desenvolvidos ao longo do curso.</p>
                </div>
                <Link href="/curriculo" className="inline-flex w-max px-8 py-3 bg-[#0F4780] text-white text-sm font-bold rounded-md hover:bg-[#0a3563] transition-colors items-center gap-2">
                  Ver Detalhes no Currículo
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>
            </div>
          </section>
          
          {/* Footer / Links */}
          <section className="pt-12 border-t border-[#2D2D2D] space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card de Agendar Reunião */}
              <div className="bg-[#1E1E1E] p-8 md:p-10 rounded-2xl flex flex-col justify-between border border-[#FFCC00] transition-colors group">
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-[#FFCC00] text-[#121212] rounded-full flex items-center justify-center mb-6">
                    <span className="font-bold text-xl">📅</span>
                  </div>
                  <h3 className="text-2xl font-['Bukra'] font-bold text-white">Agendar Reunião</h3>
                  <p className="text-[#A0A0A0]">Marque um horário diretamente na minha agenda para conversarmos sobre novos projetos ou oportunidades.</p>
                </div>
                <div className="mt-8">
                  <a href="https://calendar.app.google/tELr1q8ky4G98EL58" target="_blank" rel="noreferrer" className="inline-flex px-8 py-3 bg-[#FFCC00] text-[#121212] text-sm font-bold rounded-md hover:bg-[#e6b800] transition-colors items-center gap-2">
                    Ver Calendário
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </a>
                </div>
              </div>

              {/* Card de Currículo */}
              <div className="bg-[#1E1E1E] p-8 md:p-10 rounded-2xl flex flex-col justify-between border border-[#FFCC00] hover:border-[#9D4EDD] transition-colors group">
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-[#9D4EDD] text-white rounded-full flex items-center justify-center mb-6">
                    <span className="font-bold text-xl">📄</span>
                  </div>
                  <h3 className="text-2xl font-['Bukra'] font-bold text-white">Currículo Resumido</h3>
                  <p className="text-[#A0A0A0]">Estudante de Física (USP) com experiência prática em desenvolvimento web (PWA), design, infraestrutura de hardware, e mediação de tecnologias imersivas (VR/AR) no Inova USP e Parque CienTec.</p>
                </div>
                <div className="mt-8">
                  <Link href="/curriculo" className="inline-flex px-8 py-3 bg-[#9D4EDD] text-white text-sm font-bold rounded-md hover:bg-[#7B2CBF] transition-colors items-center gap-2">
                    Ver Currículo Completo
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="bg-[#121212] p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-[#FFCC00]">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-['Bukra'] font-bold text-white">Pronto para colaboração?</h2>
                <p className="text-[#A0A0A0] mt-2 max-w-xl">Disponível para projetos, parcerias e contratações como Fotógrafo, Desenvolvedor Full-Stack, Professor ou Designer.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-wrap justify-center">
                <a href="https://wa.me/55119678401823?text=Ol%C3%A1%20Jo%C3%A3o%2C%20vim%20pelo%20seu%20site%20e%20gostaria%20de%20conversar%20sobre%20uma%20colabora%C3%A7%C3%A3o!" target="_blank" rel="noreferrer" className="bg-[#25D366] text-white py-3 px-8 rounded-md text-sm font-bold text-center hover:bg-[#1ebd5a] transition-colors">
                  WHATSAPP
                </a>
                <a href="mailto:joaopaulostangorlini@gmail.com?subject=Contato%20via%20Stangorlini.web" className="bg-[#0F4780] text-white py-3 px-8 rounded-md text-sm font-bold text-center hover:bg-[#0a3563] transition-colors">
                  E-MAIL
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

