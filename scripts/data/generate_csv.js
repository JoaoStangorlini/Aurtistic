const fs = require('fs');
const path = require('path');

const notionSql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/already in supa/notion.sql'), 'utf-8');
const googleSql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/already in supa/seed_google_tasks.sql'), 'utf-8');

const tasks = [];

function parseSqlValues(raw) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    
    if (char === "'") {
      if (inQuotes && raw[i+1] === "'") {
        current += "'";
        i++; // pula o escape
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // push last
  
  return result.map(v => {
    if (v === 'NULL') return '';
    return v;
  });
}

// Parse Notion
const notionLines = notionSql.split('\n').filter(l => l.includes('INSERT INTO'));
notionLines.forEach(line => {
  const match = line.match(/VALUES \((.+)\);/);
  if (match) {
    const values = parseSqlValues(match[1]);
    tasks.push({
      nome: values[0],
      status: values[6],
      prioridade: values[4],
      categoria: values[1],
      responsavel: values[5],
      data: values[2],
      descricao: values[3],
      dimensao: 'HUB'
    });
  }
});

// Parse Google Tasks
let currentDimension = '';
const googleLines = googleSql.split('\n');
googleLines.forEach(line => {
  if (line.startsWith('--')) {
    if (line.includes('Minhas tarefas')) currentDimension = 'PESSOAL';
    if (line.includes('USP')) currentDimension = 'USP';
    if (line.includes('Projeto')) currentDimension = 'HUB';
    if (line.includes('Filmes/séries')) currentDimension = 'Filmes/series';
    if (line.includes('CIN')) currentDimension = 'CIN';
    if (line.includes('Tatuagens')) currentDimension = 'tatuagens';
    if (line.includes('Compras')) currentDimension = 'compras';
    if (line.includes('Hobbys')) currentDimension = 'hobbys';
    if (line.includes('Livros')) currentDimension = 'livros';
  } else if (line.includes('INSERT INTO')) {
    const match = line.match(/VALUES \((.+)\);/);
    if (match) {
      const values = parseSqlValues(match[1]);
      tasks.push({
        nome: values[0],
        status: values[1],
        prioridade: 'Baixa',
        categoria: '',
        responsavel: '',
        data: values.length > 3 ? values[3] : '',
        descricao: '',
        dimensao: currentDimension
      });
    }
  }
});

const header = ['nome', 'status', 'prioridade', 'categoria', 'responsavel', 'data', 'descricao', 'dimensao'];
const escapeCsv = (str) => {
  if (!str) return '';
  const stringified = String(str).replace(/"/g, '""');
  return `"${stringified}"`;
};

const csvContent = [
  header.join(','),
  ...tasks.map(t => header.map(k => escapeCsv(t[k])).join(','))
].join('\n');

// Adicionar BOM para que o Excel e o Google Sheets reconheçam UTF-8 automaticamente
fs.writeFileSync(path.join(__dirname, 'tarefas_remapeadas.csv'), '\uFEFF' + csvContent);
console.log('CSV recriado com sucesso! Total de tarefas: ' + tasks.length);
