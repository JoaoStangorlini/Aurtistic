// Este programa é um software livre (Licença AGPLv3)

export interface CoachMarkStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  icon: string;
  preferredPlacement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface CoachMarksTour {
  tourTitle: string;
  steps: CoachMarkStep[];
}

export const ROUTE_COACH_MARKS: Record<string, CoachMarksTour> = {
  '/': {
    tourTitle: 'Guia do Espaço de Tarefas',
    steps: [
      {
        id: 'nav-tabs',
        selector: '[data-tour="nav-tabs"]',
        title: 'Navegação Principal',
        description:
          'Alterne instantaneamente entre Tarefas, Gestão & Servidor e os perfis de Identidade profissional.',
        icon: 'tabs',
        preferredPlacement: 'bottom',
      },
      {
        id: 'nav-identity-dropdown',
        selector: '[data-tour="nav-identity-dropdown"]',
        title: 'Apresentação & Identidade',
        description:
          'Acesso unificado e direto ao seu Portfólio fotográfico, Currículo acadêmico e Resumo / Cartão de Visitas.',
        icon: 'badge',
        preferredPlacement: 'bottom',
      },
      {
        id: 'org-scope-toolbar',
        selector: '[data-tour="org-scope-toolbar"]',
        title: 'Escopo de Trabalho (Pessoal vs Organização)',
        description:
          'Alterne a exibição entre suas tarefas individuais, da organização ativa (ex.: LabDiv) ou a visão unificada "Tudo".',
        icon: 'domain',
        preferredPlacement: 'bottom',
      },
      {
        id: 'workspace-mode-switcher',
        selector: '[data-tour="workspace-mode-switcher"]',
        title: 'Visualização Dinâmica',
        description:
          'Filtre sua visão entre Tarefas pendentes, Eventos da Agenda semanal ou exiba Ambos simultaneamente.',
        icon: 'view_agenda',
        preferredPlacement: 'bottom',
      },
      {
        id: 'quick-links-menu',
        selector: '[data-tour="quick-links-menu"]',
        title: 'Links Rápidos & Atalhos',
        description:
          'Acesso imediato em 1 clique aos seus links mais usados, com barra compacta e gaveta expansível.',
        icon: 'link',
        preferredPlacement: 'bottom',
      },
      {
        id: 'self-care-hub',
        selector: '[data-tour="self-care-hub"]',
        title: 'Autocuidado & Interocepção',
        description:
          'Contador de água, descanso visual 20-20-20 e pausas sensoriais calibradas para prevenção de fadiga por hiperfoco.',
        icon: 'spa',
        preferredPlacement: 'bottom',
      },
      {
        id: 'tasks-toolbar',
        selector: '[data-tour="tasks-toolbar"]',
        title: 'Gestão Ágil de Tarefas',
        description:
          'Criação rápida com rascunhos, busca instantânea, foco diário e gerenciador de colunas customizadas.',
        icon: 'task_alt',
        preferredPlacement: 'bottom',
      },
      {
        id: 'tasks-quick-filters',
        selector: '[data-tour="tasks-quick-filters"]',
        title: 'Filtros Rápidos & Ordenação',
        description:
          'Ordene por prazo ou prioridade e filtre por responsável, dimensão ou categoria com 1 clique.',
        icon: 'filter_list',
        preferredPlacement: 'bottom',
      },
      {
        id: 'tasks-main-view',
        selector: '[data-tour="tasks-main-view"]',
        title: 'Quadro Principal de Tarefas',
        description:
          'Acompanhe o fluxo de execução das suas atividades nos modos Lista, Semanal ou Mensal.',
        icon: 'view_kanban',
        preferredPlacement: 'top',
      },
      {
        id: 'workspace-actions',
        selector: '[data-tour="workspace-actions"]',
        title: 'Personalização do Espaço',
        description:
          'Compartilhe seu espaço com link público ou abra o editor para ativar, renomear e reordenar abas.',
        icon: 'dashboard_customize',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Perfil & Aparência Multi-Eixo',
        description:
          'Alterne entre os modos Claro, Escuro e Automático, e troque a paleta de cores para combinar com seu estilo.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda Sempre Perto',
        description:
          'Clique no botão "?" em qualquer página do Aurtistic para rever o tutorial guiado específico daquela tela.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/portfolio': {
    tourTitle: 'Guia do Portfólio & Acervo',
    steps: [
      {
        id: 'portfolio-subtabs',
        selector: '[data-tour="portfolio-subtabs"]',
        title: 'Acervo vs Projetos',
        description:
          'Alterne entre a vitrine de fotografias autorais em alta fidelidade e os projetos de software & design.',
        icon: 'photo_library',
        preferredPlacement: 'bottom',
      },
      {
        id: 'portfolio-albums',
        selector: '[data-tour="portfolio-albums"]',
        title: 'Álbuns & Filtros EXIF',
        description:
          'Navegue pelos álbuns temáticos, filtre favoritas ou encontre fotos por câmera, lente e metadados.',
        icon: 'photo_camera',
        preferredPlacement: 'bottom',
      },
      {
        id: 'portfolio-view-controls',
        selector: '[data-tour="portfolio-view-controls"]',
        title: 'Visualização Respirável',
        description:
          'Ajuste o número de colunas (1 a 5), alterne para subpastas ou baixe álbuns inteiros compactados em .ZIP.',
        icon: 'grid_view',
        preferredPlacement: 'bottom',
      },
      {
        id: 'portfolio-gallery',
        selector: '[data-tour="portfolio-gallery"]',
        title: 'Moldura Passe-Partout',
        description:
          'Exibição respeitando o enquadramento original da foto sem cortes forçados, com Lightbox Darkroom.',
        icon: 'crop_original',
        preferredPlacement: 'top',
      },
      {
        id: 'portfolio-share',
        selector: '[data-tour="portfolio-share"]',
        title: 'Compartilhamento & Vitrine Pública',
        description:
          'Copie o link público da sua vitrine ou gere links personalizados com proteção por PIN.',
        icon: 'share',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Temas & Cores',
        description:
          'Mude o tema e as cores de destaque da interface no menu de perfil.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda da Vitrine (?)',
        description:
          'Clique neste botão para rever este tour guiado a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/servidor': {
    tourTitle: 'Guia do Cofre de Arquivos',
    steps: [
      {
        id: 'vault-quota-card',
        selector: '[data-tour="vault-quota-card"]',
        title: 'Cofre & Quota do Edge Node',
        description:
          'Acompanhe o espaço utilizado em disco, o limite de quota e o status em tempo real do servidor Fire Stick.',
        icon: 'hard_drive',
        preferredPlacement: 'bottom',
      },
      {
        id: 'vault-tabs',
        selector: '[data-tour="vault-tabs"]',
        title: 'Abas do Servidor',
        description:
          'Navegue entre Seus Arquivos, Links de Clientes para aprovação fotográfica (/s/[token]), Lixeira e Quotas.',
        icon: 'folder_special',
        preferredPlacement: 'bottom',
      },
      {
        id: 'vault-layout-switcher',
        selector: '[data-tour="vault-layout-switcher"]',
        title: 'Alternador de Layout & IDE',
        description:
          'Alterne entre Grade com miniaturas, Lista detalhada ou o modo IDE estilo VS Code com árvore lateral e abas.',
        icon: 'terminal',
        preferredPlacement: 'bottom',
      },
      {
        id: 'vault-actions',
        selector: '[data-tour="vault-actions"]',
        title: 'Upload, Notas e Pastas com PIN',
        description:
          'Suba arquivos brutos, crie notas Markdown (.md) in-place ou pastas protegidas por PIN com criptografia scrypt.',
        icon: 'cloud_upload',
        preferredPlacement: 'bottom',
      },
      {
        id: 'vault-preview-pane',
        selector: '[data-tour="vault-preview-pane"]',
        title: 'Painel de Inspeção & Metadados',
        description:
          'Pré-visualize mídias, leia dados EXIF e acesse a ponte dos 4 Pilares diretamente com o atalho Alt+P.',
        icon: 'preview',
        preferredPlacement: 'left',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Configurações da Conta',
        description:
          'Alterne temas, configure notificações ou acerte suas preferências avançadas.',
        icon: 'settings',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda do Servidor (?)',
        description:
          'Clique neste botão para rever este tour guiado a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/resumo': {
    tourTitle: 'Guia do Resumo Profissional',
    steps: [
      {
        id: 'resumo-hero',
        selector: '[data-tour="resumo-hero"]',
        title: 'Apresentação Pessoal',
        description:
          'Seu resumo profissional com tagline, biografia, avatar e links de contato editáveis.',
        icon: 'badge',
        preferredPlacement: 'bottom',
      },
      {
        id: 'resumo-highlights',
        selector: '[data-tour="resumo-highlights"]',
        title: 'Destaques & Obras',
        description:
          'Obras fotográficas favoritas e projetos em destaque integrados diretamente ao seu cofre.',
        icon: 'stars',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Aparência & Temas',
        description:
          'Visualize sua apresentação tanto no modo escuro quanto claro com diferentes paletas.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda do Resumo (?)',
        description:
          'Clique neste botão para rever este tour guiado a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/curriculo': {
    tourTitle: 'Guia do Currículo & Evidências',
    steps: [
      {
        id: 'curriculo-header',
        selector: '[data-tour="curriculo-header"]',
        title: 'Currículo Estruturado',
        description:
          'Histórico profissional, formação acadêmica, competências técnicas e dados de contato organizados.',
        icon: 'contact_page',
        preferredPlacement: 'bottom',
      },
      {
        id: 'curriculo-certificates',
        selector: '[data-tour="curriculo-certificates"]',
        title: 'Certificados & Evidências Verificadas',
        description:
          'Diplomas e comprovações vinculados ao seu cofre, com visualização in-place e download direto.',
        icon: 'workspace_premium',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Aparência & Cores',
        description:
          'Personalize o tema da tela sem interferir na formatação padrão de impressão/PDF.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda do Currículo (?)',
        description:
          'Clique neste botão para rever este tour guiado a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/labdiv': {
    tourTitle: 'Guia de Gestão Institucional & Equipes',
    steps: [
      {
        id: 'org-view-mode',
        selector: '[data-tour="org-view-mode"]',
        title: 'Macro Switcher da Gestão',
        description:
          'Alterne entre a gestão de Equipe & Projetos e o Cofre de Arquivos compartilhado da organização.',
        icon: 'domain',
        preferredPlacement: 'bottom',
      },
      {
        id: 'team-progress-panel',
        selector: '[data-tour="team-progress-panel"]',
        title: 'Painel de Progresso & Bateria Cognitiva',
        description:
          'Acompanhe a taxa de conclusão das tarefas, filtre por subequipes e monitore o estado cognitivo de cada membro.',
        icon: 'analytics',
        preferredPlacement: 'bottom',
      },
      {
        id: 'org-meetings-section',
        selector: '[data-tour="org-meetings-section"]',
        title: 'Reuniões & Pautas Executáveis',
        description:
          'Agende reuniões, anexe notas do servidor e converta itens de pauta em tarefas rastreáveis com 1 clique.',
        icon: 'calendar_month',
        preferredPlacement: 'top',
      },
      {
        id: 'org-members-section',
        selector: '[data-tour="org-members-section"]',
        title: 'Membros da Equipe & Bateria',
        description:
          'Visualize membros ativos e convidados, atribuindo tarefas com base na energia disponível (Normal, Reduzida ou Esgotada).',
        icon: 'badge',
        preferredPlacement: 'top',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Aparência & Conta',
        description:
          'Personalize cores e temas da interface mantendo total legibilidade.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda da Gestão (?)',
        description:
          'Clique neste botão para rever o tour guiado da organização a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
  '/organizacoes': {
    tourTitle: 'Guia de Gestão Institucional & Equipes',
    steps: [
      {
        id: 'org-view-mode',
        selector: '[data-tour="org-view-mode"]',
        title: 'Macro Switcher da Gestão',
        description:
          'Alterne entre a gestão de Equipe & Projetos e o Cofre de Arquivos compartilhado da organização.',
        icon: 'domain',
        preferredPlacement: 'bottom',
      },
      {
        id: 'team-progress-panel',
        selector: '[data-tour="team-progress-panel"]',
        title: 'Painel de Progresso & Bateria Cognitiva',
        description:
          'Acompanhe a taxa de conclusão das tarefas, filtre por subequipes e monitore o estado cognitivo de cada membro.',
        icon: 'analytics',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Aparência & Conta',
        description:
          'Personalize cores e temas da interface mantendo total legibilidade.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
      {
        id: 'navbar-help',
        selector: '[data-tour="navbar-help"]',
        title: 'Ajuda da Gestão (?)',
        description:
          'Clique neste botão para rever o tour guiado a qualquer momento.',
        icon: 'help',
        preferredPlacement: 'bottom',
      },
    ],
  },
};

export function getCoachMarksForPathname(pathname: string): CoachMarksTour {
  // Normaliza caminhos como /aurtistic/portfolio -> /portfolio
  let cleanPath = pathname || '/';
  if (cleanPath.startsWith('/aurtistic/')) {
    cleanPath = cleanPath.replace('/aurtistic', '');
  }
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }

  // Tenta correspondência exata
  if (ROUTE_COACH_MARKS[cleanPath]) {
    return ROUTE_COACH_MARKS[cleanPath];
  }

  // Fallback geral
  return {
    tourTitle: 'Aurtistic Workspace',
    steps: [
      {
        id: 'nav-tabs',
        selector: '[data-tour="nav-tabs"]',
        title: 'Navegação Aurtistic',
        description: 'Acesse suas ferramentas integradas em um só lugar.',
        icon: 'tabs',
        preferredPlacement: 'bottom',
      },
      {
        id: 'profile-menu-trigger',
        selector: '[data-tour="profile-menu-trigger"]',
        title: 'Opções & Temas',
        description: 'Gerencie sua conta e personalize o esquema de cores.',
        icon: 'palette',
        preferredPlacement: 'bottom',
      },
    ],
  };
}
