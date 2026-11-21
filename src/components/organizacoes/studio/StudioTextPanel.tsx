// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioTextLayer, StudioMathLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { StudioTextPresetsSection } from './StudioTextPresetsSection';
import { StudioProColorPicker } from './StudioProColorPicker';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioHelpTooltip } from './StudioHelpTooltip';

type TextSubTab = 'content' | 'typography' | 'style' | 'spacing';

const TEXT_SUBTABS: { id: TextSubTab; label: string; icon: string; helpKey: string }[] = [
  { id: 'content', label: 'Conteúdo', icon: 'edit_note', helpKey: 'text.content' },
  { id: 'typography', label: 'Tipografia', icon: 'text_fields', helpKey: 'text.typography' },
  { id: 'style', label: 'Estilo', icon: 'palette', helpKey: 'text.style' },
  { id: 'spacing', label: 'Espaço', icon: 'format_line_spacing', helpKey: 'text.spacing' },
];

const EVENT_VARIABLES = ['DATA', 'HORARIO', 'LOCAL', 'PALESTRANTE'];

const FONT_FAMILIES = [
  { id: 'Inter, sans-serif', label: 'Inter' },
  { id: 'Space Grotesk, sans-serif', label: 'Space Grotesk' },
  { id: 'Playfair Display, serif', label: 'Playfair Display' },
  { id: 'JetBrains Mono, monospace', label: 'JetBrains Mono' },
  { id: 'Montserrat, sans-serif', label: 'Montserrat' },
  { id: 'Oswald, sans-serif', label: 'Oswald' },
  { id: 'Lora, serif', label: 'Lora' },
  { id: 'Merriweather, serif', label: 'Merriweather' },
];

const MANUAL_SHORTCUTS: { label: string; prefix: string; suffix: string; title: string }[] = [
  { label: '$|$', prefix: '$', suffix: '$', title: 'Equação inline' },
  { label: '$$|$$', prefix: '$$', suffix: '$$', title: 'Equação em bloco' },
  { label: '**|**', prefix: '**', suffix: '**', title: 'Negrito Markdown' },
  { label: '*|*', prefix: '*', suffix: '*', title: 'Itálico Markdown' },
  { label: '~~|~~', prefix: '~~', suffix: '~~', title: 'Tachado' },
  { label: '`|`', prefix: '`', suffix: '`', title: 'Código inline' },
  { label: '\\frac{|}{}', prefix: '\\frac{', suffix: '}{}', title: 'Fração' },
  { label: '^{|}', prefix: '^{', suffix: '}', title: 'Sobrescrito' },
  { label: '_{|}', prefix: '_{', suffix: '}', title: 'Subscrito' },
  { label: '\\sqrt{|}', prefix: '\\sqrt{', suffix: '}', title: 'Raiz quadrada' },
  { label: '\\left(|\\right)', prefix: '\\left(', suffix: '\\right)', title: 'Parênteses escaláveis' },
];

const MARKDOWN_COMMANDS: { label: string; linePrefix?: string; prefix?: string; suffix?: string; placeholder?: string }[] = [
  { label: 'H1', linePrefix: '# ' },
  { label: 'H2', linePrefix: '## ' },
  { label: 'H3', linePrefix: '### ' },
  { label: 'Lista •', linePrefix: '- ' },
  { label: 'Lista 1.', linePrefix: '1. ' },
  { label: 'Citação >', linePrefix: '> ' },
  { label: 'Tachado ~~', prefix: '~~', suffix: '~~', placeholder: 'texto' },
  { label: 'Código', prefix: '`', suffix: '`', placeholder: 'código' },
  { label: '[r:Vermelho]', prefix: '[r:', suffix: ']', placeholder: 'destaque' },
  { label: '[b:Azul]', prefix: '[b:', suffix: ']', placeholder: 'destaque' },
  { label: '[y:Amarelo]', prefix: '[y:', suffix: ']', placeholder: 'destaque' },
];

