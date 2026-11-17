// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/dashboard/PortfolioClient.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { saveUserProfileData, syncPortfolioAction } from '@/app/(dashboard)/actions';
import { AurtisticGalleryGrid } from '@/components/portfolio/AurtisticGalleryGrid';
import { PhotoInspectItem } from '@/components/portfolio/PhotoInspectModal';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { PressClippingsSection } from '@/components/portfolio/PressClippingsSection';
import { InstagramMuralSection } from '@/components/portfolio/InstagramMuralSection';
import type {
  InstagramMentionEmbed,
  PressClippingItem,
  PortfolioSectionConfig,
  PortfolioSectionId,
} from '@/types/portfolio';

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
  hidden?: boolean;
}

const DEFAULT_PORTFOLIO_SECTIONS: PortfolioSectionConfig[] = [
  { id: 'photos', title: 'Fotografia Autoral & Acervo', enabled: true, order: 0 },
  { id: 'press', title: 'Na Mídia / Jornal', enabled: true, order: 1 },
  { id: 'instagram', title: 'Mural Instagram', enabled: true, order: 2 },
  { id: 'projects', title: 'Projetos de Software & Design', enabled: true, order: 3 },
];

export default function PortfolioClient({
  initialProfile,
  isReadOnly = false,
  portfolioPhotos = [],
  publicSlug,
  serverUrl,
}: PortfolioClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sub-abas do Portfólio Unificado e Configuração Modular de Seções
  const [sectionsConfig, setSectionsConfig] = useState<PortfolioSectionConfig[]>(() => {
    const saved = profile?.features_config?.portfolio_sections;
    if (Array.isArray(saved) && saved.length > 0) {
      const merged = DEFAULT_PORTFOLIO_SECTIONS.map((def) => {
        const found = saved.find((s: PortfolioSectionConfig) => s.id === def.id);
        return found ? { ...def, ...found } : def;
      });
      return merged.sort((a, b) => a.order - b.order);
    }
    return DEFAULT_PORTFOLIO_SECTIONS;
  });
  const [isCustomizingSections, setIsCustomizingSections] = useState(false);

  const visibleSections = useMemo(() => {
    return sectionsConfig.filter((s) => s.enabled);
  }, [sectionsConfig]);

  const [activeSubTab, setActiveSubTab] = useState<PortfolioSectionId>(() => {
    const firstEnabled = sectionsConfig.find((s) => s.enabled);
    return firstEnabled ? firstEnabled.id : 'photos';
  });

  useEffect(() => {
    if (visibleSections.length > 0 && !visibleSections.some((s: PortfolioSectionConfig) => s.id === activeSubTab)) {
      setActiveSubTab(visibleSections[0].id);
    }
  }, [visibleSections, activeSubTab]);

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectionsConfig.length) return;
    const next = [...sectionsConfig];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    const updated = next.map((item, idx) => ({ ...item, order: idx }));
    setSectionsConfig(updated);
  };

  const toggleSectionEnabled = (id: PortfolioSectionId) => {
    const next = sectionsConfig.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    if (!next.some((s) => s.enabled)) {
      alert('Ao menos uma seção do portfólio deve permanecer ativa.');
      return;
    }
    setSectionsConfig(next);
  };

  const updateSectionTitle = (id: PortfolioSectionId, newTitle: string) => {
    setSectionsConfig((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  // Curadoria Centralizada de Itens da Vitrine
  const [hiddenPhotoIds, setHiddenPhotoIds] = useState<string[]>(() => {
    return Array.isArray(profile?.features_config?.hidden_photo_ids)
      ? (profile.features_config.hidden_photo_ids as string[])
      : [];
  });

  const [hiddenPhotoFolders, setHiddenPhotoFolders] = useState<string[]>(() => {
    return Array.isArray(profile?.features_config?.hidden_photo_folders)
      ? (profile.features_config.hidden_photo_folders as string[])
      : [];
  });

  const [curatingSection, setCuratingSection] = useState<PortfolioSectionId>('photos');
  const [curatingAlbum, setCuratingAlbum] = useState<string>('all');

  const togglePhotoHidden = (id: string) => {
    setHiddenPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFolderHidden = (folder: string) => {
    setHiddenPhotoFolders((prev) =>
      prev.includes(folder) ? prev.filter((f) => f !== folder) : [...prev, folder]
    );
  };

  const saveSectionsLayout = async () => {
    setIsSaving(true);
    try {
      const updatedFeaturesConfig = {
        ...(profile?.features_config || {}),
        portfolio_sections: sectionsConfig,
        hidden_photo_ids: hiddenPhotoIds,
        hidden_photo_folders: hiddenPhotoFolders,
        press_clippings: pressClippings,
        instagram_embeds: instagramEmbeds,
      };
      await saveUserProfileData({
        portfolio: projects,
        features_config: updatedFeaturesConfig,
      });
      setProfile({
        ...profile,
        portfolio: projects,
        features_config: updatedFeaturesConfig,
      });
      setIsCustomizingSections(false);
      router.refresh();
    } catch (e) {
      alert('Erro ao salvar estrutura: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const [pressClippings, setPressClippings] = useState<PressClippingItem[]>(() =>
    Array.isArray(profile?.features_config?.press_clippings)
      ? (profile.features_config.press_clippings as PressClippingItem[])
      : []
  );
  const [instagramEmbeds, setInstagramEmbeds] = useState<InstagramMentionEmbed[]>(() =>
    Array.isArray(profile?.features_config?.instagram_embeds)
      ? (profile.features_config.instagram_embeds as InstagramMentionEmbed[])
      : []
  );

  const handleSavePressClippings = async (next: PressClippingItem[]) => {
    const updatedFeaturesConfig = {
      ...(profile?.features_config || {}),
      press_clippings: next,
    };
    await saveUserProfileData({ features_config: updatedFeaturesConfig });
    setPressClippings(next);
    setProfile({ ...profile, features_config: updatedFeaturesConfig });
    router.refresh();
  };

  const handleSaveInstagramEmbeds = async (next: InstagramMentionEmbed[]) => {
    const updatedFeaturesConfig = {
      ...(profile?.features_config || {}),
      instagram_embeds: next,
    };
    await saveUserProfileData({ features_config: updatedFeaturesConfig });
    setInstagramEmbeds(next);
    setProfile({ ...profile, features_config: updatedFeaturesConfig });
    router.refresh();
  };

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
  const [isEditingPhotos, setIsEditingPhotos] = useState(false);
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

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setIsCustomizingSections((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isCustomizingSections
                  ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00] shadow-md shadow-[#FFCC00]/15'
                  : 'bg-surface hover:bg-surface-hover border-border-subtle hover:border-[#FFCC00] text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">
                {isCustomizingSections ? 'close' : 'tune'}
              </span>
              {isCustomizingSections ? 'Fechar Personalização' : 'Personalizar Portfólio'}
            </button>
          )}

          {!isReadOnly && activeSubTab === 'photos' && (
            <button
              type="button"
              onClick={() => setIsEditingPhotos((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isEditingPhotos
                  ? 'bg-[#FFCC00] text-[#121212] border-[#FFCC00] shadow-md shadow-[#FFCC00]/15 font-black'
                  : 'bg-surface hover:bg-surface-hover border-border-subtle hover:border-[#FFCC00] text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isEditingPhotos ? 'done' : 'edit'}
              </span>
              {isEditingPhotos ? 'Concluir Edição do Portfólio' : 'Editar Portfólio'}
            </button>
          )}

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

      {/* Painel de Personalização Modular de Seções */}
      {isCustomizingSections && !isReadOnly && (
        <div className="mb-6 p-5 bg-surface border border-[#FFCC00]/30 rounded-2xl shadow-xl shadow-black/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
            <div>
              <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FFCC00] text-[18px]">tune</span>
                Estrutura & Ordem das Seções da Vitrine
              </h3>
              <p className="text-xs text-fg-muted mt-0.5">
                Monte o seu espaço escolhendo quais seções exibir e organizando a ordem das abas na vitrine pública.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSectionsConfig(DEFAULT_PORTFOLIO_SECTIONS)}
                className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary hover:text-fg transition-colors"
              >
                Restaurar Padrão
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={saveSectionsLayout}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#FFCC00] text-[#121212] text-xs font-bold hover:bg-[#FFCC00]/90 transition-all cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                {isSaving ? 'Salvando...' : 'Salvar Estrutura'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionsConfig.map((sec, idx) => (
              <div
                key={sec.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  sec.enabled ? 'bg-app border-border-subtle' : 'bg-surface/50 border-border-subtle/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col items-center justify-center shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveSection(idx, 'up')}
                      className="text-fg-secondary hover:text-[#FFCC00] disabled:opacity-20 cursor-pointer"
                      title="Mover para cima"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_drop_up</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === sectionsConfig.length - 1}
                      onClick={() => moveSection(idx, 'down')}
                      className="text-fg-secondary hover:text-[#FFCC00] disabled:opacity-20 cursor-pointer"
                      title="Mover para baixo"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
                    </button>
                  </div>

                  <span className="material-symbols-outlined text-[20px] text-[#FFCC00] shrink-0">
                    {sec.id === 'photos'
                      ? 'photo_camera'
                      : sec.id === 'press'
                      ? 'newspaper'
                      : sec.id === 'instagram'
                      ? 'photo_library'
                      : 'terminal'}
                  </span>

                  <input
                    type="text"
                    value={sec.title}
                    onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                    className="flex-1 bg-surface border border-border-subtle rounded-lg px-2.5 py-1 text-xs text-fg focus:outline-none focus:border-[#FFCC00]"
                  />
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={sec.enabled}
                    onChange={() => toggleSectionEnabled(sec.id)}
                    className="accent-[#FFCC00]"
                  />
                  <span className="text-[11px] font-bold text-fg-secondary">
                    {sec.enabled ? 'Ativa' : 'Oculta'}
                  </span>
                </label>
              </div>
            ))}
          </div>

          {/* Nível 2: Curadoria Centralizada de Itens por Seção */}
          <div className="border-t border-border-subtle pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-fg flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#FFCC00] text-[16px]">visibility</span>
                  Curadoria de Itens Individuais
                </h4>
                <p className="text-[11px] text-fg-muted">
                  Selecione uma seção para definir quais itens específicos ou pastas ficam visíveis para o público.
                </p>
              </div>

              {/* Sub-abas de Curadoria */}
              <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle shrink-0">
                {(['photos', 'press', 'instagram', 'projects'] as PortfolioSectionId[]).map((secKey) => (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => setCuratingSection(secKey)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      curatingSection === secKey
                        ? 'bg-[#FFCC00] text-black shadow-sm font-black'
                        : 'text-fg-secondary hover:text-fg'
                    }`}
                  >
                    {secKey === 'photos'
                      ? 'Fotos'
                      : secKey === 'press'
                      ? 'Imprensa'
                      : secKey === 'instagram'
                      ? 'Instagram'
                      : 'Projetos'}
                  </button>
                ))}
              </div>
            </div>

            {/* Curadoria 1: Fotografia Autoral */}
            {curatingSection === 'photos' && (
              <div className="p-3 bg-app rounded-xl border border-border-subtle space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-fg-secondary">
                    Controle de Pastas / Álbuns de Fotos:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(photos.map((p) => p.album || 'Geral'))).map((albumName) => {
                      const isFolderHidden = hiddenPhotoFolders.includes(albumName);
                      return (
                        <button
                          key={albumName}
                          type="button"
                          onClick={() => toggleFolderHidden(albumName)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                            isFolderHidden
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-surface border-border-subtle text-fg hover:border-[#FFCC00]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {isFolderHidden ? 'visibility_off' : 'folder'}
                          </span>
                          <span>{albumName}</span>
                          <span className="text-[9px] opacity-70">
                            {isFolderHidden ? '(Oculto)' : '(Ativo)'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grade de Fotos Individuais */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-fg-muted">
                      Fotos Individuais ({photos.length}):
                    </span>
                    <span className="text-[10px] text-fg-muted">
                      {hiddenPhotoIds.length} foto(s) ocultada(s)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
                    {photos.slice(0, 48).map((photo) => {
                      const isHidden =
                        hiddenPhotoIds.includes(photo.id) ||
                        hiddenPhotoIds.includes(photo.relative_path) ||
                        Boolean(photo.album && hiddenPhotoFolders.includes(photo.album));
                      return (
                        <button
                          key={photo.id || photo.relative_path}
                          type="button"
                          onClick={() => togglePhotoHidden(photo.id || photo.relative_path)}
                          title={`${photo.filename} • ${isHidden ? 'Clique para Exibir' : 'Clique para Ocultar'}`}
                          className={`relative aspect-square rounded-lg overflow-hidden border transition-all cursor-pointer group ${
                            isHidden
                              ? 'border-amber-500/60 opacity-50'
                              : 'border-border-subtle hover:border-[#FFCC00]'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.signedThumbUrl || photo.signedStreamUrl}
                            alt={photo.filename}
                            className="w-full h-full object-cover"
                          />
                          <span
                            className={`absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-bold transition-opacity ${
                              isHidden ? 'opacity-100 text-amber-300' : 'opacity-0 group-hover:opacity-100 text-white'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {isHidden ? 'visibility_off' : 'visibility'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Curadoria 2: Na Mídia / Imprensa */}
            {curatingSection === 'press' && (
              <div className="p-3 bg-app rounded-xl border border-border-subtle space-y-2">
                <span className="text-[11px] font-bold text-fg-secondary block mb-1">
                  Recortes de Imprensa Cadastrados:
                </span>
                {pressClippings.length === 0 ? (
                  <p className="text-xs text-fg-muted">Nenhum recorte cadastrado.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {pressClippings.map((clip, cIdx) => (
                      <div
                        key={clip.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border-subtle text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-fg truncate">{clip.title}</p>
                          <p className="text-[10px] text-fg-muted">{clip.newspaperName} • {clip.publicationDate}</p>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer ml-3 shrink-0">
                          <input
                            type="checkbox"
                            checked={!clip.hidden}
                            onChange={(e) => {
                              const next = [...pressClippings];
                              next[cIdx] = { ...next[cIdx], hidden: !e.target.checked };
                              setPressClippings(next);
                            }}
                            className="accent-[#FFCC00]"
                          />
                          <span className="text-[10px] font-bold text-fg-secondary">
                            {!clip.hidden ? 'Visível' : 'Oculto'}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Curadoria 3: Mural do Instagram */}
            {curatingSection === 'instagram' && (
              <div className="p-3 bg-app rounded-xl border border-border-subtle space-y-2">
                <span className="text-[11px] font-bold text-fg-secondary block mb-1">
                  Publicações do Instagram no Mural:
                </span>
                {instagramEmbeds.length === 0 ? (
                  <p className="text-xs text-fg-muted">Nenhum post incorporado.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {instagramEmbeds.map((emb, eIdx) => (
                      <div
                        key={emb.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border-subtle text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-fg truncate">{emb.accountHandle}</p>
                          <p className="text-[10px] text-fg-muted">{emb.photoCreditNote}</p>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer ml-3 shrink-0">
                          <input
                            type="checkbox"
                            checked={!emb.hidden}
                            onChange={(e) => {
                              const next = [...instagramEmbeds];
                              next[eIdx] = { ...next[eIdx], hidden: !e.target.checked };
                              setInstagramEmbeds(next);
                            }}
                            className="accent-[#FFCC00]"
                          />
                          <span className="text-[10px] font-bold text-fg-secondary">
                            {!emb.hidden ? 'Visível' : 'Oculto'}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Curadoria 4: Projetos de Software */}
            {curatingSection === 'projects' && (
              <div className="p-3 bg-app rounded-xl border border-border-subtle space-y-2">
                <span className="text-[11px] font-bold text-fg-secondary block mb-1">
                  Projetos de Software & Design:
                </span>
                {projects.length === 0 ? (
                  <p className="text-xs text-fg-muted">Nenhum projeto cadastrado.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {projects.map((proj, pIdx) => (
                      <div
                        key={pIdx}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border-subtle text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-fg truncate">{proj.title}</p>
                          <p className="text-[10px] text-fg-muted truncate">{proj.description}</p>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer ml-3 shrink-0">
                          <input
                            type="checkbox"
                            checked={!proj.hidden}
                            onChange={(e) => {
                              const next = [...projects];
                              next[pIdx] = { ...next[pIdx], hidden: !e.target.checked };
                              setProjects(next);
                            }}
                            className="accent-[#FFCC00]"
                          />
                          <span className="text-[10px] font-bold text-fg-secondary">
                            {!proj.hidden ? 'Visível' : 'Oculto'}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seletor de Sub-Abas Dinâmico baseado em sectionsConfig */}
      <div className="flex flex-wrap items-center gap-3 mb-8 border-b border-border-subtle pb-2" data-tour="portfolio-subtabs">
        {visibleSections.map((sec: PortfolioSectionConfig) => {
          const count =
            sec.id === 'photos'
              ? photos.length
              : sec.id === 'press'
              ? pressClippings.length
              : sec.id === 'instagram'
              ? instagramEmbeds.length
              : projects.length;

          const icon =
            sec.id === 'photos'
              ? 'photo_camera'
              : sec.id === 'press'
              ? 'newspaper'
              : sec.id === 'instagram'
              ? 'photo_library'
              : 'terminal';

          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSubTab(sec.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                activeSubTab === sec.id
                  ? 'bg-[#FFCC00] text-[#121212] shadow-lg shadow-[#FFCC00]/10'
                  : 'text-fg-secondary hover:text-fg bg-surface border border-border-subtle'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              {sec.title} ({count})
            </button>
          );
        })}
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
            hiddenPhotoIds={hiddenPhotoIds}
            hiddenPhotoFolders={hiddenPhotoFolders}
            onOpenUploadModal={() => setIsPhotoPickerOpen(true)}
            onItemUpdated={handleItemUpdated}
            onSyncPortfolio={handleSyncPortfolio}
            isSyncing={isSyncing}
            isEditingPortfolio={isEditingPhotos}
            onToggleEditPortfolio={() => setIsEditingPhotos((prev) => !prev)}
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

      {/* CONTEÚDO DA SUB-ABA 2: NA MÍDIA & JORNAL IMPRESSO */}
      {activeSubTab === 'press' && (
        <PressClippingsSection
          clippings={pressClippings}
          portfolioPhotos={photos}
          serverUrl={serverUrl}
          ticket={vaultTicket || activeTicket || ''}
          isOwner={!isReadOnly}
          onSaveClippings={handleSavePressClippings}
        />
      )}

      {/* CONTEÚDO DA SUB-ABA 3: MURAL DO INSTAGRAM */}
      {activeSubTab === 'instagram' && (
        <InstagramMuralSection
          embeds={instagramEmbeds}
          portfolioPhotos={photos}
          isOwner={!isReadOnly}
          onSaveEmbeds={handleSaveInstagramEmbeds}
        />
      )}

      {/* CONTEÚDO DA SUB-ABA 4: PROJETOS DE SOFTWARE & DESIGN */}
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
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
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
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
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
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
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
                          className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-fg-secondary mb-1">Descrição</label>
                      <textarea
                        value={proj.description}
                        onChange={(e) => updateProject(idx, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary resize-y"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(proj.hidden)}
                        onChange={(e) => updateProject(idx, 'hidden', e.target.checked)}
                        className="accent-[#FFCC00]"
                      />
                      <span>Ocultar este projeto do portfólio público</span>
                    </label>
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
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Título</label>
                    <input
                      type="text"
                      value={iframeTitle}
                      onChange={(e) => setIframeTitle(e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW MODE DE PROJETOS */
            <main className="max-w-5xl mx-auto space-y-12">
              {projects.filter((p) => !isReadOnly || !p.hidden).length === 0 ? (
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
                  {projects
                    .filter((p) => !isReadOnly || !p.hidden)
                    .map((proj, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl p-[1px] transition-all ${
                        proj.hidden
                          ? 'bg-amber-500/30 opacity-75'
                          : 'bg-gradient-brand-soft hover:bg-gradient-brand'
                      }`}
                    >
                      <div className={`bg-surface rounded-[15px] border flex flex-col md:flex-row items-center justify-between p-6 sm:p-8 hover:bg-surface-hover transition-colors gap-6 group ${
                        proj.hidden ? 'border-dashed border-amber-500/40' : 'border-border-subtle'
                      }`}>
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
                          <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                            {proj.hidden && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                                Oculto
                              </span>
                            )}
                            <h3 className="text-xl font-['Bukra'] font-bold text-fg">
                              {proj.title}
                            </h3>
                          </div>
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
