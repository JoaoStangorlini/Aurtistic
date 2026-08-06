-- Este programa é um software livre (Licença AGPLv3)

-- Tabela de Eventos (Agenda)
CREATE TABLE IF NOT EXISTS public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  data_inicio date,
  data_fim date,
  horarios_semanais jsonb, -- { "Segunda": { "inicio": "19:00", "fim": "21:00" } }
  frequencia text,
  dimensao text,
  is_labdiv boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
CREATE POLICY "Usuários podem gerenciar seus próprios eventos" ON public.events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
