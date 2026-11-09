// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { saveUserProfileData } from '@/app/(dashboard)/actions';
import { updateFileEcosystemLinksAction } from '@/app/(dashboard)/servidor/actions';
import { buildTenantStreamUrl, formatStorageBytes } from '@/lib/edge-urls';
import { useAurtisticMedia } from '@/components/media/AurtisticMediaContext';
import { TaskFilePickerModal } from '@/components/tarefas/TaskFilePickerModal';
import type { UserFileIndexRow } from '@/types';

export interface CurriculoClientProps {
  initialProfile: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  isReadOnly?: boolean;
  curriculumDocs?: Array<
    UserFileIndexRow & {
      itemTicket?: string;
      signedThumbUrl?: string;
      signedStreamUrl?: string;
    }
  >;
  serverUrl?: string;
  userId?: string;
}


interface CVExperience {
  role: string;
  company: string;
  period: string;
  bullets: string[];
}

interface CVEducation {
  institution: string;
  period: string;
  degree: string;
  bullets: string[];
}

interface CVData {
  name: string;
  role: string;
  phone: string;
  email: string;
  address: string;
  github: string;
  instagram?: string;
  linkedin?: string;
  summary: string;
  experiences: CVExperience[];
  education: CVEducation[];
  skills: string[];
}

