// Este programa é um software livre (Licença AGPLv3)

export const LEGAL_DOCS_VERSION = '2026-11';
export const LEGAL_LAST_UPDATED = 'Novembro de 2026';

export const LEGAL_CONTROLLER = {
  name: 'João Stangorlini',
  email: 'joaopaulostangorlini@gmail.com',
  repoUrl: 'https://github.com/JoaoStangorlini/Aurtistic',
};

export interface LegalSection {
  id: string;
  icon: string;
  title: string;
  paragraphs: string[];
  accent?: 'default' | 'warning' | 'danger';
}

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    id: 'controller-license',
    icon: 'shield',
    title: '1. Controlador, Dados Coletados e Separação de Licenças',
    paragraphs: [
      `Esta Política de Privacidade rege o tratamento de dados na instância hospedada do Aurtistic e seus aplicativos oficiais, sob responsabilidade de ${LEGAL_CONTROLLER.name} (contato: ${LEGAL_CONTROLLER.email}). O código-fonte do projeto é software livre licenciado sob a GNU AGPLv3, mas esta política disciplina especificamente a privacidade e proteção de dados no serviço em operação.`,
      'O Aurtistic foi desenhado para coletar apenas o estritamente necessário: contas locais podem usar identificador próprio (@aurtistic.local) sem exigir documentos ou rastreamento publicitário de terceiros.',
    ],
  },
  {
    id: 'auth-sso',
    icon: 'passkey',
    title: '2. Autenticação Local, Aceite e Vínculo HUB LabDiv',
    paragraphs: [
      'No cadastro e acesso, armazenamos seu identificador (usuário ou e-mail), credenciais protegidas por hash criptográfico na camada de autenticação e o registro imutável da versão aceita dos Termos de Uso e desta Política de Privacidade (com data e hora geradas no servidor).',
      'Caso opte por entrar ou vincular sua conta via SSO institucional do HUB LabDiv, recebemos apenas os atributos de perfil e organizações vinculados à sua autorização explícita.',
    ],
  },
  {
    id: 'productivity-selfcare',
    icon: 'favorite',
    title: '3. Produtividade, Organizações e Dados Sensíveis de Autocuidado (LGPD Art. 11)',
    accent: 'warning',
    paragraphs: [
      'Armazenamos suas tarefas, metas, eventos de agenda, rascunhos do Post Studio e participações em organizações na infraestrutura em nuvem com isolamento por regras de Row Level Security (RLS), garantindo que apenas você e membros autorizados das suas organizações acessem seus respectivos conteúdos.',
      'Os recursos de Autocuidado (registros opcionais de hidratação, pausas visuais 20-20-20, alimentação, respiração, medicamentos e sono) têm uso totalmente opcional e podem envolver dados relativos à saúde e bem-estar (dados pessoais sensíveis conforme Art. 11 da LGPD). Eles são tratados exclusivamente a seu pedido e mediante seu consentimento ativo, sem qualquer uso comercial ou diagnóstico médico.',
    ],
  },
  {
    id: 'vault-encryption',
    icon: 'lock',
    title: '4. Cofre de Arquivos, Criptografia, Lixeira e PIN de Pasta',
    paragraphs: [
      'Os arquivos enviados ao Cofre (servidor Edge em storage.hublabdiv.com.br) são armazenados em disco com criptografia autenticada AEAD em repouso (formato AURTENC2 / AES-256-GCM), suportam envio resumível em partes grandes e indexação segura por tenant.',
      'Arquivos excluídos (inclusive via sincronização de pastas) são movidos para a lixeira interna (.trash) com retenção automática de 15 dias antes da remoção definitiva, salvo esvaziamento manual antecipado pelo usuário.',
      'Quando você configura um PIN em uma pasta do Cofre, apenas o hash criptográfico com sal (scrypt) é salvo no servidor Edge. O PIN nunca é armazenado nem exibido em texto claro e não pode ser recuperado diretamente pelo usuário; em caso de esquecimento, qualquer desbloqueio excepcional exige verificação administrativa junto ao controlador.',
    ],
  },
  {
    id: 'native-apps-lan',
    icon: 'devices',
    title: '5. Aplicativos Nativos (Android, Desktop) e Rede Local (LAN)',
    paragraphs: [
      'Nos aplicativos oficiais para Android e Desktop (Windows, Linux e macOS), tokens revogáveis de acesso ao Cofre são gravados exclusivamente nos cofres nativos de segurança do sistema operacional (Android Keystore / EncryptedSharedPreferences e Electron safeStorage — Keychain, DPAPI ou libsecret, recusando armazenamento em texto simples no Linux).',
      'No app Desktop, o espelhamento bidirecional monitora somente as pastas locais selecionadas explicitamente por você, mantendo registro local mínimo de fila e estado de sincronização. Caso configure um endereço de rede local (LAN) para acelerar transferências em casa, o aplicativo testa apenas a rota local autorizada para verificar conectividade com o seu servidor.',
    ],
  },
  {
    id: 'subprocessors-intl',
    icon: 'public',
    title: '6. Operadores, Subprocessadores e Transferência Internacional (LGPD Art. 33)',
    paragraphs: [
      'Para operar o ecossistema, utilizamos operadores técnicos essenciais: Supabase (banco PostgreSQL e autenticação), Vercel (hospedagem da interface web e APIs), GitHub (distribuição dos instaladores Desktop e repositório APT assinado) e Cloudflare Tunnel / servidor Edge para tráfego seguro até a unidade de armazenamento.',
      'Alguns desses operadores processam ou transitam dados em servidores localizados no exterior (como Estados Unidos ou União Europeia). A transferência internacional ocorre estritamente para viabilizar a infraestrutura solicitada, protegida por criptografia em trânsito (TLS), criptografia em repouso e controles de acesso rigorosos, em conformidade com o Art. 33 da LGPD.',
    ],
  },
  {
    id: 'public-data',
    icon: 'visibility',
    title: '7. Dados Públicos (Portfólio, Currículo e Links de Compartilhamento)',
    paragraphs: [
      'Informações inseridas nos módulos públicos de Resumo, Currículo, Portfólio ou links de compartilhamento gerados por você têm finalidade de exibição pública conforme sua configuração. Campos deixados em branco ou marcados como privados não são expostos publicamente.',
    ],
  },
  {
    id: 'lgpd-rights',
    icon: 'delete_forever',
    title: '8. Direitos do Titular, Exportação e Exclusão (LGPD Art. 18)',
    accent: 'danger',
    paragraphs: [
      'Você pode exportar suas tarefas em CSV, revogar tokens de dispositivos (Android/Desktop/WebDAV) e excluir definitivamente sua conta e tarefas a qualquer momento pelas configurações do aplicativo. A exclusão de conta no painel é imediata e irreversível.',
      `Para exercer outros direitos previstos no Art. 18 da LGPD (confirmação, correção, revisão ou eliminação complementar de registros), entre em contato pelo e-mail ${LEGAL_CONTROLLER.email}. As solicitações são respondidas em até 15 dias corridos após verificação de titularidade.`,
    ],
  },
];

