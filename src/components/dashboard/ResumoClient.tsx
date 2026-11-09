// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { saveUserProfileData } from '@/app/(dashboard)/actions';
import Link from 'next/link';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import { PhotoInspectModal, type PhotoInspectItem } from '@/components/portfolio/PhotoInspectModal';
import { buildTenantThumbUrl } from '@/lib/edge-urls';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';

interface ResumoProject {
  title?: string;
  description?: string;
  link?: string;
  tags?: string[];
  image_url?: string;
}

export interface ResumoClientProps {
  initialProfile: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  isReadOnly?: boolean;
  favoritePhotos?: PhotoInspectItem[];
  serverUrl?: string;
  userId?: string;
}

export default function ResumoClient({
  initialProfile,
  isReadOnly = false,
  favoritePhotos = [],
  serverUrl,
}: ResumoClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Obras Fotográficas Favoritas & Avatar
  const [favPhotos, setFavPhotos] = useState<PhotoInspectItem[]>(favoritePhotos);
  const [selectedFavIndex, setSelectedFavIndex] = useState<number | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const { vaultTicket, activeTicket } = useAurtisticMedia();

  // Parse portfolio projects
  let projects: ResumoProject[] = [];
  try {
    if (profile?.portfolio) {
      projects = typeof profile.portfolio === 'string' ? JSON.parse(profile.portfolio) : profile.portfolio;
    }
  } catch (e) {
    console.error('Error parsing portfolio projects:', e);
  }

  // Parse resumo JSON
  let initialResumoData = {
    tagline: '',
    title: '',
    subtitle: '',
    button1_text: '',
    button1_url: '',
    button2_text: '',
    button2_url: '',
    profile_image_url: '',
    description: ''
  };

  try {
    if (profile?.resumo) {
      initialResumoData = typeof profile.resumo === 'string' ? JSON.parse(profile.resumo) : profile.resumo;
    }
  } catch (e) {
    console.error(e);
  }

  const [resumoData, setResumoData] = useState(initialResumoData);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveUserProfileData({ resumo: JSON.stringify(resumoData) });
      setProfile({ ...profile, resumo: resumoData });
      setIsEditing(false);
    } catch (e) {
      alert("Erro ao salvar resumo: " + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseDefaultTemplate = () => {
    const template = {
      tagline: 'DESENVOLVEDOR & DESIGNER',
      title: 'SEU NOME COMPLETO',
      subtitle: 'Focando em desenvolvimento de software, design de interfaces e organização pessoal através do Aurtistic.',
      button1_text: 'Contato',
      button1_url: 'mailto:seuemail@exemplo.com',
      button2_text: 'GitHub',
      button2_url: 'https://github.com',
      profile_image_url: '/aurtistic-icon.png',
      description: 'Escreva um resumo de perfil sobre você aqui. Quais são seus objetivos, sua formação acadêmica e suas competências mais fortes. Clique no botão de editar no topo do cartão para personalizar todas essas informações.'
    };
    setResumoData(template);
    setIsSaving(true);
    saveUserProfileData({ resumo: JSON.stringify(template) })
      .then(() => {
        setProfile({ ...profile, resumo: template });
        setIsEditing(false);
      })
      .catch(e => alert("Erro: " + String(e)))
      .finally(() => setIsSaving(false));
  };

  const isSetupEmpty = !profile?.resumo;

  if (isSetupEmpty && !isEditing) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-8 bg-app text-center text-fg">
        <div className="max-w-md p-8 bg-surface border border-border-subtle rounded-2xl shadow-xl backdrop-blur-md">
          <span className="material-symbols-outlined text-[64px] text-[#FFCC00] mb-4">badge</span>
          <h2 className="text-2xl font-bold text-fg mb-2">Configure seu Resumo</h2>
          <p className="text-fg-secondary text-sm mb-6">
            Seu Resumo Profissional está vazio. Você pode preenchê-lo do zero ou pré-carregar os dados modelo do João Paulo.
          </p>
          {!isReadOnly ? (
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleUseDefaultTemplate}
                className="w-full py-2.5 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                Usar Modelo Padrão
              </button>
              <button 
                onClick={() => setIsEditing(true)}
                className="w-full py-2.5 bg-surface-hover hover:bg-[#3D3D3D] text-fg font-bold rounded-lg text-sm transition-colors"
              >
                Preencher Manualmente
              </button>
            </div>
          ) : (
            <p className="text-xs text-fg-muted">Nenhum conteúdo publicado por este usuário ainda.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-app text-fg font-['Open_Sans'] overflow-y-auto">
      {/* Workspace Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 border-b border-border-subtle/30 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-fg font-['Bukra'] tracking-tighter">
              Aurtistic <span className="text-[#FFCC00] text-lg font-bold font-sans align-middle ml-2">creative manager</span>
            </h1>
          </div>
          <p className="text-sm text-fg-muted mt-1.5">Apresentação profissional e resumo de qualificações.</p>
        </div>

        {/* Action buttons */}
        {!isReadOnly && (
          <div className="flex gap-3">
            {isEditing && (
              <button 
                onClick={() => {
                  setResumoData(initialResumoData);
                  setIsEditing(false);
                }}
                className="px-4 py-2 text-sm text-fg-secondary hover:text-fg transition-colors animate-fade-in"
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
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle hover:border-[#FFCC00] text-fg rounded-lg text-sm font-bold transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                {isEditing ? 'done' : 'edit'}
              </span>
              {isSaving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Editar Subespaço'}
            </button>
          </div>
        )}
      </div>


      {isEditing ? (
        /* EDITOR MODE */
        <div className="max-w-4xl mx-auto w-full bg-surface border border-border-subtle p-6 md:p-8 rounded-2xl space-y-6">
          <h2 className="text-xl font-bold text-fg mb-4 border-b border-border-subtle pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00]">edit_note</span>
            Editar Resumo
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Tag/Rótulo</label>
              <input 
                type="text"
                value={resumoData.tagline}
                onChange={e => setResumoData({...resumoData, tagline: e.target.value})}
                placeholder="Ex: FOTÓGRAFO & DEV & FÍSICO"
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Nome Principal / Título</label>
              <input 
                type="text"
                value={resumoData.title}
                onChange={e => setResumoData({...resumoData, title: e.target.value})}
                placeholder="Ex: JOÃO PAULO STANGORLINI"
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
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
              className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD] resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Texto do Botão 1</label>
              <input 
                type="text"
                value={resumoData.button1_text}
                onChange={e => setResumoData({...resumoData, button1_text: e.target.value})}
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mt-2 mb-1">URL do Botão 1</label>
              <input 
                type="text"
                value={resumoData.button1_url}
                onChange={e => setResumoData({...resumoData, button1_url: e.target.value})}
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Texto do Botão 2</label>
              <input 
                type="text"
                value={resumoData.button2_text}
                onChange={e => setResumoData({...resumoData, button2_text: e.target.value})}
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
              <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mt-2 mb-1">URL do Botão 2</label>
              <input 
                type="text"
                value={resumoData.button2_url}
                onChange={e => setResumoData({...resumoData, button2_url: e.target.value})}
                className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1 text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">
                Foto de Perfil (Servidor de Borda ou URL Externa)
              </label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={resumoData.profile_image_url}
                  onChange={e => setResumoData({...resumoData, profile_image_url: e.target.value})}
                  placeholder="URL direta ou caminho relativo..."
                  className="flex-1 bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
                <button
                  type="button"
                  onClick={() => setIsAvatarPickerOpen(true)}
                  className="px-3.5 py-2.5 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">folder_special</span>
                  Do Servidor
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#FFCC00] uppercase tracking-wider mb-2">Biografia / Resumo Detalhado</label>
            <textarea 
              value={resumoData.description}
              onChange={e => setResumoData({...resumoData, description: e.target.value})}
              rows={6}
              placeholder="Escreva sua trajetória profissional e competências..."
              className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD] resize-y"
            />
          </div>

          <div className="mt-8 p-5 bg-[#3B1E43]/10 border border-[#3B1E43]/50 rounded-xl flex flex-col md:flex-row gap-4 items-start">
            <span className="material-symbols-outlined text-[#9D4EDD] text-[24px]">info</span>
            <div className="text-sm text-fg-secondary space-y-2">
              <p className="font-bold text-fg mb-2">Como editar as outras seções desta página?</p>
              <ul className="list-disc list-inside space-y-1.5 marker:text-[#9D4EDD]">
                <li><strong>Projetos Destacados:</strong> São puxados automaticamente dos projetos que você cadastra na aba <Link href="/portfolio" className="text-[#FFCC00] hover:underline font-semibold">Portfólio</Link>.</li>
                <li><strong>Currículo Resumido:</strong> É gerado automaticamente a partir do texto que você escreve no seu <Link href="/curriculo" className="text-[#FFCC00] hover:underline font-semibold">Currículo</Link>.</li>
                <li><strong>Contato (WhatsApp e E-mail):</strong> Aparecem se você preencher seu Telefone e E-mail no <Link href="/curriculo" className="text-[#FFCC00] hover:underline font-semibold">Currículo</Link>.</li>
                <li><strong>Agendar Reunião:</strong> Aparece se você preencher a <span className="text-fg font-semibold">URL do Botão 1</span> acima.</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* VISUAL PREVIEW / VIEW MODE */
        <div className="max-w-5xl mx-auto w-full space-y-16 py-10 relative z-10">
          {/* Hero Section */}
          <section className="flex flex-col-reverse md:grid md:grid-cols-12 gap-12 items-center" data-tour="resumo-hero">
            <div className="md:col-span-7 space-y-6 text-center md:text-left">
              {resumoData.tagline && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#3B1E43] border border-[#5A2E65] text-[#FFCC00] rounded-full text-xs font-bold uppercase tracking-wider">
                  {resumoData.tagline}
                </div>
              )}
              <h1 className="text-5xl md:text-6xl font-['Bukra'] font-black text-fg leading-tight">
                {resumoData.title}
              </h1>
              <p className="text-lg text-fg-secondary max-w-xl mx-auto md:mx-0">
                {resumoData.subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
                {resumoData.button1_text && (
                  <a href={resumoData.button1_url} target="_blank" rel="noreferrer" className="bg-[#FFCC00] text-[#121212] px-8 py-3 rounded-md text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#e6b800] transition-colors">
                    {resumoData.button1_text}
                  </a>
                )}
                {resumoData.button2_text && (
                  <a href={resumoData.button2_url} target="_blank" rel="noreferrer" className="bg-surface border border-[#FFCC00] text-fg px-8 py-3 rounded-md text-sm font-bold flex items-center justify-center gap-2 hover:border-[#3B1E43] hover:bg-[#3B1E43]/50 transition-colors">
                    {resumoData.button2_text}
                  </a>
                )}
              </div>
            </div>
            <div className="md:col-span-5 relative group w-full max-w-[300px] md:max-w-none mx-auto">
              <div className="absolute -inset-4 bg-[#FFCC00]/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="aspect-square bg-surface border border-[#FFCC00] rounded-2xl overflow-hidden p-2 transform md:rotate-3 hover:rotate-0 transition-transform duration-500">
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
              <h2 className="text-3xl font-['Bukra'] font-bold text-fg border-l-4 border-[#FFCC00] pl-4">Apresentação Profissional</h2>
              <p className="text-fg-secondary leading-relaxed text-lg whitespace-pre-line">
                {resumoData.description}
              </p>
            </section>
          )}

          {/* Obras Fotográficas Favoritas / Galeria do Criador */}
          {favPhotos.length > 0 && (
            <section className="space-y-6" data-tour="resumo-highlights">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-[#FFCC00] pl-4">
                <div>
                  <h2 className="text-3xl font-['Bukra'] font-bold text-fg">Obras Fotográficas Favoritas</h2>
                  <p className="text-sm text-fg-secondary mt-1">Fotografias autorais selecionadas do meu acervo de 2.369 fotos.</p>
                </div>
                <Link
                  href="/portfolio"
                  className="text-xs font-bold text-[#FFCC00] hover:text-[#e6b800] flex items-center gap-1 group self-start sm:self-auto"
                >
                  Ver Portfólio Completo
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {favPhotos.map((photo, idx) => {
                  const thumb =
                    photo.signedThumbUrl ||
                    buildTenantThumbUrl(photo.relative_path, photo.itemTicket || '', { serverUrl });

                  return (
                    <div
                      key={photo.relative_path}
                      onClick={() => setSelectedFavIndex(idx)}
                      className="group cursor-pointer bg-surface border border-border-subtle hover:border-[#FFCC00] rounded-xl overflow-hidden transition-all duration-300 flex flex-col justify-between"
                    >
                      <div className="w-full aspect-[4/3] bg-app p-2 flex items-center justify-center relative overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt={photo.title || photo.filename}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm p-1 rounded-full text-[#FFCC00]">
                          <span className="material-symbols-outlined text-[14px] block">star</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-surface border-t border-border-subtle">
                        <h4 className="text-xs font-bold text-fg truncate">{photo.title || photo.filename}</h4>
                        {photo.album && <span className="text-[10px] text-fg-muted block truncate">{photo.album}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Featured Projects / Bento Grid */}
          <section className="space-y-12" id="projects">
            <div>
              <h2 className="text-3xl font-['Bukra'] font-bold text-fg">Projetos Destacados</h2>
              <p className="text-fg-secondary mt-2">Sistemas, interfaces e soluções em destaque do meu portfólio.</p>
            </div>
            
            {projects && projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects.map((project: ResumoProject, index: number) => (
                  <div key={index} className="rounded-2xl p-[2px] bg-gradient-brand hover:shadow-[0_0_20px_var(--accent-secondary)] transition-all">
                    <div className="bg-surface rounded-[14px] border border-border-subtle p-6 h-full flex flex-col justify-between hover:bg-surface-hover transition-colors gap-6 group">
                      <div className="space-y-4">
                        {project.image_url && (
                          <div className="w-full h-40 rounded-lg overflow-hidden bg-app flex items-center justify-center border border-border-subtle">
                            <img src={project.image_url} alt={project.title} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                          </div>
                        )}
                        <h3 className="text-2xl font-['Bukra'] font-bold text-fg flex items-center gap-2">
                          {project.title}
                        </h3>
                        <p className="text-fg-secondary text-sm leading-relaxed">{project.description}</p>
                        {project.tags && project.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {project.tags.map((tag: string, tIndex: number) => (
                              <span key={tIndex} className="px-2 py-0.5 bg-surface-hover border border-border-strong text-[#FFCC00] rounded text-[11px] font-bold">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {project.link && (
                        <a 
                          href={project.link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="w-full text-center py-2.5 bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800] rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                        >
                          Ver Projeto
                          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 bg-surface border border-border-subtle rounded-2xl text-fg-secondary">
                Nenhum projeto destacado cadastrado. Vá até a aba &quot;Portfólio&quot; para adicionar projetos.
              </div>
            )}


          </section>

          {/* Footer / Links */}
          <section className="pt-12 border-t border-border-subtle space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card de Agendar Reunião */}
              {resumoData.button1_url && (
                <div className="bg-surface p-8 md:p-10 rounded-2xl flex flex-col justify-between border border-[#FFCC00] transition-colors group">
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-[#FFCC00] text-[#121212] rounded-full flex items-center justify-center mb-6">
                      <span className="font-bold text-xl">📅</span>
                    </div>
                    <h3 className="text-2xl font-['Bukra'] font-bold text-fg">{resumoData.button1_text || "Agendar Reunião"}</h3>
                    <p className="text-fg-secondary">Marque um horário diretamente na minha agenda para conversarmos sobre novos projetos ou oportunidades.</p>
                  </div>
                  <div className="mt-8">
                    <a href={resumoData.button1_url} target="_blank" rel="noreferrer" className="inline-flex px-8 py-3 bg-[#FFCC00] text-[#121212] text-sm font-bold rounded-md hover:bg-[#e6b800] transition-colors items-center gap-2">
                      {resumoData.button1_text || "Ver Calendário"}
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Card de Currículo */}
              {profile?.curriculo && !Array.isArray(profile.curriculo) && profile.curriculo.summary && (
                <div className="bg-surface p-8 md:p-10 rounded-2xl flex flex-col justify-between border border-[#FFCC00] hover:border-[#9D4EDD] transition-colors group">
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-[var(--accent-primary)] text-white rounded-full flex items-center justify-center mb-6">
                      <span className="font-bold text-xl">📄</span>
                    </div>
                    <h3 className="text-2xl font-['Bukra'] font-bold text-fg">Currículo Resumido</h3>
                    <p className="text-fg-secondary text-sm leading-relaxed">{profile.curriculo.summary}</p>
                  </div>
                  <div className="mt-8">
                    <Link href="/curriculo" className="inline-flex px-8 py-3 bg-[var(--accent-primary)] text-white text-sm font-bold rounded-md hover:bg-[#7B2CBF] transition-colors items-center gap-2">
                      Ver Currículo Completo
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-app p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-[#FFCC00]">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-['Bukra'] font-bold text-fg">Pronto para colaboração?</h2>
                <p className="text-fg-secondary mt-2 max-w-xl">Entre em contato comigo por WhatsApp ou E-mail para conversarmos sobre novos projetos ou oportunidades.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-wrap justify-center">
                {profile?.curriculo && !Array.isArray(profile.curriculo) && profile.curriculo.phone && (
                  <a href={`https://wa.me/${profile.curriculo.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="bg-[#25D366] text-fg py-3 px-8 rounded-md text-sm font-bold text-center hover:bg-[#1ebd5a] transition-colors">
                    WHATSAPP
                  </a>
                )}
                {profile?.curriculo && !Array.isArray(profile.curriculo) && profile.curriculo.email && (
                  <a href={`mailto:${profile.curriculo.email}?subject=Contato%20via%20Aurtistic`} className="bg-[#0F4780] text-fg py-3 px-8 rounded-md text-sm font-bold text-center hover:bg-[#0a3563] transition-colors">
                    E-MAIL
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Modal de Inspeção das Fotos Favoritas */}
      {selectedFavIndex !== null && (
        <PhotoInspectModal
          isOpen={selectedFavIndex !== null}
          onClose={() => setSelectedFavIndex(null)}
          items={favPhotos}
          initialIndex={selectedFavIndex}
          serverUrl={serverUrl}
          isOwner={!isReadOnly}
          onItemUpdated={(updated) => {
            setFavPhotos((prev) =>
              prev.map((p) => (p.relative_path === updated.relative_path ? updated : p))
            );
          }}
        />
      )}

      {/* Modal para Escolher Foto de Perfil no Servidor */}
      {isAvatarPickerOpen && !isReadOnly && (
        <TaskFilePickerModal
          isOpen={isAvatarPickerOpen}
          onClose={() => setIsAvatarPickerOpen(false)}
          taskId=""
          taskTitle="Foto de Perfil"
          ticket={vaultTicket || activeTicket || ''}
          serverUrl={serverUrl}
          onLinkedUpdated={() => {
            setIsAvatarPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

