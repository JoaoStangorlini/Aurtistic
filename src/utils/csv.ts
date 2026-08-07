import { Task, AgendaEvent } from '@/types';

function escapeCSV(text: string | null | undefined): string {
  if (!text) return '';
  const str = String(text);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCSV(tasks: Task[], filename: string = 'tarefas.csv') {
  const headers = [
    'ID', 'Nome', 'Status', 'Prioridade', 'Categoria', 'Responsável',
    'Dimensão', 'Início', 'Prazo', 'Concluída Em', 'Frequência',
    'Descrição', 'Criada Em'
  ];

  const rows = tasks.map(task => [
    escapeCSV(task.id),
    escapeCSV(task.nome),
    escapeCSV(task.status),
    escapeCSV(task.prioridade),
    escapeCSV(task.categoria),
    escapeCSV(task.responsavel),
    escapeCSV(task.dimensao),
    escapeCSV(task.inicio ? new Date(task.inicio).toLocaleString() : ''),
    escapeCSV(task.prazo ? new Date(task.prazo).toLocaleString() : ''),
    escapeCSV(task.concluida_em ? new Date(task.concluida_em).toLocaleString() : ''),
    escapeCSV(task.frequencia),
    escapeCSV(task.descricao),
    escapeCSV(task.created_at ? new Date(task.created_at).toLocaleString() : '')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseTasksFromCSV(file: File): Promise<Partial<Task>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return resolve([]);
      
      const rows = parseCSVString(text);
      if (rows.length < 2) return resolve([]);

      const headers = rows[0].map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const tasks: Partial<Task>[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && row[0].trim() === '') continue;
        
        const task: Partial<Task> = {
          id: crypto.randomUUID(),
          is_personal: true,
          status: 'não iniciada',
        };

        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          const val = row[j]?.trim();
          if (val) {
            // Map header to property
            if (header === 'nome') task.nome = val;
            if (header === 'status') task.status = val;
            if (header === 'prioridade') task.prioridade = val;
            if (header === 'categoria') task.categoria = val;
            if (header === 'responsavel') task.responsavel = val;
            if (header === 'dimensao') task.dimensao = val;
            if (header === 'frequencia') task.frequencia = val;
            if (header === 'descricao') task.descricao = val;
            // Ignore dates for simplicity, or could try parsing if needed
          }
        }
        
        if (!task.nome) task.nome = 'Tarefa importada';
        tasks.push(task);
      }
      resolve(tasks);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo CSV.'));
    reader.readAsText(file);
  });
}

function parseCSVString(text: string): string[][] {
  const result: string[][] = [];
  let currentLine: string[] = [];
  let currentVal = '';
  let inQuotes = false;
  // Remove BOM if present
  let processedText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < processedText.length; i++) {
    const char = processedText[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < processedText.length && processedText[i + 1] === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        currentLine.push(currentVal);
        result.push(currentLine);
        currentLine = [];
        currentVal = '';
        if (char === '\r' && i + 1 < processedText.length && processedText[i + 1] === '\n') {
          i++;
        }
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentVal !== '' || currentLine.length > 0) {
    currentLine.push(currentVal);
    result.push(currentLine);
  }
  
  return result;
}

export function downloadEventsCSV(events: AgendaEvent[], filename: string = 'eventos.csv') {
  const headers = [
    'ID', 'Nome', 'Descrição', 'Data Início', 'Data Fim',
    'Frequência', 'Dimensão', 'Criado Em'
  ];

  const rows = events.map(event => [
    escapeCSV(event.id),
    escapeCSV(event.nome),
    escapeCSV(event.descricao),
    escapeCSV(event.data_inicio),
    escapeCSV(event.data_fim),
    escapeCSV(event.frequencia),
    escapeCSV(event.dimensao),
    escapeCSV(event.created_at ? new Date(event.created_at).toLocaleString() : '')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseEventsFromCSV(file: File): Promise<Partial<AgendaEvent>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return resolve([]);
      
      const rows = parseCSVString(text);
      if (rows.length < 2) return resolve([]);

      const headers = rows[0].map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const events: Partial<AgendaEvent>[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && row[0].trim() === '') continue;
        
        const event: Partial<AgendaEvent> = {
          id: crypto.randomUUID(),
          is_labdiv: false,
        };

        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          const val = row[j]?.trim();
          if (val) {
            // Map header to property
            if (header === 'nome') event.nome = val;
            if (header === 'descricao') event.descricao = val;
            if (header === 'data inicio') event.data_inicio = val;
            if (header === 'data fim') event.data_fim = val;
            if (header === 'frequencia') event.frequencia = val;
            if (header === 'dimensao') event.dimensao = val;
          }
        }
        
        if (!event.nome) event.nome = 'Evento importado';
        events.push(event);
      }
      resolve(events);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo CSV.'));
    reader.readAsText(file);
  });
}