export const TERMS_OF_USE_SECTIONS: LegalSection[] = [
  {
    id: 'acceptance-license',
    icon: 'gavel',
    title: '1. Aceite dos Termos e Distinção entre Código (AGPLv3) e Serviço',
    paragraphs: [
      `Ao criar uma conta ou utilizar o Aurtistic (web, Android ou Desktop), você declara ter lido e concordado com estes Termos de Uso (versão ${LEGAL_DOCS_VERSION}) e com a Política de Privacidade associada.`,
      `O código-fonte do Aurtistic é disponibilizado como software livre sob licença GNU AGPLv3 (${LEGAL_CONTROLLER.repoUrl}). Estes Termos de Uso não restringem os direitos conferidos pela AGPLv3 sobre o código-fonte, mas regulam as regras de uso desta instância hospedada, suas APIs, servidor Edge e pacotes distribuídos oficialmente.`,
    ],
  },
  {
    id: 'credentials-devices',
    icon: 'admin_panel_settings',
    title: '2. Responsabilidade por Credenciais, PIN e Dispositivos Vinculados',
    paragraphs: [
      'Você é integralmente responsável pela confidencialidade da sua senha, do eventual PIN configurado em pastas do Cofre e dos aparelhos onde mantiver sessões ou tokens revogáveis ativos.',
      'Como o PIN de pastas é armazenado apenas via hash scrypt irreversível, recomenda-se anotá-lo em local seguro. Em caso de perda ou comprometimento de um computador ou celular, revogue imediatamente o token correspondente pelo painel web.',
    ],
  },
  {
    id: 'vault-acceptable-use',
    icon: 'cloud_done',
    title: '3. Uso Aceitável do Cofre, Cotas e Retenção na Lixeira (.trash)',
    paragraphs: [
      'O armazenamento no Cofre respeita os limites de cota definidos para sua conta ou organização. É proibido utilizar a plataforma para armazenar ou distribuir malware, material ilícito, conteúdo que viole direitos autorais de terceiros ou realizar ataques de sobrecarga contra a infraestrutura.',
      'Itens removidos ou movidos durante sincronizações ficam retidos na lixeira (.trash) por 15 dias corridos e são removidos permanentemente após esse prazo.',
    ],
  },
  {
    id: 'sync-backups',
    icon: 'sync',
    title: '4. Espelhamento Seletivo de Pastas e Dever de Backup',
    accent: 'warning',
    paragraphs: [
      'O aplicativo Desktop oferece sincronização bidirecional seletiva com preservação de conflitos e envio de exclusões para a lixeira (.trash). Apesar das salvaguardas de integridade (verificação SHA-256 e gravação atômica), falhas de hardware local, discos externos removidos abruptamente ou exclusões definitivas podem ocorrer.',
      'O usuário reconhece que deve manter cópias de segurança independentes para arquivos críticos ou insubstituíveis.',
    ],
  },
  {
    id: 'selfcare-disclaimer',
    icon: 'medical_services',
    title: '5. Isenção de Responsabilidade Médica (Módulo de Autocuidado)',
    paragraphs: [
      'Alertas e registros de hidratação, descanso visual (regra 20-20-20), alongamento, respiração, alimentação, horários de medicação e sono têm caráter estritamente auxiliar e organizacional.',
      'O Aurtistic não é um dispositivo médico, não fornece aconselhamento clínico, diagnóstico ou prescrição e não substitui acompanhamento por profissionais de saúde.',
    ],
  },
  {
    id: 'ip-organizations',
    icon: 'groups',
    title: '6. Propriedade Intelectual do Usuário e Organizações',
    paragraphs: [
      'Você mantém integralmente a propriedade e os direitos autorais sobre os arquivos, textos, currículos, portfólios e peças criadas no Post Studio dentro do Aurtistic.',
      'Em espaços de Organização compartilhados, você se compromete a respeitar permissões definidas pelos administradores da equipe e a não publicar material confidencial sem autorização.',
    ],
  },
  {
    id: 'availability-contact',
    icon: 'support_agent',
    title: '7. Disponibilidade, Alterações e Contato',
    paragraphs: [
      'O serviço é fornecido no estado em que se encontra ("as is"), podendo passar por manutenções programadas ou atualizações nos aplicativos. Em caso de alterações relevantes nestes Termos ou na Política de Privacidade, a nova versão será publicada com a respectiva data de vigência.',
      `Dúvidas operacionais, relatos de segurança ou solicitações legais podem ser enviados para ${LEGAL_CONTROLLER.email}.`,
    ],
  },
];
