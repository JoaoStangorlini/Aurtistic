const XLSX = require('xlsx');

const tasks = [
  "Ter como exportar uma tarefa para o calendário na edição, colocando os intervalos de horários nela. Tipo se repete a cada mês no dia tal horário tal",
  "A cada semana nesses dias nesses horários em cada dia",
  "Mudar o formulário de envio para ele ser em blocos. Como o bloco de formato, categoria, conteúdo em diferentes formatos, onde a pessoa pode mudar a forma do post miniatura e o em página completa",
  "Métricas do post no laboratório pessal",
  "Observatório do pesquisador ter também como pedir para adotar o Hub a alguma disciplina",
  "SAC no cgif",
  "Dicas/conselhos de veteranos na ferramentas",
  "Posto sobre a piada do acelerador \"(num carro tudo é um acelerador (menos a embreagem)\"",
  "Um espaço no Cgif para memes",
  "Uma divisão no envio entre arte/ comunicação científica/logs",
  "Unificação do fluxo para que nele tenham todas as dimensões de comunicação",
  "Matriz 3x3 2x2... O usuário vai escolhendo quantas dimensões vai ver no fluxo",
  "Deixar 5 espaços de rascunho para os posts",
  "Clarity em um iframe",
  "Mapa interativo sumiu",
  "Acompanhamento de scrool no cgif tem q sumir no mobile",
  "Ter ali um calendário, com opção de fazer um when tô meet tipo o da Dani, uma seção de tarefas q tenha como lançar tarefas, ter ali os links para meu currículo, redes sociais, galeria, projetos e futuramente acesso ao servidor Tudo dourado e roxo",
  "Ter como voltar um posto pRa o rascunho",
  "Ter uma navbar para o hub/cara da jaqueta/fotografia/dev/profissional/ Cada menu leva para meus projetos, documentos de apresentação/fala/pesquisa",
  "Contagem de acessos por abas/sub abas/posts",
  "Colocar cola quente na extremidade do fixador do pin para q n fique pontudo",
  "Pac-Man on terminal Linux",
  "Voltar pra Terapia",
  "Login separado Labdiv acessa só o Labdiv, tá com as autorizações iguais",
  "Adicionar filtros, ativado por padrão status",
  "Menus de todas/cada dimensão no pessoal",
  "Traduzir tudo",
  "Pesquisar limite de 60 lá do supa para ver como ele se comporta se 60 alunos enviarem \"ao msm tempo\" seus posts",
  "Colocar um iframe da página do LabDiv no lugar da que eu fiz ):",
  "Ao logar abre o navegador in app, e vc loga nele daí o navegador dá o calkback para o site e não para o app",
  "Coloridato de propranolol",
  "Widget",
  "Baixar os menus e oq der no app, salvar dados como login, constelações, grade, trilhas localmente com forma de gerenciamento de armazenamento no menu da conta e fzr ele virar um menu de configs mesmo",
  "Grade horária só com horários ocupados tipo 17h-19h",
  "Fazer as logos",
  "Selecionar e editar fotos",
  "Terminar pré post",
  "Melhorar tarefas do app, deixar possível favoritar e por prazo",
  "Comprar remédio",
  "Notificação n funciona no app e a individual tbm n funciona",
  "Logo na verificação de segurança fica bugada",
  "Quadrado amarelo aleatório em volta de alguns elementos da página (texto de intro do HUB), deve ser o NGC de narração ativado por padrao",
  "De navegar pelo tab",
  "Ter como dar estrela em algumas tarefas",
  "Ctrl + clique",
  "Widget das tarefas favoritas",
  "Falar com o Cristiano",
  "Reunião com o ortega",
  "Ler os artigos",
  "Pesquisar estudos de caso",
  "Dar estrelas em tarefas",
  "Testar ctrl + clique",
  "Filtro por prazo",
  "Ter como criar uma nova dimensão/categoria",
  "Botão sticky de ir para baixo e de + e de lapiz",
  "Ir para o topo ao tocar no index",
  "Widget de tarefas favoritas",
  "Adicionar subtarefas"
];

const data = tasks.map(nome => ({
  "Nome": nome,
  "Status": "não iniciada",
  "Prioridade": "",
  "Categoria": "",
  "Responsável": "",
  "Dimensão": "",
  "Início (AAAA-MM-DD)": "",
  "Prazo (AAAA-MM-DD)": "",
  "Favorita? (S/N)": "",
  "Frequência": "",
  "Descrição": ""
}));

const ws = XLSX.utils.json_to_sheet(data);

// Adjust column widths for better readability
const wscols = [
  { wch: 100 }, // Nome
  { wch: 15 },  // Status
  { wch: 15 },  // Prioridade
  { wch: 20 },  // Categoria
  { wch: 15 },  // Responsável
  { wch: 15 },  // Dimensão
  { wch: 20 },  // Início
  { wch: 20 },  // Prazo
  { wch: 15 },  // Favorita?
  { wch: 20 },  // Frequência
  { wch: 40 },  // Descrição
];
ws['!cols'] = wscols;

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Tarefas");

XLSX.writeFile(wb, "Tarefas_Novas.xlsx");
console.log("Tarefas_Novas.xlsx gerada com sucesso!");
