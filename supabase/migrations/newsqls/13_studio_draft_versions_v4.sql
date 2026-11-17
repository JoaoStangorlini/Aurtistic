-- Migration: 13_studio_draft_versions_v4.sql
-- Tabela para persistência dos 3 Slots de Rascunho do Studio por Usuário e Organização

CREATE TABLE IF NOT EXISTS public.studio_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  slot_index INT NOT NULL CHECK (slot_index BETWEEN 1 AND 3),
  title TEXT NOT NULL DEFAULT 'Rascunho',
  aspect_ratio TEXT NOT NULL DEFAULT '1:1',
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_draft_slot UNIQUE (user_id, org_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_studio_draft_user_org
  ON public.studio_draft_versions (user_id, org_id, slot_index);

ALTER TABLE public.studio_draft_versions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Usuários gerenciam seus próprios rascunhos de studio" ON public.studio_draft_versions;
CREATE POLICY "Usuários gerenciam seus próprios rascunhos de studio"
  ON public.studio_draft_versions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
