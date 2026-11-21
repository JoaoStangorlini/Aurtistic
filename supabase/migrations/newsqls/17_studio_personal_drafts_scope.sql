-- Este programa é um software livre (Licença AGPLv3)
-- Migration: 17_studio_personal_drafts_scope.sql
-- Suporte completo a Studio Pessoal (org_id nullable + scope_key) e versionamento atômico de rascunhos

BEGIN;

-- 1. Torna org_id nullable e adiciona coluna scope_key
ALTER TABLE public.studio_draft_versions
  ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE public.studio_draft_versions
  ADD COLUMN IF NOT EXISTS scope_key TEXT;

-- 2. Backfill de scope_key para registros existentes
UPDATE public.studio_draft_versions
SET scope_key = CASE
  WHEN org_id IS NOT NULL THEN 'org:' || org_id::text
  ELSE 'personal:' || user_id::text
END
WHERE scope_key IS NULL;

-- 3. Garante NOT NULL em scope_key
ALTER TABLE public.studio_draft_versions
  ALTER COLUMN scope_key SET NOT NULL;

-- 4. Remove constraints e índices antigos que exigiam org_id obrigatório
ALTER TABLE public.studio_draft_versions
  DROP CONSTRAINT IF EXISTS uq_studio_draft_slot;

DROP INDEX IF EXISTS idx_studio_draft_user_org;

-- 5. Adiciona CHECK constraint amarrando scope_key ao org_id ou user_id
ALTER TABLE public.studio_draft_versions
  DROP CONSTRAINT IF EXISTS chk_studio_draft_scope;

ALTER TABLE public.studio_draft_versions
  ADD CONSTRAINT chk_studio_draft_scope
  CHECK (
    (org_id IS NULL AND scope_key = 'personal:' || user_id::text) OR
    (org_id IS NOT NULL AND scope_key = 'org:' || org_id::text)
  );

-- 6. Adiciona constraint UNIQUE e índice por (user_id, scope_key, slot_index)
ALTER TABLE public.studio_draft_versions
  DROP CONSTRAINT IF EXISTS uq_studio_draft_user_scope_slot;

ALTER TABLE public.studio_draft_versions
  ADD CONSTRAINT uq_studio_draft_user_scope_slot
  UNIQUE (user_id, scope_key, slot_index);

CREATE INDEX IF NOT EXISTS idx_studio_draft_user_scope_slot
  ON public.studio_draft_versions (user_id, scope_key, slot_index);

-- 7. Políticas de RLS atualizadas com segregação estrita
ALTER TABLE public.studio_draft_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam seus próprios rascunhos de studio" ON public.studio_draft_versions;
CREATE POLICY "Usuários gerenciam seus próprios rascunhos de studio"
  ON public.studio_draft_versions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Org members can view org drafts" ON public.studio_draft_versions;
CREATE POLICY "Org members can view org drafts"
  ON public.studio_draft_versions
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = studio_draft_versions.org_id
        AND om.user_id = auth.uid()
    )
  );

COMMIT;