export default function CurriculoClient({
  initialProfile,
  isReadOnly = false,
  curriculumDocs = [],
  serverUrl,
}: CurriculoClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Certificados e Evidências Verificadas
  const [docs, setDocs] = useState(curriculumDocs);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [editingDocPath, setEditingDocPath] = useState<string | null>(null);
  const [editingDocLabel, setEditingDocLabel] = useState<string>('');
  const { openPhotoInPlace, vaultTicket, activeTicket } = useAurtisticMedia();

  const handleSaveDocLabel = async (relPath: string) => {
    try {
      const cleanLabel = editingDocLabel.trim() || null;
      const res = await updateFileEcosystemLinksAction({
        relativePath: relPath,
        patch: {
          curriculumLabel: cleanLabel,
        },
      });
      if (res.ok) {
        setDocs((prev) =>
          prev.map((d) =>
            d.relative_path === relPath ? { ...d, curriculum_label: cleanLabel } : d
          )
        );
      }
    } catch (err) {
      console.warn('Falha ao atualizar rótulo do certificado:', err);
    } finally {
      setEditingDocPath(null);
    }
  };

  const handleRemoveDoc = async (relPath: string) => {
    try {
      const res = await updateFileEcosystemLinksAction({
        relativePath: relPath,
        patch: {
          showInCurriculum: false,
        },
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.relative_path !== relPath));
      }
    } catch (err) {
      console.warn('Falha ao desvincular certificado:', err);
    }
  };

  // Default initial empty data structure
  const emptyCV: CVData = {
    name: 'Seu Nome Completo',
    role: 'Seu Cargo ou Descrição Curta',
    phone: '(00) 00000-0000',
    email: 'seu.email@exemplo.com',
    address: 'Cidade - Estado',
    github: '',
    instagram: '',
    linkedin: '',
    summary: 'Breve resumo sobre sua trajetória...',
    experiences: [],
    education: [],
    skills: []
  };

  let initialCVData = emptyCV;
  try {
    if (profile?.curriculo && Array.isArray(profile.curriculo) === false && typeof profile.curriculo === 'object') {
      initialCVData = profile.curriculo as CVData;
    } else if (profile?.curriculo && Array.isArray(profile.curriculo)) {
      // If it is stored as array, handle or fallback
      initialCVData = emptyCV;
    }
  } catch (e) {
    console.error(e);
  }

  const [cvData, setCvData] = useState<CVData>(initialCVData);

  // Local editing states
  const [newSkill, setNewSkill] = useState('');

  const handleSave = async (dataToSave = cvData) => {
    setIsSaving(true);
    try {
      await saveUserProfileData({ curriculo: dataToSave });
      setProfile({ ...profile, curriculo: dataToSave });
      setIsEditing(false);
    } catch (e) {
      alert("Erro ao salvar currículo: " + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseDefaultTemplate = () => {
    const template: CVData = {
      name: 'Seu Nome Completo',
      role: 'Desenvolvedor Full-Stack | Designer UX/UI',
      phone: '(11) 99999-9999',
      email: 'seuemail@exemplo.com',
      address: 'São Paulo, SP',
      github: '/seu-usuario',
      summary: 'Resumo profissional contendo seus principais objetivos, realizações e motivações. Edite este conteúdo clicando no botão Editar no topo do card.',
      experiences: [
        {
          role: 'Desenvolvedor Frontend Pleno',
          company: 'Empresa de Tecnologia S.A.',
          period: '2023 - Presente',
          bullets: [
            'Desenvolvimento de aplicações responsivas utilizando React e Next.js.',
            'Otimização de performance web e acessibilidade.',
            'Colaboração próxima com equipes de design e gerenciamento de produto.'
          ]
        },
        {
          role: 'Desenvolvedor Frontend Júnior',
          company: 'Soluções Digitais Ltda',
          period: '2021 - 2023',
          bullets: [
            'Manutenção de sistemas legados e criação de novas landing pages.',
            'Integração de APIs RESTful.',
            'Testes unitários e correção de bugs.'
          ]
        }
      ],
      education: [
        {
          institution: 'Universidade de Tecnologia',
          period: '2018 - 2022',
          degree: 'Bacharelado em Ciência da Computação',
          bullets: [
            'Participação em projetos acadêmicos de desenvolvimento de software.'
          ]
        }
      ],
      skills: ['React.js', 'Next.js', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3', 'Git', 'SQL']
    };
    setCvData(template);
    handleSave(template);
  };

  const addExperience = () => {
    setCvData({
      ...cvData,
      experiences: [...cvData.experiences, { role: '', company: '', period: '', bullets: [''] }]
    });
  };

  const removeExperience = (index: number) => {
    setCvData({
      ...cvData,
      experiences: cvData.experiences.filter((_, i) => i !== index)
    });
  };

  const updateExperience = (index: number, field: keyof CVExperience, value: unknown) => {
    const updated = [...cvData.experiences];
    updated[index] = { ...updated[index], [field]: value } as CVExperience;
    setCvData({ ...cvData, experiences: updated });
  };

  const addEducation = () => {
    setCvData({
      ...cvData,
      education: [...cvData.education, { institution: '', period: '', degree: '', bullets: [''] }]
    });
  };

  const removeEducation = (index: number) => {
    setCvData({
      ...cvData,
      education: cvData.education.filter((_, i) => i !== index)
    });
  };

  const updateEducation = (index: number, field: keyof CVEducation, value: unknown) => {
    const updated = [...cvData.education];
    updated[index] = { ...updated[index], [field]: value } as CVEducation;
    setCvData({ ...cvData, education: updated });
  };

  const addSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill.trim()) return;
    if (cvData.skills.includes(newSkill.trim())) return;
    setCvData({ ...cvData, skills: [...cvData.skills, newSkill.trim()] });
    setNewSkill('');
  };

  const removeSkill = (skill: string) => {
    setCvData({ ...cvData, skills: cvData.skills.filter(s => s !== skill) });
  };

  const isSetupEmpty = !profile?.curriculo || (Array.isArray(profile.curriculo) && profile.curriculo.length === 0);

  if (isSetupEmpty && !isEditing) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-8 bg-app text-center text-fg">
        <div className="max-w-md p-8 bg-surface border border-border-subtle rounded-2xl shadow-xl backdrop-blur-md">
          <span className="material-symbols-outlined text-[64px] text-[#FFCC00] mb-4">badge</span>
          <h2 className="text-2xl font-bold text-fg mb-2">Configure seu Currículo</h2>
          <p className="text-fg-secondary text-sm mb-6">
            Seu Currículo Profissional está vazio. Você pode preenchê-lo do zero ou pré-carregar o modelo padrão.
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
                Preencher do Zero
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
          <p className="text-sm text-fg-muted mt-1.5">Estruturação de histórico profissional e acadêmico.</p>
        </div>

        {/* Action buttons */}
        {!isReadOnly && (
          <div className="flex gap-3">
            {isEditing && (
              <button 
                onClick={() => {
                  setCvData(initialCVData);
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
        <div className="max-w-4xl mx-auto w-full bg-surface border border-border-subtle p-6 md:p-8 rounded-2xl space-y-8">
          <h2 className="text-xl font-bold text-fg mb-4 border-b border-border-subtle pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00]">badge</span>
            Editar Informações do Currículo
          </h2>

          {/* Contact Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Dados Pessoais e Contato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Nome Completo</label>
                <input 
                  type="text"
                  value={cvData.name}
                  onChange={e => setCvData({...cvData, name: e.target.value})}
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Cargo / Especialidade</label>
                <input 
                  type="text"
                  value={cvData.role}
                  onChange={e => setCvData({...cvData, role: e.target.value})}
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Telefone</label>
                <input 
                  type="text"
                  value={cvData.phone}
                  onChange={e => setCvData({...cvData, phone: e.target.value})}
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">E-mail</label>
                <input 
                  type="email"
                  value={cvData.email}
                  onChange={e => setCvData({...cvData, email: e.target.value})}
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Endereço / Localização</label>
                <input 
                  type="text"
                  value={cvData.address}
                  onChange={e => setCvData({...cvData, address: e.target.value})}
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Usuário do GitHub</label>
                <input 
                  type="text"
                  value={cvData.github}
                  onChange={e => setCvData({...cvData, github: e.target.value})}
                  placeholder="Ex: /JoaoStangorlini"
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Usuário do LinkedIn</label>
                <input 
                  type="text"
                  value={cvData.linkedin || ''}
                  onChange={e => setCvData({...cvData, linkedin: e.target.value})}
                  placeholder="Ex: /in/joaostangorlini"
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">Usuário do Instagram</label>
                <input 
                  type="text"
                  value={cvData.instagram || ''}
                  onChange={e => setCvData({...cvData, instagram: e.target.value})}
                  placeholder="Ex: @stangorlini"
                  className="w-full bg-app border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
            </div>
          </div>

          {/* Professional Experiences */}
          <div className="space-y-4 pt-4 border-t border-border-subtle">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Experiências Profissionais</h3>
              <button 
                onClick={addExperience}
                className="px-3 py-1 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded text-xs font-bold transition-colors"
              >
                + Adicionar Experiência
              </button>
            </div>

            {cvData.experiences.map((exp, idx) => (
              <div key={idx} className="p-4 bg-app border border-border-subtle rounded-xl space-y-3 relative">
                <button 
                  onClick={() => removeExperience(idx)}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-400 text-xs font-bold"
                >
                  Excluir
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Cargo</label>
                    <input 
                      type="text"
                      value={exp.role}
                      onChange={e => updateExperience(idx, 'role', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Empresa / Projeto</label>
                    <input 
                      type="text"
                      value={exp.company}
                      onChange={e => updateExperience(idx, 'company', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Período</label>
                    <input 
                      type="text"
                      value={exp.period}
                      onChange={e => updateExperience(idx, 'period', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-fg-secondary mb-1">Descrição / Conquistas (Linhas separadas por Enter viram tópicos)</label>
                  <textarea 
                    value={exp.bullets ? exp.bullets.join('\n') : ''}
                    onChange={e => updateExperience(idx, 'bullets', e.target.value.split('\n'))}
                    rows={3}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD] resize-y"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Education */}
          <div className="space-y-4 pt-4 border-t border-border-subtle">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Formação Acadêmica</h3>
              <button 
                onClick={addEducation}
                className="px-3 py-1 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded text-xs font-bold transition-colors"
              >
                + Adicionar Formação
              </button>
            </div>

            {cvData.education.map((edu, idx) => (
              <div key={idx} className="p-4 bg-app border border-border-subtle rounded-xl space-y-3 relative">
                <button 
                  onClick={() => removeEducation(idx)}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-400 text-xs font-bold"
                >
                  Excluir
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Instituição</label>
                    <input 
                      type="text"
                      value={edu.institution}
                      onChange={e => updateEducation(idx, 'institution', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Curso / Grau</label>
                    <input 
                      type="text"
                      value={edu.degree}
                      onChange={e => updateEducation(idx, 'degree', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-secondary mb-1">Período</label>
                    <input 
                      type="text"
                      value={edu.period}
                      onChange={e => updateEducation(idx, 'period', e.target.value)}
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-fg-secondary mb-1">Detalhes adicionais (Linhas separadas por Enter viram tópicos)</label>
                  <textarea 
                    value={edu.bullets ? edu.bullets.join('\n') : ''}
                    onChange={e => updateEducation(idx, 'bullets', e.target.value.split('\n'))}
                    rows={3}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD] resize-y"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="space-y-4 pt-4 border-t border-border-subtle">
            <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Habilidades</h3>
            
            <form onSubmit={addSkill} className="flex gap-2">
              <input 
                type="text"
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                placeholder="Ex: Next.js"
                className="bg-app border border-border-subtle rounded-lg px-4 py-2 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-[#9D4EDD] hover:bg-[#8B3DCA] text-fg rounded-lg text-xs font-bold transition-colors"
              >
                Adicionar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {cvData.skills.map((skill, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1 bg-app border border-border-subtle text-fg rounded-full text-xs font-medium">
                  {skill}
                  <button 
                    type="button" 
                    onClick={() => removeSkill(skill)}
                    className="text-fg-muted hover:text-red-500 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* VISUAL PREVIEW / VIEW MODE */
        <main className="pt-10 pb-16 px-6 max-w-4xl mx-auto space-y-16 relative z-10">
          {/* Header */}
          <section className="space-y-6 border-b border-border-subtle pb-12" data-tour="curriculo-header">
            <div>
              <h1 className="text-5xl font-['Bukra'] font-black text-fg leading-tight">
                {cvData.name.split(' ').slice(0, 2).join(' ')} <span className="text-[#FFCC00]">{cvData.name.split(' ').slice(2).join(' ')}</span>
              </h1>
              <p className="text-xl text-fg-secondary mt-4">{cvData.role}</p>
            </div>
            
            <div className="flex flex-wrap gap-x-8 gap-y-4 pt-4 text-sm">
              {cvData.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">Telefone:</span>
                  <span>{cvData.phone}</span>
                </div>
              )}
              {cvData.email && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">E-mail:</span>
                  <a href={`mailto:${cvData.email}`} className="hover:text-fg transition-colors underline">{cvData.email}</a>
                </div>
              )}
              {cvData.address && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">Endereço:</span>
                  <span>{cvData.address}</span>
                </div>
              )}
              {cvData.github && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">GitHub:</span>
                  <a href={`https://github.com${cvData.github.startsWith('/') ? '' : '/'}${cvData.github}`} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors underline">{cvData.github}</a>
                </div>
              )}
              {cvData.linkedin && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">LinkedIn:</span>
                  <a href={`https://linkedin.com${cvData.linkedin.startsWith('/') ? '' : '/in/'}${cvData.linkedin}`} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors underline">{cvData.linkedin}</a>
                </div>
              )}
              {cvData.instagram && (
                <div className="flex items-center gap-2">
                  <span className="text-[#FFCC00] font-bold">Instagram:</span>
                  <a href={`https://instagram.com/${cvData.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors underline">{cvData.instagram}</a>
                </div>
              )}
            </div>
          </section>

          {/* Professional Experiences */}
          {cvData.experiences && cvData.experiences.length > 0 && (
            <section className="space-y-8">
              <h2 className="text-3xl font-['Bukra'] font-bold text-fg border-l-4 border-[#3B1E43] pl-4">Experiência Profissional</h2>
              <div className="space-y-8">
                {cvData.experiences.map((exp, idx) => (
                  <div key={idx} className="bg-surface border border-border-subtle p-6 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#FFCC00]" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pl-2">
                      <h3 className="text-xl font-bold text-fg">
                        {exp.role} <span className="text-[#FFCC00]">| {exp.company}</span>
                      </h3>
                      <span className="text-xs font-bold uppercase tracking-wider text-fg-secondary bg-surface-hover px-3 py-1 rounded-full">{exp.period}</span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="list-disc list-outside ml-7 text-fg-secondary space-y-2">
                        {exp.bullets.filter(b => b.trim() !== '').map((bullet, bidx) => (
                          <li key={bidx}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          {cvData.education && cvData.education.length > 0 && (
            <section className="space-y-8">
              <h2 className="text-3xl font-['Bukra'] font-bold text-fg border-l-4 border-[#FFCC00] pl-4">Formação</h2>
              <div className="space-y-8">
                {cvData.education.map((edu, idx) => (
                  <div key={idx} className="bg-surface border border-border-subtle p-6 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#3B1E43]" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pl-2">
                      <h3 className="text-xl font-bold text-fg">{edu.institution}</h3>
                      <span className="text-xs font-bold uppercase tracking-wider text-fg-secondary bg-surface-hover px-3 py-1 rounded-full">{edu.period}</span>
                    </div>
                    <p className="text-fg font-medium pl-2 mb-3">{edu.degree}</p>
                    {edu.bullets && edu.bullets.length > 0 && (
                      <ul className="list-disc list-outside ml-7 text-fg-secondary space-y-2">
                        {edu.bullets.filter(b => b.trim() !== '').map((bullet, bidx) => (
                          <li key={bidx}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skills section */}
          {cvData.skills && cvData.skills.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-3xl font-['Bukra'] font-bold text-fg border-l-4 border-[#FFCC00] pl-4">Habilidades</h2>
              <div className="flex flex-wrap gap-2.5">
                {cvData.skills.map((skill, idx) => (
                  <span key={idx} className="px-4 py-1.5 bg-surface border border-border-subtle hover:border-[#FFCC00] text-fg rounded-full text-xs font-semibold tracking-wide transition-colors">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Certificados & Evidências Verificadas */}
          <section className="space-y-6 pt-4 border-t border-border-subtle" data-tour="curriculo-certificates">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-[#FFCC00] pl-4">
              <div>
                <h2 className="text-3xl font-['Bukra'] font-bold text-fg">Certificados & Evidências Verificadas</h2>
                <p className="text-sm text-fg-secondary mt-1">Diplomas, certificações e comprovações de competências.</p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="self-start sm:self-auto px-4 py-2 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-[#FFCC00]/10"
                >
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  + Anexar Certificado
                </button>
              )}
            </div>

            {docs.length === 0 ? (
              <div className="p-8 text-center bg-surface border border-border-subtle rounded-xl text-fg-muted text-xs">
                Nenhum certificado ou comprovação vinculada a este currículo ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {docs.map((doc) => {
                  const isPdf = doc.mime_type?.includes('pdf') || doc.filename.endsWith('.pdf');
                  const isImg = doc.mime_type?.startsWith('image/');
                  const icon = isPdf ? 'picture_as_pdf' : isImg ? 'image' : 'workspace_premium';
                  const fileUrl =
                    doc.signedStreamUrl ||
                    buildTenantStreamUrl(doc.relative_path, doc.itemTicket || '', { serverUrl });

                  return (
                    <div
                      key={doc.relative_path}
                      className="bg-surface border border-border-subtle hover:border-[#FFCC00] rounded-xl p-4 flex flex-col justify-between transition-all group hover:shadow-lg hover:shadow-[#FFCC00]/5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center text-[#FFCC00] shrink-0">
                            <span className="material-symbols-outlined text-[20px]">{icon}</span>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveDoc(doc.relative_path)}
                              title="Remover do currículo"
                              className="text-fg-muted hover:text-red-400 p-1 rounded"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          )}
                        </div>

                        {editingDocPath === doc.relative_path ? (
                          <div className="space-y-1.5 pt-1">
                            <input
                              type="text"
                              value={editingDocLabel}
                              onChange={(e) => setEditingDocLabel(e.target.value)}
                              placeholder="Ex: Certificado AWS Solutions Architect"
                              className="w-full bg-app border border-[#FFCC00] rounded-lg px-2.5 py-1 text-xs text-fg focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveDocLabel(doc.relative_path);
                                if (e.key === 'Escape') setEditingDocPath(null);
                              }}
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleSaveDocLabel(doc.relative_path)}
                                className="px-2.5 py-0.5 bg-[#FFCC00] text-[#121212] rounded text-[11px] font-bold transition-colors hover:bg-[#e6b800]"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDocPath(null)}
                                className="px-2 py-0.5 bg-surface-hover text-fg-secondary hover:text-fg rounded text-[11px] transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="text-sm font-bold text-fg group-hover:text-[#FFCC00] transition-colors line-clamp-2">
                                {doc.curriculum_label || doc.title || doc.filename}
                              </h4>
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDocPath(doc.relative_path);
                                    setEditingDocLabel(doc.curriculum_label || doc.title || doc.filename);
                                  }}
                                  title="Editar rótulo do certificado"
                                  className="text-fg-muted hover:text-[#FFCC00] p-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <span className="material-symbols-outlined text-[15px]">edit</span>
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-fg-muted font-mono mt-0.5 truncate">
                              {doc.filename} • {formatStorageBytes(doc.size_bytes)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#292929]">
                        {isImg ? (
                          <button
                            type="button"
                            onClick={() =>
                              openPhotoInPlace({
                                relativePath: doc.relative_path,
                                filename: doc.filename,
                                mimeType: doc.mime_type,
                                sizeBytes: doc.size_bytes,
                                itemTicket: doc.itemTicket,
                                exifData: doc.exif_data,
                              })
                            }
                            className="flex-1 py-1.5 px-3 bg-surface-hover hover:bg-[#353535] text-fg rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                            Visualizar
                          </button>
                        ) : (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-1.5 px-3 bg-surface-hover hover:bg-[#353535] text-fg rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            Abrir Documento
                          </a>
                        )}

                        <a
                          href={fileUrl}
                          download={doc.filename}
                          title="Baixar Arquivo"
                          className="p-1.5 bg-surface-hover hover:bg-[#333333] text-fg-secondary hover:text-fg rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">download</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Modal de Escolha / Upload de Certificados */}
          {isPickerOpen && !isReadOnly && (
            <TaskFilePickerModal
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              taskId=""
              taskTitle="Certificados e Diplomas"
              currentlyLinkedPaths={docs.map((d) => d.relative_path)}
              ticket={vaultTicket || activeTicket || ''}
              serverUrl={serverUrl}
              onLinkedUpdated={() => {
                setIsPickerOpen(false);
              }}
            />
          )}
        </main>
      )}
    </div>
  );
}