const LATEX_PRESETS: { label: string; snippet: string }[] = [
  { label: '∫ Integral', snippet: '\\int_{a}^{b} f(x)\\,dx' },
  { label: '∑ Somatório', snippet: '\\sum_{i=1}^{n} x_i' },
  { label: 'Vetor F⃗', snippet: '\\vec{F}' },
  { label: 'lim', snippet: '\\lim_{x \\to 0}' },
  { label: 'Matriz', snippet: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: '∇', snippet: '\\nabla' },
  { label: '∂', snippet: '\\partial' },
  { label: 'ℏ', snippet: '\\hbar' },
  { label: 'λ', snippet: '\\lambda' },
  { label: 'π', snippet: '\\pi' },
  { label: 'Δ', snippet: '\\Delta' },
  { label: 'ε₀', snippet: '\\varepsilon_0' },
  { label: '≈', snippet: '\\approx' },
  { label: '±', snippet: '\\pm' },
  { label: '∞', snippet: '\\infty' },
];

const PHYSICS_EQUATIONS: { label: string; latex: string }[] = [
  { label: 'E = mc²', latex: '$E = mc^2$' },
  { label: 'Maxwell', latex: '$$\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}$$' },
  { label: 'Schrödinger', latex: '$$i\\hbar \\frac{\\partial \\psi}{\\partial t} = \\hat{H}\\psi$$' },
  { label: 'F = ma⃗', latex: '$\\vec{F} = m\\vec{a}$' },
  { label: 'PV = nRT', latex: '$PV = nRT$' },
];

