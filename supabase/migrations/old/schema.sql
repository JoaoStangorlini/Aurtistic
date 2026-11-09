-- Este programa é um software livre (Licença AGPLv3)
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE task_status AS ENUM ('BACKLOG', 'IN_PROGRESS', 'COMPLETED', 'DISCARDED');
CREATE TYPE task_dimension AS ENUM ('HUB_LABDIV', 'USP', 'PESSOAL');

-- Tabela de Tarefas
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  status task_status DEFAULT 'BACKLOG',
  priority text, -- 'Baixa', 'Média', 'Alta'
  category text, 
  assignee text,
  due_date timestamptz,
  dimension task_dimension NOT NULL,
  user_id uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now()
);

-- Tabela do Calendário (When to Meet)
CREATE TABLE time_slots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_available boolean DEFAULT true,
  user_id uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now()
);

-- RLS (Row Level Security)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas próprias tarefas"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias tarefas"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias tarefas"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias tarefas"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- O mesmo para time_slots
CREATE POLICY "Usuários podem ver seus próprios slots"
  ON time_slots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir seus próprios slots"
  ON time_slots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios slots"
  ON time_slots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios slots"
  ON time_slots FOR DELETE
  USING (auth.uid() = user_id);
