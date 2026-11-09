const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const workbook = xlsx.readFile('Tarefas.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
const data = rawData.map(row => {
    const normalized = {};
    for (const key in row) {
        normalized[key.trim()] = row[key];
    }
    return normalized;
});

let sql = `
-- Drop se existir
DROP TABLE IF EXISTS tasks;

-- Tabela Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    nome TEXT NOT NULL,
    status TEXT NOT NULL,
    prioridade TEXT,
    categoria TEXT,
    responsavel TEXT,
    inicio TIMESTAMP WITH TIME ZONE,
    prazo TIMESTAMP WITH TIME ZONE,
    descricao TEXT,
    frequencia TEXT,
    dimensao TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS Config
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS

CREATE POLICY "Usuários autenticados podem ver tarefas HUB ou suas próprias"
ON tasks
FOR SELECT
TO authenticated
USING (
    dimensao = 'HUB' OR user_id = auth.uid()
);

CREATE POLICY "Usuários autenticados podem gerenciar tarefas"
ON tasks
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Dados do Excel
`;

const escapeString = (str) => {
    if (str === null || str === undefined) return 'NULL';
    return `'${String(str).replace(/'/g, "''")}'`;
};

for (const row of data) {
    const nome = escapeString(row.nome);
    const status = escapeString(row.status || 'não iniciada');
    const prioridade = escapeString(row.prioridade);
    const categoria = escapeString(row.categoria);
    const responsavel = escapeString(row.responsavel);
    let inicio = escapeString(row.inicio);
    let prazo = escapeString(row.prazo);
    const descricao = escapeString(row.descricao);
    const frequencia = escapeString(row.frequencia);
    const dimensao = escapeString(row.dimensao);
    
    // Tratamento de datas do Excel
    if (row.inicio && typeof row.inicio === 'number') {
        const date = new Date((row.inicio - (25567 + 2)) * 86400 * 1000); // Excel serial date to JS
        inicio = escapeString(date.toISOString());
    } else if (inicio === "' '") inicio = 'NULL';

    if (row.prazo && typeof row.prazo === 'number') {
        const date = new Date((row.prazo - (25567 + 2)) * 86400 * 1000);
        prazo = escapeString(date.toISOString());
    } else if (prazo === "' '") prazo = 'NULL';

    sql += `INSERT INTO tasks (nome, status, prioridade, categoria, responsavel, inicio, prazo, descricao, frequencia, dimensao) VALUES (${nome}, ${status}, ${prioridade}, ${categoria}, ${responsavel}, ${inicio}, ${prazo}, ${descricao}, ${frequencia}, ${dimensao});\n`;
}

const migrationPath = path.join(__dirname, 'supabase', 'migrations', 'newsqls', 'god-sql-mk7.sql');

fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
fs.writeFileSync(migrationPath, sql);

console.log('Migration generated successfully at:', migrationPath);