export function StudioTextPanel() {
  const {
    activeSlide,
    selectedLayerId,
    addLayer,
    updateLayer,
    removeLayer,
    fillEventPlaceholders,
    addSlide,
    editingTextLayerId,
    setEditingTextLayerId,
    textEditorRef,
    insertTextSnippet,
  } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [subTab, setSubTab] = useState<TextSubTab>('content');
  const [autoSplit, setAutoSplit] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<'font' | 'pill' | 'shadow' | null>(null);

  const textLayers = activeSlide.layers.filter((l) => l.type === 'text') as StudioTextLayer[];
  const mathLayers = activeSlide.layers.filter((l) => l.type === 'math') as StudioMathLayer[];
  const selectedTextLayer = textLayers.find((l) => l.id === selectedLayerId) || textLayers[0] || null;

  const handleAddText = (customText?: string, fontSize = 42, kind: 'title' | 'subtitle' | 'body' | 'callout' = 'title') => {
    const count = textLayers.length + 1;
    const newLayer: StudioTextLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: `Texto ${count}`,
      textKind: kind,
      text: customText || (kind === 'title' ? 'Novo Título' : kind === 'callout' ? 'Destaque Científico' : 'Novo Parágrafo'),
      fontFamily: kind === 'title' ? tokens.fontDisplay : tokens.fontBody,
      fontSize,
      color: tokens.textPrimary || '#ffffff',
      align: 'center',
      bold: kind === 'title' || kind === 'callout',
      italic: false,
      uppercase: false,
      lineHeight: 1.2,
      letterSpacing: 0,
      pillBgColor: tokens.primaryColor || '#1F9FCF',
      pillBgOpacity: kind === 'callout' ? 90 : 0,
      shadowColor: '#000000',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.25 + ((count % 4) * 0.08), width: 0.8, height: 0.2, rotation: 0,
    };
    addLayer(newLayer);
    setEditingTextLayerId(newLayer.id);
  };

  const handleTextChange = (newVal: string) => {
    if (!selectedTextLayer) return;
    if (autoSplit && newVal.length > 220) {
      const parts = newVal.match(/[^.!?]+[.!?]+/g) || [newVal.slice(0, 150), newVal.slice(150)];
      if (parts.length > 1) {
        updateLayer(selectedTextLayer.id, { text: parts[0].trim() });
        for (let i = 1; i < Math.min(parts.length, 4); i++) {
          addSlide([{
            ...selectedTextLayer,
            id: `text-${crypto.randomUUID()}`,
            text: parts[i].trim(),
          }]);
        }
        return;
      }
    }
    updateLayer(selectedTextLayer.id, { text: newVal });
  };

  const applyPreset = (type: 'quote' | 'fact' | 'qa' | 'steps') => {
    if (type === 'quote') handleAddText('“A ciência é uma forma de pensar muito mais do que um corpo de conhecimento.”\n— Carl Sagan', 36, 'body');
    if (type === 'fact') handleAddText('💡 VOCÊ SABIA?\n[r:A luz do Sol leva cerca de 8 minutos] para alcançar a Terra.', 38, 'title');
    if (type === 'qa') handleAddText('❓ O QUE ACONTECE NA VELOCIDADE DA LUZ?\nArraste para o lado para entender ➔', 40, 'title');
    if (type === 'steps') handleAddText('🔬 EXPERIMENTO EM 3 PASSOS:\n1. Hipótese inicial\n2. Coleta de dados\n3. Conclusão validada', 34, 'body');
  };

  const activeSubMeta = TEXT_SUBTABS.find((t) => t.id === subTab)!;
  const preventFocusLoss = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div className="space-y-3 text-fg">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleAddText()}
          className="flex-1 py-2 px-3 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>+ Adicionar Texto</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const math: StudioMathLayer = {
              id: `math-${Date.now()}`, type: 'math', name: `Fórmula ${mathLayers.length + 1}`,
              latex: 'E = mc^2', color: tokens.secondaryColor || '#FFCC00',
              visible: true, locked: false, opacity: 1, x: 0.25, y: 0.5, width: 0.5, height: 0.15, rotation: 0,
            };
            addLayer(math);
          }}
          className="py-2 px-3 rounded-xl border border-border-subtle bg-surface-hover text-amber-600 dark:text-amber-300 font-bold text-xs hover:bg-surface flex items-center gap-1 cursor-pointer"
          title="Inserir Fórmula Científica KaTeX"
        >
          <span className="font-serif font-black text-sm">∑</span>
          <span>Fórmula</span>
        </button>
      </div>

      {/* 4 Subperfis Enxutos (sticky no topo ao rolar) */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md pt-0.5 pb-1 -mx-1 px-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {TEXT_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              subTab === t.id
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'bg-surface-hover/60 text-fg-secondary hover:text-fg border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {selectedTextLayer && (
        <div className="p-3 rounded-2xl bg-surface-hover/40 border border-border-subtle space-y-3">
          <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
            <span className="text-xs font-bold text-fg flex items-center gap-1.5 truncate max-w-[210px]">
              <span className="material-symbols-outlined text-[15px] text-amber-500">{activeSubMeta.icon}</span>
              <span className="truncate">{selectedTextLayer.name}</span>
              <StudioHelpTooltip helpKey={activeSubMeta.helpKey} />
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingTextLayerId(editingTextLayerId === selectedTextLayer.id ? null : selectedTextLayer.id)}
                className="px-2 py-0.5 rounded bg-[#FFCC00]/20 text-amber-700 dark:text-[#FFCC00] text-[10px] font-bold cursor-pointer"
              >
                {editingTextLayerId === selectedTextLayer.id ? 'Concluir' : 'Editar no Palco'}
              </button>
              <button
                type="button"
                onClick={() => removeLayer(selectedTextLayer.id)}
                className="p-1 text-red-500 hover:bg-red-500/15 rounded cursor-pointer"
                title="Excluir camada de texto"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
              </button>
            </div>
          </div>

          {subTab === 'content' && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-border-subtle">
                {(['title', 'subtitle', 'body', 'callout'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => updateLayer(selectedTextLayer.id, {
                      textKind: k,
                      fontFamily: k === 'title' || k === 'subtitle' ? tokens.fontDisplay : tokens.fontBody,
                      fontSize: k === 'title' ? 48 : k === 'subtitle' ? 36 : k === 'body' ? 26 : 24,
                      pillBgOpacity: k === 'callout' ? (selectedTextLayer.pillBgOpacity || 90) : selectedTextLayer.pillBgOpacity,
                    })}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      (selectedTextLayer.textKind || 'title') === k ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    {k === 'title' ? 'Título' : k === 'subtitle' ? 'Subtítulo' : k === 'body' ? 'Corpo' : 'Callout'}
                  </button>
                ))}
              </div>

              <textarea
                ref={editingTextLayerId ? undefined : textEditorRef}
                rows={3}
                value={selectedTextLayer.text}
                onChange={(e) => handleTextChange(e.target.value)}
                className="w-full rounded-xl bg-surface border border-border-subtle p-2 text-xs text-fg focus:outline-none focus:border-[#FFCC00]"
                placeholder="Digite texto, **Markdown** ou $LaTeX$..."
              />

              {/* Bloco 1: Atalhos Manuais (cursor posicionado dentro, preservando foco) */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
                  <span>1. Atalhos Manuais</span>
                  <StudioHelpTooltip helpKey="text.manualShortcuts" />
                </span>
                <div className="flex flex-wrap gap-1">
                  {MANUAL_SHORTCUTS.map((sc) => (
                    <button
                      key={sc.label}
                      type="button"
                      title={sc.title}
                      onPointerDown={preventFocusLoss}
                      onMouseDown={preventFocusLoss}
                      onClick={() => insertTextSnippet(sc.prefix, sc.suffix, '')}
                      className="px-2 py-0.5 rounded bg-surface border border-border-subtle hover:border-[#FFCC00] text-[10px] font-mono font-bold text-fg cursor-pointer"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bloco 2: Comandos Markdown & Tags IDV */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
                  <span>2. Comandos Markdown</span>
                  <StudioHelpTooltip helpKey="text.markdown" />
                </span>
                <div className="flex flex-wrap gap-1">
                  {MARKDOWN_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.label}
                      type="button"
                      onPointerDown={preventFocusLoss}
                      onMouseDown={preventFocusLoss}
                      onClick={() => insertTextSnippet(cmd.prefix || '', cmd.suffix || '', cmd.placeholder || '', cmd.linePrefix)}
                      className="px-2 py-0.5 rounded bg-surface-hover border border-border-subtle hover:border-[#FFCC00] text-[10px] font-semibold text-fg-secondary hover:text-fg cursor-pointer"
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bloco 3: Equações LaTeX & Física */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
                  <span>3. Equações LaTeX & Física</span>
                  <StudioHelpTooltip helpKey="text.latexPresets" />
                </span>
                <div className="flex flex-wrap gap-1">
                  {LATEX_PRESETS.map((lp) => (
                    <button
                      key={lp.label}
                      type="button"
                      onPointerDown={preventFocusLoss}
                      onMouseDown={preventFocusLoss}
                      onClick={() => insertTextSnippet(lp.snippet, '', '')}
                      className="px-2 py-0.5 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/30 hover:bg-[#00D4FF]/20 text-[10px] font-semibold text-fg cursor-pointer"
                    >
                      {lp.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {PHYSICS_EQUATIONS.map((eq) => (
                    <button
                      key={eq.label}
                      type="button"
                      onPointerDown={preventFocusLoss}
                      onMouseDown={preventFocusLoss}
                      onClick={() => insertTextSnippet(eq.latex, '', '')}
                      className="px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 hover:bg-amber-400/25 text-[10px] font-bold text-amber-700 dark:text-amber-300 cursor-pointer"
                    >
                      {eq.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Placeholders Dinâmicos */}
              <div className="flex flex-wrap gap-1 pt-1 border-t border-border-subtle">
                {EVENT_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onPointerDown={preventFocusLoss}
                    onMouseDown={preventFocusLoss}
                    onClick={() => insertTextSnippet(`{${v}}`, '', '')}
                    className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg-muted text-[10px] font-mono hover:text-fg cursor-pointer"
                  >
                    +{`{${v}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {subTab === 'typography' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1">
                {FONT_FAMILIES.map((f) => {
                  const isSelected = selectedTextLayer.fontFamily?.includes(f.label);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => updateLayer(selectedTextLayer.id, { fontFamily: f.id })}
                      style={{ fontFamily: f.id }}
                      className={`px-2 py-1 rounded-lg text-[11px] text-left truncate border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFCC00] text-black font-bold border-[#FFCC00]'
                          : 'bg-surface border-border-subtle text-fg hover:bg-surface-hover'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <StudioLiveSlider
                    id="text-font-size"
                    label="Tamanho"
                    value={selectedTextLayer.fontSize}
                    min={12}
                    max={140}
                    step={1}
                    unit="px"
                    onChange={(val) => updateLayer(selectedTextLayer.id, { fontSize: val })}
                  />
                </div>
                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    title="Negrito"
                    onClick={() => updateLayer(selectedTextLayer.id, { bold: !selectedTextLayer.bold })}
                    className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.bold ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">format_bold</span>
                  </button>
                  <button
                    type="button"
                    title="Itálico"
                    onClick={() => updateLayer(selectedTextLayer.id, { italic: !selectedTextLayer.italic })}
                    className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.italic ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">format_italic</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border-subtle">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => updateLayer(selectedTextLayer.id, { align })}
                      className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.align === align ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">format_align_{align}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  title="Caixa Alta (UPPERCASE)"
                  onClick={() => updateLayer(selectedTextLayer.id, { uppercase: !selectedTextLayer.uppercase })}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-black cursor-pointer ${
                    selectedTextLayer.uppercase ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle text-fg-muted hover:text-fg'
                  }`}
                >
                  CAIXA ALTA (AA)
                </button>
              </div>
            </div>
          )}

          {subTab === 'style' && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setColorPickerTarget((t) => (t === 'font' ? null : 'font'))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer"
              >
                <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.color }} />
                <span>Cor Principal da Fonte</span>
              </button>
              {colorPickerTarget === 'font' && (
                <StudioProColorPicker
                  color={selectedTextLayer.color || '#ffffff'}
                  onChange={(hex) => updateLayer(selectedTextLayer.id, { color: hex })}
                  label="Cor Principal da Fonte"
                />
              )}
              <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setColorPickerTarget((t) => (t === 'pill' ? null : 'pill'))}
                    className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer hover:text-amber-500 shrink-0"
                  >
                    <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.pillBgColor || '#1F9FCF' }} />
                    <span>Tarja / Pill</span>
                  </button>
                  <div className="flex-1">
                    <StudioLiveSlider
                      id="text-pill-opacity"
                      label="Opacidade Pill"
                      value={selectedTextLayer.pillBgOpacity ?? 0}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(val) => updateLayer(selectedTextLayer.id, { pillBgOpacity: val })}
                    />
                  </div>
                </div>
                {colorPickerTarget === 'pill' && (
                  <StudioProColorPicker
                    color={selectedTextLayer.pillBgColor || '#1F9FCF'}
                    onChange={(hex) => updateLayer(selectedTextLayer.id, { pillBgColor: hex })}
                    label="Cor da Tarja Pill"
                  />
                )}
              </div>
              <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1.5">
                <button
                  type="button"
                  onClick={() => setColorPickerTarget((t) => (t === 'shadow' ? null : 'shadow'))}
                  className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer hover:text-amber-500"
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.shadowColor || '#000000' }} />
                  <span>Sombra de Texto</span>
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <StudioLiveSlider
                    id="text-shadow-blur"
                    label="Blur"
                    value={selectedTextLayer.shadowBlur ?? 0}
                    min={0}
                    max={30}
                    onChange={(val) => updateLayer(selectedTextLayer.id, { shadowBlur: val })}
                  />
                  <StudioLiveSlider
                    id="text-shadow-x"
                    label="Sombra X"
                    value={selectedTextLayer.shadowOffsetX ?? 0}
                    min={-20}
                    max={20}
                    onChange={(val) => updateLayer(selectedTextLayer.id, { shadowOffsetX: val })}
                  />
                  <StudioLiveSlider
                    id="text-shadow-y"
                    label="Sombra Y"
                    value={selectedTextLayer.shadowOffsetY ?? 2}
                    min={-20}
                    max={20}
                    onChange={(val) => updateLayer(selectedTextLayer.id, { shadowOffsetY: val })}
                  />
                </div>
                {colorPickerTarget === 'shadow' && (
                  <StudioProColorPicker
                    color={selectedTextLayer.shadowColor || '#000000'}
                    onChange={(hex) => updateLayer(selectedTextLayer.id, { shadowColor: hex })}
                    label="Cor da Sombra"
                  />
                )}
              </div>
            </div>
          )}

          {subTab === 'spacing' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StudioLiveSlider
                  id="text-letter-spacing"
                  label="Espaçamento"
                  value={selectedTextLayer.letterSpacing || 0}
                  min={-4}
                  max={20}
                  step={0.5}
                  unit="px"
                  onChange={(val) => updateLayer(selectedTextLayer.id, { letterSpacing: val })}
                />
                <StudioLiveSlider
                  id="text-line-height"
                  label="Entrelinha"
                  value={Number((selectedTextLayer.lineHeight || 1.2).toFixed(1))}
                  min={0.8}
                  max={2.4}
                  step={0.1}
                  unit="x"
                  onChange={(val) => updateLayer(selectedTextLayer.id, { lineHeight: val })}
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-fg-secondary cursor-pointer p-2 rounded-xl bg-surface border border-border-subtle">
                <input
                  type="checkbox"
                  checked={autoSplit}
                  onChange={(e) => setAutoSplit(e.target.checked)}
                  className="rounded-xs accent-amber-400"
                />
                <span>Auto-dividir em múltiplos slides ao colar texto longo</span>
              </label>
            </div>
          )}
        </div>
      )}

      {subTab === 'content' && (
        <StudioTextPresetsSection onApplyPreset={applyPreset} onFillBatch={fillEventPlaceholders} />
      )}
    </div>
  );
}
