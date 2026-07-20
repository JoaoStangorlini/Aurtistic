// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { saveUserProfileData } from '@/app/(dashboard)/actions';

import Image from 'next/image';

interface CurriculoClientProps {
  initialProfile: any;
  isReadOnly?: boolean;
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
  summary: string;
  experiences: CVExperience[];
  education: CVEducation[];
  skills: string[];
}

export default function CurriculoClient({ initialProfile, isReadOnly = false }: CurriculoClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Default initial empty data structure
  const emptyCV: CVData = {
    name: 'Seu Nome Completo',
    role: 'Seu Cargo ou Descrição Curta',
    phone: '(00) 00000-0000',
    email: 'seu.email@exemplo.com',
    address: 'Cidade - Estado',
    github: '/seu-github',
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
      name: 'João Paulo Stangorlini de Carvalho',
      role: 'Estudante de Física (USP) | Desenvolvedor | Fotógrafo | Educador | Designer',
      phone: '(11) 967840-1823',
      email: 'joaopaulostangorlini@usp.br',
      address: 'Rua Arthur Soter Lopes da Silva, 88',
      github: '/JoaoStangorlini',
      summary: 'Estudante de Física no Instituto de Física (USP - Butantã) com perfil voltado à tecnologia e educação. Experiência prática em desenvolvimento Web (PWA), design (web e gráfico), otimização, manutenção e montagem de hardware de alta performance, sala de aula e monitorias em ambientes de difusão científica/inovação. Experiência básica de cálculo e execução de instalações elétricas (residenciais).',
      experiences: [
        {
          role: 'Monitor de Inovação e Tecnologias Imersivas',
          company: 'DigiLab (Inova USP)',
          period: '2025 - Presente',
          bullets: [
            'Operação e Suporte em VR/AR: Mediação técnica em experiências de Realidade Virtual e Aumentada.',
            'Troubleshooting em Tempo Real: Resolução de falhas de hardware e software sob pressão durante eventos.',
            'Estudo de Sistemas Imersivos: Pesquisa sobre o funcionamento físico e técnico de dispositivos de VR.',
            'Atendimento Bilíngue: Suporte técnico e conversação em Inglês para visitantes.'
          ]
        },
        {
          role: 'Monitor de Difusão Científica',
          company: 'Parque CienTec – USP',
          period: '2024 - 2025',
          bullets: [
            'Comunicação científica e mediação de experimentos de Física e Astronomia.',
            'Adaptação de conceitos complexos para diversos níveis de público.',
            'Desenvolvimento de planos de aulas e planejamento de possíveis novas atividades.'
          ]
        }
      ],
      education: [
        {
          institution: 'Instituto de Física da Universidade de São Paulo (USP)',
          period: '2024 - 2029',
          degree: 'Licenciatura em Física (em andamento)',
          bullets: [
            'Bolsista PAPFE (apoio à permanência e formação estudantil).',
            'Bolsista PUB (Programa Unificado de Bolsas) – Atuação no parque de Ciências e tecnologia USP Cientec.',
            'Projetos AEX (Apoio à Extensão): Atuação no Digital Lab / Inova USP e palestrante no programa "De Volta à Escola | Eu na USP".'
          ]
        }
      ],
      skills: ['HTML5', 'CSS3', 'JavaScript', 'TypeScript', 'React.js', 'Next.js', 'SQL', 'Git & GitHub', 'Física Geral', 'Design Gráfico', 'Montagem de Hardware', 'Inglês Intermediário']
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

  const updateExperience = (index: number, field: keyof CVExperience, value: any) => {
    const updated = [...cvData.experiences];
    updated[index] = { ...updated[index], [field]: value };
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

  const updateEducation = (index: number, field: keyof CVEducation, value: any) => {
    const updated = [...cvData.education];
    updated[index] = { ...updated[index], [field]: value };
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
      <div className="min-h-full flex flex-col items-center justify-center p-8 bg-[#121212] text-center">
        <div className="max-w-md p-8 bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl shadow-xl backdrop-blur-md">
          <span className="material-symbols-outlined text-[64px] text-[#FFCC00] mb-4">badge</span>
          <h2 className="text-2xl font-bold text-white mb-2">Configure seu Currículo</h2>
          <p className="text-[#A0A0A0] text-sm mb-6">
            Seu Currículo Profissional está vazio. Você pode preenchê-lo do zero ou pré-carregar o modelo padrão do João Paulo.
          </p>
          {!isReadOnly ? (
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
                Preencher do Zero
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#8E8E8E]">Nenhum conteúdo publicado por este usuário ainda.</p>
          )}
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
            <h1 className="text-3xl font-black text-white font-['Bukra'] tracking-tighter">
              Aurtistic <span className="text-[#FFCC00] text-lg font-bold font-sans align-middle ml-2">creative manager</span>
            </h1>
          </div>
          <p className="text-sm text-[#8E8E8E] mt-1.5">Estruturação de histórico profissional e acadêmico.</p>
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
        )}
      </div>


      {isEditing ? (
        /* EDITOR MODE */
        <div className="max-w-4xl mx-auto w-full bg-[#1A1A1A] border border-[#2D2D2D] p-6 md:p-8 rounded-2xl space-y-8">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-[#2D2D2D] pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00]">badge</span>
            Editar Informações do Currículo
          </h2>

          {/* Contact Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Dados Pessoais e Contato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Nome Completo</label>
                <input 
                  type="text"
                  value={cvData.name}
                  onChange={e => setCvData({...cvData, name: e.target.value})}
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Cargo / Especialidade</label>
                <input 
                  type="text"
                  value={cvData.role}
                  onChange={e => setCvData({...cvData, role: e.target.value})}
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Telefone</label>
                <input 
                  type="text"
                  value={cvData.phone}
                  onChange={e => setCvData({...cvData, phone: e.target.value})}
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">E-mail</label>
                <input 
                  type="email"
                  value={cvData.email}
                  onChange={e => setCvData({...cvData, email: e.target.value})}
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Endereço / Localização</label>
                <input 
                  type="text"
                  value={cvData.address}
                  onChange={e => setCvData({...cvData, address: e.target.value})}
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Usuário do GitHub</label>
                <input 
                  type="text"
                  value={cvData.github}
                  onChange={e => setCvData({...cvData, github: e.target.value})}
                  placeholder="Ex: /JoaoStangorlini"
                  className="w-full bg-[#242424] border border-[#2D2D2D] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#9D4EDD]"
                />
              </div>
            </div>
          </div>

          {/* Professional Experiences */}
          <div className="space-y-4 pt-4 border-t border-[#2D2D2D]">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Experiências Profissionais</h3>
              <button 
                onClick={addExperience}
                className="px-3 py-1 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white rounded text-xs font-bold transition-colors"
              >
                + Adicionar Experiência
              </button>
            </div>

            {cvData.experiences.map((exp, idx) => (
              <div key={idx} className="p-4 bg-[#242424] border border-[#2D2D2D] rounded-xl space-y-3 relative">
                <button 
                  onClick={() => removeExperience(idx)}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-400 text-xs font-bold"
                >
                  Excluir
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Cargo</label>
                    <input 
                      type="text"
                      value={exp.role}
                      onChange={e => updateExperience(idx, 'role', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Empresa / Projeto</label>
                    <input 
                      type="text"
                      value={exp.company}
                      onChange={e => updateExperience(idx, 'company', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Período</label>
                    <input 
                      type="text"
                      value={exp.period}
                      onChange={e => updateExperience(idx, 'period', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#A0A0A0] mb-1">Descrição / Conquistas (Linhas separadas por Enter viram tópicos)</label>
                  <textarea 
                    value={exp.bullets ? exp.bullets.join('\n') : ''}
                    onChange={e => updateExperience(idx, 'bullets', e.target.value.split('\n'))}
                    rows={3}
                    className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD] resize-y"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Education */}
          <div className="space-y-4 pt-4 border-t border-[#2D2D2D]">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Formação Acadêmica</h3>
              <button 
                onClick={addEducation}
                className="px-3 py-1 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white rounded text-xs font-bold transition-colors"
              >
                + Adicionar Formação
              </button>
            </div>

            {cvData.education.map((edu, idx) => (
              <div key={idx} className="p-4 bg-[#242424] border border-[#2D2D2D] rounded-xl space-y-3 relative">
                <button 
                  onClick={() => removeEducation(idx)}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-400 text-xs font-bold"
                >
                  Excluir
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Instituição</label>
                    <input 
                      type="text"
                      value={edu.institution}
                      onChange={e => updateEducation(idx, 'institution', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Curso / Grau</label>
                    <input 
                      type="text"
                      value={edu.degree}
                      onChange={e => updateEducation(idx, 'degree', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A0A0A0] mb-1">Período</label>
                    <input 
                      type="text"
                      value={edu.period}
                      onChange={e => updateEducation(idx, 'period', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#A0A0A0] mb-1">Detalhes adicionais (Linhas separadas por Enter viram tópicos)</label>
                  <textarea 
                    value={edu.bullets ? edu.bullets.join('\n') : ''}
                    onChange={e => updateEducation(idx, 'bullets', e.target.value.split('\n'))}
                    rows={3}
                    className="w-full bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD] resize-y"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="space-y-4 pt-4 border-t border-[#2D2D2D]">
            <h3 className="text-sm font-bold text-[#FFCC00] uppercase tracking-wider">Habilidades</h3>
            
            <form onSubmit={addSkill} className="flex gap-2">
              <input 
                type="text"
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                placeholder="Ex: Next.js"
                className="bg-[#242424] border border-[#2D2D2D] rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-[#9D4EDD]"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-[#9D4EDD] hover:bg-[#8B3DCA] text-white rounded-lg text-xs font-bold transition-colors"
              >
                Adicionar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {cvData.skills.map((skill, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1 bg-[#242424] border border-[#2D2D2D] text-white rounded-full text-xs font-medium">
                  {skill}
                  <button 
                    type="button" 
                    onClick={() => removeSkill(skill)}
                    className="text-[#8E8E8E] hover:text-red-500 font-bold"
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
          <section className="space-y-6 border-b border-[#2D2D2D] pb-12">
            <div>
              <h1 className="text-5xl font-['Bukra'] font-black text-white leading-tight">
                {cvData.name.split(' ').slice(0, 2).join(' ')} <span className="text-[#FFCC00]">{cvData.name.split(' ').slice(2).join(' ')}</span>
              </h1>
              <p className="text-xl text-[#A0A0A0] mt-4">{cvData.role}</p>
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
                  <a href={`mailto:${cvData.email}`} className="hover:text-white transition-colors underline">{cvData.email}</a>
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
                  <a href={`https://github.com${cvData.github.startsWith('/') ? '' : '/'}${cvData.github}`} target="_blank" rel="noreferrer" className="hover:text-white transition-colors underline">{cvData.github}</a>
                </div>
              )}
            </div>
          </section>

          {/* Professional Experiences */}
          {cvData.experiences && cvData.experiences.length > 0 && (
            <section className="space-y-8">
              <h2 className="text-3xl font-['Bukra'] font-bold text-white border-l-4 border-[#3B1E43] pl-4">Experiência Profissional</h2>
              <div className="space-y-8">
                {cvData.experiences.map((exp, idx) => (
                  <div key={idx} className="bg-[#1E1E1E] border border-[#2D2D2D] p-6 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#FFCC00]" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pl-2">
                      <h3 className="text-xl font-bold text-white">
                        {exp.role} <span className="text-[#FFCC00]">| {exp.company}</span>
                      </h3>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#A0A0A0] bg-[#2D2D2D] px-3 py-1 rounded-full">{exp.period}</span>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="list-disc list-outside ml-7 text-[#A0A0A0] space-y-2">
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
              <h2 className="text-3xl font-['Bukra'] font-bold text-white border-l-4 border-[#FFCC00] pl-4">Formação</h2>
              <div className="space-y-8">
                {cvData.education.map((edu, idx) => (
                  <div key={idx} className="bg-[#1E1E1E] border border-[#2D2D2D] p-6 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#3B1E43]" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pl-2">
                      <h3 className="text-xl font-bold text-white">{edu.institution}</h3>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#A0A0A0] bg-[#2D2D2D] px-3 py-1 rounded-full">{edu.period}</span>
                    </div>
                    <p className="text-white font-medium pl-2 mb-3">{edu.degree}</p>
                    {edu.bullets && edu.bullets.length > 0 && (
                      <ul className="list-disc list-outside ml-7 text-[#A0A0A0] space-y-2">
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
              <h2 className="text-3xl font-['Bukra'] font-bold text-white border-l-4 border-[#FFCC00] pl-4">Habilidades</h2>
              <div className="flex flex-wrap gap-2.5">
                {cvData.skills.map((skill, idx) => (
                  <span key={idx} className="px-4 py-1.5 bg-[#1E1E1E] border border-[#2D2D2D] hover:border-[#FFCC00] text-white rounded-full text-xs font-semibold tracking-wide transition-colors">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
