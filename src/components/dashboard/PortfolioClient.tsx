// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/dashboard/PortfolioClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { saveUserProfileData, syncPortfolioAction } from '@/app/(dashboard)/actions';
import { AurtisticGalleryGrid } from '@/components/portfolio/AurtisticGalleryGrid';
import { PhotoInspectItem } from '@/components/portfolio/PhotoInspectModal';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';

export interface PortfolioClientProps {
  initialProfile: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  isReadOnly?: boolean;
  portfolioPhotos?: PhotoInspectItem[];
  publicSlug?: string;
  serverUrl?: string;
  userId?: string;
}

interface PortfolioProject {
  title: string;
  description: string;
  link: string;
  tags: string[];
  image_url: string;
}

export default function PortfolioClient({
  initialProfile,
  isReadOnly = false,
  portfolioPhotos = [],
  publicSlug,
  serverUrl,
}: PortfolioClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sub-abas do Portfólio Unificado (Fotografia em primeiro lugar)
  const [activeSubTab, setActiveSubTab] = useState<'photos' | 'projects'>('photos');

  // Garante que o tour guiado do Coach Marks encontre a galeria ativa
  useEffect(() => {
    const handleEnsurePhotoTab = () => {
      setActiveSubTab('photos');
    };
    window.addEventListener('aurtistic:ensure-portfolio-tab', handleEnsurePhotoTab);
    return () => window.removeEventListener('aurtistic:ensure-portfolio-tab', handleEnsurePhotoTab);
  }, []);

  // Acervo de Fotografias
  const [photos, setPhotos] = useState<PhotoInspectItem[]>(portfolioPhotos);
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { vaultTicket, activeTicket } = useAurtisticMedia();

  const handleSyncPortfolio = async (forceReset = false) => {
    setIsSyncing(true);
    try {
      const res = await syncPortfolioAction({ forceReset });
      if (res.ok) {
        if (forceReset) {
          setPhotos([]);
        } else {
          window.location.reload();
        }
      } else {
        alert(res.error || 'Erro ao sincronizar acervo.');
      }
    } catch (e: any) {
      alert('Falha ao comunicar com o servidor: ' + e?.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Parse dos Projetos de Software
  let initialPortfolioData: PortfolioProject[] = [];
  try {
    if (profile?.portfolio && Array.isArray(profile.portfolio)) {
      initialPortfolioData = profile.portfolio as PortfolioProject[];
    }
  } catch (e) {
    console.error(e);
  }

  const [projects, setProjects] = useState<PortfolioProject[]>(initialPortfolioData);

  const [iframeUrl, setIframeUrl] = useState(() => {
    return (
      profile?.features_config?.gallery_iframe_url ||
      'https://stangorliniphotography.pic-time.com/-portiflio/slidesblog/6a1cf17dfd03398d7fddb00d?slideshowview=AAAAANYAAABdtAdQQXgvsHwiv1E6mUSMuiUAaFz7JkxgkxMPtvfv0JMhf8GQnlaaNiCsf9oYGmXGq7VPHE3RyL2-1gnGziP0iVtidPlPKhb4rzJeFOAgYQ'
    );
  });
  const [iframeTitle, setIframeTitle] = useState(() => {
    return profile?.features_config?.gallery_iframe_title || 'Galeria de Fotografia';
  });

  const handleSave = async (dataToSave = projects) => {
    setIsSaving(true);
    try {
      const updatedFeaturesConfig = {
        ...(profile?.features_config || {}),
        gallery_iframe_url: iframeUrl,
        gallery_iframe_title: iframeTitle,
      };

      await saveUserProfileData({
        portfolio: dataToSave,
        features_config: updatedFeaturesConfig,
      });

      setProfile({
        ...profile,
        portfolio: dataToSave,
        features_config: updatedFeaturesConfig,
      });
      setIsEditing(false);
    } catch (e) {
      alert('Erro ao salvar portfólio: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseDefaultTemplate = () => {
    const template: PortfolioProject[] = [
      {
        title: 'Meu Projeto Incrível',
        description:
          'Descrição curta do projeto, destacando os problemas resolvidos e tecnologias utilizadas.',
        link: 'https://github.com/seu-usuario/projeto',
        tags: ['React', 'TypeScript', 'TailwindCSS'],
        image_url: '',
      },
      {
        title: 'Outro Projeto Relevante',
        description:
          'Um segundo projeto prático para demonstrar suas habilidades técnicas e arquitetura.',
        link: 'https://github.com/seu-usuario/projeto-dois',
        tags: ['Node.js', 'PostgreSQL', 'Docker'],
        image_url: '',
      },
    ];
    setProjects(template);
    void handleSave(template);
  };

  const addProject = () => {
    setProjects([...projects, { title: '', description: '', link: '', tags: [], image_url: '' }]);
  };

  const removeProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  const updateProject = (index: number, field: keyof PortfolioProject, value: unknown) => {
    const updated = [...projects];
    updated[index] = { ...updated[index], [field]: value };
    setProjects(updated);
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const slug = publicSlug || profile?.username || 'perfil';
    const targetUrl = `${window.location.origin}/portfolio/${slug}`;
    navigator.clipboard.writeText(targetUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleItemUpdated = (updated: PhotoInspectItem) => {
    setPhotos((prev) =>
      prev.map((p) => (p.relative_path === updated.relative_path ? { ...p, ...updated } : p))
    );
  };

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-app text-fg font-['Open_Sans'] overflow-y-auto">
      {/* Workspace Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 border-b border-border-subtle/30 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-fg font-['Bukra'] tracking-tighter">
              Aurtistic{' '}
              <span className="text-[#FFCC00] text-lg font-bold font-sans align-middle ml-2">
                creative manager
              </span>
            </h1>
          </div>
          <p className="text-sm text-fg-muted mt-1.5">
            Vitrine unificada de fotografia autoral e projetos de engenharia & design.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Copiar Link Público */}
          <button
            type="button"
            onClick={handleCopyLink}
            data-tour="portfolio-share"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[#FFCC00] text-fg rounded-lg text-xs font-bold transition-all"
          >
            <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">
              {copiedLink ? 'check' : 'share'}
            </span>
            {copiedLink ? 'Link Copiado!' : 'Copiar Link Público'}
          </button>

          {!isReadOnly && activeSubTab === 'projects' && (
            <>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setProjects(initialPortfolioData);
                    setIsEditing(false);
                  }}
                  className="px-4 py-2 text-sm text-fg-secondary hover:text-fg transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  if (isEditing) {
                    void handleSave();
                  } else {
                    setIsEditing(true);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle hover:border-[#FFCC00] text-fg rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                  {isEditing ? 'done' : 'edit'}
                </span>
                {isSaving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Editar Projetos'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Seletor de Sub-Abas: Fotografia vs Projetos de Software */}
      <div className="flex items-center gap-3 mb-8 border-b border-border-subtle pb-2" data-tour="portfolio-subtabs">
        <button
          type="button"
          onClick={() => setActiveSubTab('photos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'photos'
              ? 'bg-[#FFCC00] text-[#121212] shadow-lg shadow-[#FFCC00]/10'
              : 'text-fg-secondary hover:text-fg bg-surface border border-border-subtle'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">photo_camera</span>
          Fotografia Autoral & Acervo ({photos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('projects')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'projects'
              ? 'bg-[#FFCC00] text-[#121212] shadow-lg shadow-[#FFCC00]/10'
              : 'text-fg-secondary hover:text-fg bg-surface border border-border-subtle'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">terminal</span>
          Projetos de Software & Design ({projects.length})
        </button>
      </div>

      {/* CONTEÚDO DA SUB-ABA 1: GALERIA PASSE-PARTOUT DE FOTOGRAFIA */}
      {activeSubTab === 'photos' && (
        <div className="space-y-6">
          <AurtisticGalleryGrid
            items={photos}
            serverUrl={serverUrl}
            isOwner={!isReadOnly}
            username={publicSlug || profile?.username}
            ticket={vaultTicket || activeTicket || ''}
            onOpenUploadModal={() => setIsPhotoPickerOpen(true)}
            onItemUpdated={handleItemUpdated}
            onSyncPortfolio={handleSyncPortfolio}
            isSyncing={isSyncing}
          />

          {/* Modal de Anexar / Subir Fotos do Servidor para o Portfólio */}
          {isPhotoPickerOpen && !isReadOnly && (
            <TaskFilePickerModal
              isOpen={isPhotoPickerOpen}
              onClose={() => setIsPhotoPickerOpen(false)}
              taskId=""
              taskTitle="Portfólio de Fotografia"
              initialFolder="Portfolio"
              initialTab={photos.length === 0 ? 'upload' : 'browse'}
              currentlyLinkedPaths={photos.map((p) => p.relative_path)}
              ticket={vaultTicket || activeTicket || ''}
              serverUrl={serverUrl}
              onLinkedUpdated={async () => {
                setIsPhotoPickerOpen(false);
                await handleSyncPortfolio(false);
              }}
            />
          )}
        </div>
      )}

      {/* CONTEÚDO DA SUB-ABA 2: PROJETOS DE SOFTWARE & DESIGN */}
      {activeSubTab === 'projects' && (
        <div>
          {isEditing ? (
            /* EDITOR MODE DE PROJETOS */
            <div className="max-w-4xl mx-auto w-full bg-surface border border-border-subtle p-6 md:p-8 rounded-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-border-subtle pb-3">
                <h2 className="text-xl font-bold text-fg flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00]">folder_special</span>
                  Editar Projetos do Portfólio
                </h2>
                <button
                  type="button"
                  onClick={addProject}
                  className="px-3 py-1.5 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded text-xs font-bold transition-colors"
                >
                  + Novo Projeto
                </button>
              </div>

              <div className="space-y-6">
                {projects.map((proj, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-app border border-border-subtle rounded-xl space-y-3 relative"
                  >
                    <button
                      type="button"
                      onClick={() => removeProject(idx)}
                      className="absolute top-3 right-3 text-red-500 hover:text-red-400 text-xs font-bold"
                    >
                      Excluir
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-fg-secondary mb-1">
                          Título do Projeto
                        </label>
                        <input
                          type="text"
                          value={proj.title}
                          onChange={(e) => updateProject(idx, 'title', e.target.value)}
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-fg-secondary mb-1">
                          Link do Projeto (URL)
                        </label>
                        <input
                          type="text"
                          value={proj.link}
                          onChange={(e) => updateProject(idx, 'link', e.target.value)}
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs text-fg-secondary mb-1">
                          URL da Imagem / Logo
                        </label>
                        <input
                          type="text"
                          value={proj.image_url}
                          onChange={(e) => updateProject(idx, 'image_url', e.target.value)}
                          placeholder="Ex: /aurtistic-icon.png"
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-fg-secondary mb-1">
                          Tags / Tecnologias (separadas por vírgula)
                        </label>
                        <input
                          type="text"
                          value={proj.tags ? proj.tags.join(', ') : ''}
                          onChange={(e) =>
                            updateProject(
                              idx,
                              'tags',
                              e.target.value.split(',').map((s) => s.trim())
                            )
                          }
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-fg-secondary mb-1">Descrição</label>
                      <textarea
                        value={proj.description}
                        onChange={(e) => updateProject(idx, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD] resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Iframe config opcional */}
              <div className="border-t border-border-subtle/60 pt-6 mt-6 space-y-4">
                <h3 className="text-lg font-bold text-fg flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00]">photo_library</span>
                  Galeria Externa de Fotografia (Opcional)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">
                      Link da Galeria Externa
                    </label>
                    <input
                      type="text"
                      value={iframeUrl}
                      onChange={(e) => setIframeUrl(e.target.value)}
                      placeholder="https://exemplo.com/galeria"
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Título</label>
                    <input
                      type="text"
                      value={iframeTitle}
                      onChange={(e) => setIframeTitle(e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW MODE DE PROJETOS */
            <main className="max-w-5xl mx-auto space-y-12">
              {projects.length === 0 ? (
                <div className="text-center p-12 bg-surface border border-border-subtle rounded-2xl">
                  <span className="material-symbols-outlined text-[64px] text-[#FFCC00] mb-3">
                    terminal
                  </span>
                  <h3 className="text-lg font-bold text-fg mb-2">Nenhum projeto cadastrado</h3>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleUseDefaultTemplate}
                      className="px-4 py-2 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-lg text-xs transition-colors"
                    >
                      Carregar Projetos Modelo
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {projects.map((proj, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl p-[1px] bg-gradient-brand-soft hover:bg-gradient-brand transition-all"
                    >
                      <div className="bg-surface rounded-[15px] border border-border-subtle flex flex-col md:flex-row items-center justify-between p-6 sm:p-8 hover:bg-surface-hover transition-colors gap-6 group">
                        {proj.image_url && (
                          <div className="w-20 h-20 rounded-2xl bg-app border border-border-subtle p-2 flex items-center justify-center shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={
                                proj.title === 'HUB LabDiv'
                                  ? '/icone-HUBLabDiv.svg'
                                  : proj.image_url
                              }
                              alt={proj.title}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/aurtistic-icon.png';
                              }}
                            />
                          </div>
                        )}

                        <div className="space-y-3 text-center md:text-left flex-1">
                          <h3 className="text-xl font-['Bukra'] font-bold text-fg">
                            {proj.title}
                          </h3>
                          <p className="text-fg-secondary text-sm max-w-3xl leading-relaxed">
                            {proj.description}
                          </p>

                          {proj.tags && proj.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                              {proj.tags
                                .filter((t) => t.trim() !== '')
                                .map((tag, tidx) => (
                                  <span
                                    key={tidx}
                                    className="px-2.5 py-0.5 bg-surface-hover border border-border-strong text-[#FFCC00] text-xs font-semibold rounded-full"
                                  >
                                    {tag}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>

                        {proj.link && (
                          <div className="shrink-0 w-full md:w-auto">
                            <a
                              href={proj.link}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-center py-2.5 px-6 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-lg text-sm transition-colors"
                            >
                              Acessar Projeto
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          )}
        </div>
      )}
    </div>
  );
}
