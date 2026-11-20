// Este programa é um software livre (Licença AGPLv3)
export interface StudioHelpEntry {
  title: string;
  description: string;
  tip?: string;
}

export const STUDIO_HELP_CATALOG: Record<string, StudioHelpEntry> = {
  // Dock tools (8)
  'dock.images': {
    title: 'Imagens & Camadas',
    description: 'Adicione fotos do cofre, envie arquivos do dispositivo ou ajuste enquadramento e ordem das fotos no slide.',
    tip: 'Use "Preencher" para cobrir todo o slide sem bordas.',
  },
  'dock.adjust': {
    title: 'Ajustar Imagem',
    description: 'Edite luz, cor, curvas, nitidez, vinheta, filtros e selos da foto ativa no slide.',
    tip: 'Pontos amarelos indicam subperfis já modificados.',
  },
  'dock.mask': {
    title: 'Máscara de Desfoque',
    description: 'Pinte diretamente sobre a imagem para preservar áreas nítidas ou suavizar fundos com pincel ajustável.',
  },
  'dock.draw': {
    title: 'Pincel & Desenho',
    description: 'Desenhe traços livres, setas ou destaques diretamente sobre o slide usando camadas vetoriais.',
  },
  'dock.text': {
    title: 'Texto & Tipografia',
    description: 'Insira títulos, legendas e fórmulas matemáticas (LaTeX), escolhendo fonte, alinhamento e contorno.',
  },
  'dock.elements': {
    title: 'Elementos & Adesivos',
    description: 'Adicione formas geométricas, ícones, badges institucionais, linhas e QR Codes ao seu design.',
  },
  'dock.palette': {
    title: 'Paleta da Organização',
    description: 'Acesso rápido às cores oficiais da organização, fundos padronizados e combinações com bom contraste.',
  },
  'dock.layers': {
    title: 'Gerenciador de Camadas',
    description: 'Reordene, oculte, bloqueie ou duplique cada elemento (texto, imagem, forma ou desenho) do slide.',
  },

  // Top Action Bar
  'topbar.pan': {
    title: 'Ferramenta Mão (Mover Canvas)',
    description: 'Ativa o modo de arrastar a prancheta sem selecionar ou mover acidentalmente suas camadas.',
    tip: 'Você também pode segurar Espaço para navegar.',
  },
  'topbar.zoom': {
    title: 'Zoom da Prancheta',
    description: 'Amplie para detalhes finos ou clique no percentual para resetar o enquadramento em 100%.',
  },
  'topbar.undo': {
    title: 'Desfazer / Refazer',
    description: 'Volta ou avança alterações recentes no slide atual (Ctrl+Z / Ctrl+Shift+Z).',
  },
  'topbar.snap': {
    title: 'Imã de Alinhamento (Snap)',
    description: 'Alinha automaticamente textos e elementos ao centro, margens seguras e bordas de outros objetos.',
  },
  'topbar.guides': {
    title: 'Guias Visuais',
    description: 'Exibe grades de regra dos terços, centro e margens de segurança para redes sociais (Stories/Feed).',
  },
  'topbar.wcag': {
    title: 'Assistente WCAG & Dicas',
    description: 'Analisa o contraste real entre cada texto e o fundo logo abaixo dele, além de oferecer um mini-curso prático.',
  },
  'topbar.helpMode': {
    title: 'Modo Ajuda (?)',
    description: 'Quando ativo, exibe botões de ajuda rápida nos ícones e menus para você explorar sem medo de alterar o slide.',
  },
  'topbar.compare': {
    title: 'Comparar Antes / Depois',
    description: 'Segure para ver a foto original sem filtros, ou ative a divisória arrastável na tela.',
  },
  'topbar.eyedropper': {
    title: 'Conta-Gotas (Tecla I)',
    description: 'Captura qualquer cor diretamente da foto ou do slide para aplicar no pincel, texto ou fundo.',
  },
  'topbar.timeline': {
    title: 'Histórico Visual (Timeline)',
    description: 'Lista todas as ações recentes com nome e permite voltar ou avançar para qualquer passo em 1 clique.',
  },
  'topbar.shortcuts': {
    title: 'Atalhos de Teclado (?)',
    description: 'Exibe todos os atalhos rápidos do editor (Espaço para Mão, V, B, T, I, Ctrl+G, Ctrl+A).',
  },

  // Edition 12 Subprofiles
  'edition.recorte': {
    title: 'Recorte & Enquadramento',
    description: 'Controle a proporção de corte e a área visível da imagem dentro do slide.',
  },
  'edition.geometria': {
    title: 'Geometria & Rotação',
    description: 'Gire, espelhe ou incline a imagem para corrigir horizonte e perspectiva.',
  },
  'edition.luz': {
    title: 'Luz & Exposição',
    description: 'Ajuste exposição geral, brilho e contraste básico da fotografia.',
  },
  'edition.tons': {
    title: 'Tons (Altas Luzes & Sombras)',
    description: 'Recupere detalhes em áreas muito claras (realces) ou muito escuras (sombras), além de brancos e pretos.',
  },
  'edition.curvas': {
    title: 'Curvas de Contraste',
    description: 'Ajuste fino da curva tonal para criar contraste cinematográfico ou suavizar pretos (fade).',
  },
  'edition.temperatura': {
    title: 'Temperatura & Matiz',
    description: 'Deixe a imagem mais quente (âmbar), mais fria (azul) ou corrija desvios verde/magenta.',
  },
  'edition.saturacao': {
    title: 'Saturação & Vibração',
    description: 'Intensifique cores discretas (vibração) sem estourar tons de pele, ou controle a saturação global.',
  },
  'edition.tonalizacao': {
    title: 'Tonalização (Split Toning)',
    description: 'Aplique uma cor sutil às sombras e outra aos realces para criar identidade visual uniforme.',
  },
  'edition.bokeh': {
    title: 'Foco & Bokeh',
    description: 'Adicione desfoque de lente e nitidez seletiva para destacar o assunto principal.',
  },
  'edition.textura': {
    title: 'Textura & Vinheta',
    description: 'Adicione claridade nas bordas, granulação de filme ou escurecimento suave nos cantos (vinheta).',
  },
  'edition.filtros': {
    title: 'Filtros Prontos',
    description: 'Aplique combinações instantâneas de cor e contraste calibradas para divulgação científica.',
  },
  'edition.selos': {
    title: 'Selos & Marcas',
    description: 'Insira selos institucionais, marcas d’água ou créditos oficiais da organização.',
  },

  // Sliders (common keys)
  'slider.exposure': {
    title: 'Exposição',
    description: 'Controla a quantidade geral de luz da foto. Valores positivos clareiam; negativos escurecem.',
  },
  'slider.contrast': {
    title: 'Contraste',
    description: 'Aumenta ou reduz a diferença entre áreas claras e escuras.',
  },
  'slider.highlights': {
    title: 'Realces',
    description: 'Recupera detalhes nas partes mais brilhantes sem afetar as sombras.',
  },
  'slider.shadows': {
    title: 'Sombras',
    description: 'Abre luz nas áreas escuras para revelar textura escondida.',
  },
  'slider.temperature': {
    title: 'Temperatura',
    description: 'Desloque para a esquerda para tons frios (azul) ou para a direita para tons quentes (amarelo).',
  },
  'slider.tint': {
    title: 'Matiz',
    description: 'Compensa tons esverdeados ou magenta na iluminação.',
  },
  'slider.vibrance': {
    title: 'Vibração',
    description: 'Realça cores apagadas de forma inteligente, protegendo cores já saturadas.',
  },
  'slider.saturation': {
    title: 'Saturação',
    description: 'Controla a intensidade pura de todas as cores da imagem.',
  },
  'slider.blur': {
    title: 'Desfoque / Bokeh',
    description: 'Suaviza o plano inteiro ou combina com a Máscara para desfocar apenas o fundo.',
  },
  'slider.vignette': {
    title: 'Vinheta',
    description: 'Escurece ou clareia suavemente as bordas do quadro para guiar o olhar ao centro.',
  },
  'slider.clarity': {
    title: 'Claridade',
    description: 'Realça micro-contraste e textura de superfícies.',
  },
  'slider.grain': {
    title: 'Granulação',
    description: 'Simula textura orgânica de filme fotográfico.',
  },

  // Text subprofiles (4)
  'text.content': {
    title: 'Conteúdo & LaTeX',
    description: 'Edite o texto da camada ou ative o modo matemático LaTeX ($...$) para equações nítidas.',
  },
  'text.typography': {
    title: 'Tipografia & Alinhamento',
    description: 'Escolha a família da fonte, peso, tamanho e alinhamento do parágrafo.',
  },
  'text.style': {
    title: 'Cores, Fundo & Sombra',
    description: 'Defina cor da letra, caixa de destaque atrás do texto e sombra para leitura sobre fotos.',
  },
  'text.spacing': {
    title: 'Espaçamento & Caixa',
    description: 'Ajuste altura de linha, espaçamento entre letras e largura da caixa de texto.',
  },
  'text.manualShortcuts': {
    title: 'Atalhos Manuais',
    description: 'Insere delimitadores ($...$, **...**, \\frac{}{}) exatamente na posição do cursor sem perder o foco.',
  },
  'text.markdown': {
    title: 'Comandos Markdown',
    description: 'Aplica títulos (H1–H3), listas, citações, tachado e destaques coloridos da organização.',
  },
  'text.latexPresets': {
    title: 'Equações LaTeX & Física',
    description: 'Insere integrais, somatórios, vetores, matrizes, símbolos gregos e equações clássicas prontas.',
  },
  'text.presets': {
    title: 'Diagramação Rápida',
    description: 'Cria blocos prontos de citação, fato científico, pergunta ou passo a passo em 1 clique.',
  },
  'text.batchFill': {
    title: 'Preenchimento em Lote',
    description: 'Substitui variáveis {DATA}, {HORARIO}, {LOCAL} e {PALESTRANTE} em todos os slides de uma vez.',
  },

  // Elements subprofiles (4)
  'elements.shapes': {
    title: 'Formas & Linhas',
    description: 'Retângulos, círculos, setas e linhas divisórias para estruturar o layout.',
  },
  'elements.stickers': {
    title: 'Ícones & Adesivos',
    description: 'Símbolos visuais para destacar chamadas, avisos e tópicos.',
  },
  'elements.badges': {
    title: 'Selos & Tags',
    description: 'Etiquetas prontas para datas, locais, eventos e categorias.',
  },
  'elements.qr': {
    title: 'Gerador de QR Code',
    description: 'Gere um QR Code vetorial nítido direto no slide a partir de qualquer link.',
  },

  // Image subprofiles (2)
  'image.library': {
    title: 'Galeria & Envio',
    description: 'Escolha imagens do cofre da organização ou envie novas fotos para este slide.',
  },
  'image.framing': {
    title: 'Enquadramento & Transformação',
    description: 'Troque entre preencher ou ajustar na tela, inverta a foto ou redefina a posição.',
  },

  // Layers & Palette internal options
  'layers.stack': {
    title: 'Pilha de Camadas',
    description: 'A ordem de cima para baixo define o que aparece na frente. Toque para selecionar, bloquear ou ocultar.',
  },
  'palette.harmony': {
    title: 'Harmonias Cromáticas',
    description: 'Gere combinações análogas, complementares ou triádicas a partir da cor base da organização.',
  },
  'palette.wcag': {
    title: 'Contraste da Cor Base',
    description: 'Indica se a cor selecionada tem leitura confortável (AA ou AAA) sobre texto branco.',
  },

  // Masks (4 subprofiles)
  'masks.shapes': {
    title: 'Máscaras Geométricas',
    description: 'Recorte a foto em círculo, oval, hexágono, estrela ou arco com suavização de bordas.',
  },
  'masks.gradient': {
    title: 'Gradiente de Fusão',
    description: 'Crie transparência gradual linear ou radial para fundir a foto suavemente com o fundo.',
  },
  'masks.brush': {
    title: 'Pincel de Máscara',
    description: 'Pinte diretamente na imagem para refinar recortes, usar edição seletiva ou efeito sanduíche.',
  },
  'masks.removeBg': {
    title: 'Remover Fundo & Lousa',
    description: 'Remova fundos sólidos instantaneamente ou extraia escrita de lousa e caderno em 1 clique.',
  },

  // Brush (Fase 5C)
  'brush.tools': {
    title: '7 Pincéis Livres',
    description: 'Escolha entre Caneta, Marcador, Marca-Texto, Neon, Spray, Tracejado ou Borracha isolada.',
    tip: 'A borracha apaga apenas os traços do desenho, sem furar a foto abaixo.',
  },
  'brush.size': {
    title: 'Espessura do Pincel',
    description: 'Define a largura do traço em pixels proporcionais ao tamanho final do slide.',
  },
  'topbar.instagramPreview': {
    title: 'Simulador Instagram & Reels',
    description: 'Visualiza como seu carrossel aparece na grade 3×3 do perfil, no swipe do feed e sob os botões reais de Reels/Stories.',
  },
  'brush.opacity': {
    title: 'Opacidade do Traço',
    description: 'Controla a transparência da tinta aplicada pelo pincel.',
  },
};
