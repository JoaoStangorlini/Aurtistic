// Este programa é um software livre (Licença AGPLv3)
export interface ModulesConfig {
  tasks: boolean;
  selfCare: boolean;
  resumo: boolean;
  portfolio: boolean;
  curriculo: boolean;
  servidor: boolean;
  defaultRoute: string; // '/', '/servidor', '/portfolio', '/resumo', '/curriculo'
}

export const MODULES_STORAGE_KEY = 'aurtistic_modules_config';

export const DEFAULT_MODULES_CONFIG: ModulesConfig = {
  tasks: true,
  selfCare: true,
  resumo: true,
  portfolio: true,
  curriculo: true,
  servidor: true,
  defaultRoute: '/',
};

export interface ModulePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: ModulesConfig;
}

export const MODULE_PRESETS: ModulePreset[] = [
  {
    id: 'full',
    name: '✨ Ecossistema Completo',
    description: 'Tarefas, Cuidados, Resumo, Portfólio, Currículo e Servidor.',
    icon: 'auto_awesome',
    config: {
      tasks: true,
      selfCare: true,
      resumo: true,
      portfolio: true,
      curriculo: true,
      servidor: true,
      defaultRoute: '/',
    },
  },
  {
    id: 'server-only',
    name: '🗄️ Gestão & Servidor',
    description: 'Gestão institucional, equipes e cofre em nuvem de 25 GB.',
    icon: 'dns',
    config: {
      tasks: false,
      selfCare: false,
      resumo: false,
      portfolio: false,
      curriculo: false,
      servidor: true,
      defaultRoute: '/servidor',
    },
  },
  {
    id: 'server-portfolio',
    name: '🗂️ Servidor + Portfólio',
    description: 'Armazenamento com vitrine fotográfica e acervo de projetos.',
    icon: 'photo_library',
    config: {
      tasks: false,
      selfCare: false,
      resumo: false,
      portfolio: true,
      curriculo: false,
      servidor: true,
      defaultRoute: '/portfolio',
    },
  },
  {
    id: 'business-card',
    name: '💼 Resumo Profissional & Portfólio',
    description: 'Apresentação pessoal, cartão de visitas, portfólio autoral e currículo.',
    icon: 'badge',
    config: {
      tasks: false,
      selfCare: false,
      resumo: true,
      portfolio: true,
      curriculo: true,
      servidor: false,
      defaultRoute: '/resumo',
    },
  },
  {
    id: 'tasks-care',
    name: '🧠 Tarefas + Cuidados',
    description: 'Foco em produtividade diária, rotinas e suporte neurodivergente.',
    icon: 'psychology',
    config: {
      tasks: true,
      selfCare: true,
      resumo: false,
      portfolio: false,
      curriculo: false,
      servidor: false,
      defaultRoute: '/',
    },
  },
];

export function getInitialModulesConfig(): ModulesConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_MODULES_CONFIG;
  }
  try {
    const raw = localStorage.getItem(MODULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tasks: typeof parsed.tasks === 'boolean' ? parsed.tasks : true,
        selfCare: typeof parsed.selfCare === 'boolean' ? parsed.selfCare : true,
        resumo: typeof parsed.resumo === 'boolean' ? parsed.resumo : true,
        portfolio: typeof parsed.portfolio === 'boolean' ? parsed.portfolio : true,
        curriculo: typeof parsed.curriculo === 'boolean' ? parsed.curriculo : true,
        servidor: typeof parsed.servidor === 'boolean' ? parsed.servidor : true,
        defaultRoute: typeof parsed.defaultRoute === 'string' ? parsed.defaultRoute : '/',
      };
    }
  } catch {}
  return DEFAULT_MODULES_CONFIG;
}

