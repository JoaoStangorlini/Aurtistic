import React from 'react';

type BadgeType = 'status' | 'prioridade' | 'categoria' | 'responsavel' | 'dimensao';

interface BadgeProps {
  type: BadgeType;
  value: string | null;
}

export function getBadgeColorClass(type: BadgeType, value: string | null): string {
  if (!value) return 'bg-[#2D2D2D] text-[#A0A0A0] border-[#353534]';
  const text = value.toLowerCase().trim();
  let colorClass = 'bg-[#2D2D2D] text-[#A0A0A0] border-[#353534]'; // Default dark gray
  
  if (type === 'status') {
    if (text.includes('completa')) colorClass = 'bg-[#0f9d58]/15 text-[#0f9d58] border-[#0f9d58]/30'; // Green
    else if (text.includes('testar')) colorClass = 'bg-[#f4b400]/15 text-[#f4b400] border-[#f4b400]/30'; // Yellow
    else if (text.includes('descartada')) colorClass = 'bg-[#db4437]/15 text-[#db4437] border-[#db4437]/30'; // Red
    else if (text.includes('progresso')) colorClass = 'bg-[#4285f4]/15 text-[#4285f4] border-[#4285f4]/30'; // Blue
    else if (text.includes('iniciada')) colorClass = 'bg-[#E0E0E0]/15 text-[#E0E0E0] border-[#E0E0E0]/30'; // Light Gray
    else if (text.includes('rascunho')) colorClass = 'bg-[#8E8E8E]/15 text-[#8E8E8E] border-[#8E8E8E]/30 text-dashed'; // Gray with different feel
  } 
  else if (type === 'prioridade') {
    if (text === 'baixa') colorClass = 'bg-[#4285f4]/15 text-[#4285f4] border-[#4285f4]/30'; // Blue
    else if (text === 'média' || text === 'media') colorClass = 'bg-[#f4b400]/15 text-[#f4b400] border-[#f4b400]/30'; // Yellow
    else if (text === 'alta') colorClass = 'bg-[#db4437]/15 text-[#db4437] border-[#db4437]/30'; // Red
  }
  else if (type === 'categoria') {
    if (text.includes('programar')) colorClass = 'bg-[#9D4EDD]/15 text-[#9D4EDD] border-[#9D4EDD]/30'; // Purple
    else if (text.includes('pesquisar')) colorClass = 'bg-[#4285f4]/15 text-[#4285f4] border-[#4285f4]/30'; // Blue
    else if (text.includes('touch')) colorClass = 'bg-[#0f9d58]/15 text-[#0f9d58] border-[#0f9d58]/30'; // Green
    else if (text.includes('reunir')) colorClass = 'bg-[#FF8C8C]/15 text-[#FF8C8C] border-[#FF8C8C]/30'; // Salmon/Pink
    else if (text.includes('post')) colorClass = 'bg-[#f4b400]/15 text-[#f4b400] border-[#f4b400]/30'; // Yellow
    else if (text.includes('outros')) colorClass = 'bg-[#E0E0E0]/15 text-[#E0E0E0] border-[#E0E0E0]/30'; // Light Gray
  }
  else if (type === 'responsavel') {
    if (text.includes('andy')) colorClass = 'bg-[#db4437]/15 text-[#db4437] border-[#db4437]/30'; // Red
    else if (text.includes('joão') || text.includes('joao')) colorClass = 'bg-[#9D4EDD]/15 text-[#9D4EDD] border-[#9D4EDD]/30'; // Purple
    else if (text.includes('leo')) colorClass = 'bg-[#0f9d58]/15 text-[#0f9d58] border-[#0f9d58]/30'; // Green
    else if (text.includes('dani')) colorClass = 'bg-[#4285f4]/15 text-[#4285f4] border-[#4285f4]/30'; // Blue
    else if (text.includes('lorenzo')) colorClass = 'bg-[#f4b400]/15 text-[#f4b400] border-[#f4b400]/30'; // Yellow
    else if (text.includes('nacky')) colorClass = 'bg-[#FF8C8C]/15 text-[#FF8C8C] border-[#FF8C8C]/30'; // Pink
  }
  else if (type === 'dimensao') {
    if (text.includes('usp')) colorClass = 'bg-[#0F4780]/20 text-[#4da8ff] border-[#0F4780]/50'; // Azul
    else if (text.includes('hub')) colorClass = 'bg-[#9D4EDD]/15 text-[#9D4EDD] border-[#9D4EDD]/30'; // Roxo vibrante
    else if (text.includes('urgente')) colorClass = 'bg-[#F14343]/15 text-[#F14343] border-[#F14343]/30'; // Vermelho LabDiv
    else if (text.includes('livros')) colorClass = 'bg-[#FFCC00]/15 text-[#FFCC00] border-[#FFCC00]/30'; // Amarelo LabDiv
    else if (text.includes('filmes') || text.includes('series') || text.includes('séries')) colorClass = 'bg-[#FFE066]/15 text-[#FFE066] border-[#FFE066]/30'; // Amarelo Claro
    else if (text.includes('tatuagens') || text.includes('tattoo')) colorClass = 'bg-[#D39BFE]/15 text-[#D39BFE] border-[#D39BFE]/30'; // Roxo Claro
    else if (text.includes('cin')) colorClass = 'bg-[#E0E0E0]/15 text-[#E0E0E0] border-[#E0E0E0]/30'; // Cinza Claro
    else if (text.includes('compras')) colorClass = 'bg-[#69F0AE]/15 text-[#69F0AE] border-[#69F0AE]/30'; // Verde Claro
    else if (text.includes('stangorlini') || text.includes('web')) colorClass = 'bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30'; // Azul Royal
    else if (text.includes('fotografia') || text.includes('foto')) colorClass = 'bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30'; // Rosa Vibrante
    else if (text.includes('hobbys') || text.includes('hobby')) colorClass = 'bg-[#0f9d58]/15 text-[#0f9d58] border-[#0f9d58]/30'; // Verde Vibrante
    else colorClass = 'bg-[#FFCC00]/15 text-[#FFCC00] border-[#FFCC00]/30'; // Default golden
  }
  return colorClass;
}

export function Badge({ type, value }: BadgeProps) {
  if (!value) return <span className="text-gray-500">-</span>;
  const colorClass = getBadgeColorClass(type, value);

  return (
    <span className={`inline-block max-w-full truncate px-2 py-1 text-[11px] rounded-md font-medium border ${colorClass}`}>
      {value}
    </span>
  );
}
