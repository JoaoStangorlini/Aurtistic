const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const excelFile = path.join(__dirname, 'Tarefas.xlsx');
const sqlFile = path.join(__dirname, 'supabase/migrations/newsqls/merged mk1.sql');
const newSqlDir = path.join(__dirname, 'supabase/migrations/newsqls');

const wb = XLSX.readFile(excelFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

const USER_ID = '3aab23d0-5fdb-4dfd-94c6-eef416ef4284'; // Using the standard user ID from previous SQLs
// Wait, we should make sure we know the user ID. I'll just use a placeholder or read it from the existing SQL.
// Actually, let's read the existing SQL to find the correct user_id if we can.
let existingSQL = '';
try {
  existingSQL = fs.readFileSync(sqlFile, 'utf8');
} catch(e) {
  console.log("SQL file not found", e);
}

// Extract an existing user_id from the file if possible
const match = existingSQL.match(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/);
const defaultUserId = match ? match[1] : '89e900bb-85bb-4a57-b05f-f6bb2eb85f95';

const sqlStatements = data.map((row, index) => {
  const nome = (row['nome'] || '').replace(/'/g, "''");
  if (!nome) return ''; // Skip empty rows
  
  const status = (row['status'] || 'não iniciada').toLowerCase();
  const prioridade = row['prioridade'] || 'Baixa';
  const categoria = row['categoria'] || 'Programar';
  const responsavel = row['responsavel'] || 'João';
  const dimensao = row['dimensao'] || 'HUB';
  
  const inicio = row['inicio'] ? `'${row['inicio']}'` : 'NULL';
  const prazo = row['prazo'] ? `'${row['prazo']}'` : 'NULL';
  
  const isFavoriteStr = (row['favorita'] || '').toUpperCase();
  const isFavorite = isFavoriteStr === 'S' || isFavoriteStr === 'SIM' || isFavoriteStr === 'TRUE' ? 'TRUE' : 'FALSE';
  
  const frequencia = row['frequencia'] ? `'${row['frequencia'].replace(/'/g, "''")}'` : 'NULL';
  const descricao = row['descricao'] ? `'${row['descricao'].replace(/'/g, "''")}'` : 'NULL';
  
  const id = crypto.randomUUID();
  const ordemManual = index + 1000; // Put them at the end

  return `INSERT INTO public.tarefas (id, created_at, nome, status, prioridade, categoria, responsavel, inicio, prazo, descricao, frequencia, dimensao, concluida_em, user_id, ordem_manual, is_favorite, parent_id)
VALUES (
  '${id}',
  now(),
  '${nome}',
  '${status}',
  '${prioridade}',
  '${categoria}',
  '${responsavel}',
  ${inicio},
  ${prazo},
  ${descricao},
  ${frequencia},
  '${dimensao}',
  NULL,
  '${defaultUserId}',
  ${ordemManual},
  ${isFavorite},
  NULL
);`;
}).filter(s => s);

const newSQLBlock = '\n\n-- NOVAS TAREFAS (via Excel)\n' + sqlStatements.join('\n');

const currentLines = existingSQL.split('\n').length;
const addedLines = sqlStatements.length * 19 + 2;

if (currentLines + addedLines <= 700) {
  fs.appendFileSync(sqlFile, newSQLBlock);
  console.log(`Successfully appended ${sqlStatements.length} tasks to merged mk1.sql`);
} else {
  // Need to create a new file
  const fileNum = fs.readdirSync(newSqlDir).filter(f => f.endsWith('.sql')).length + 1;
  const newFileName = `merged mk${fileNum}.sql`;
  const newFilePath = path.join(newSqlDir, newFileName);
  fs.writeFileSync(newFilePath, `-- LICENSE AGPLv3\n-- Este programa é um software livre\n` + newSQLBlock);
  console.log(`Successfully created ${newFileName} with ${sqlStatements.length} tasks (exceeded 700 lines in mk1).`);
}
