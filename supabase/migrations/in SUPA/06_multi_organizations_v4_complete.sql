-- Este programa é um software livre (Licença AGPLv3)
-- ARQUIVO: supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql
-- MIGRATION: Multi-Organizações v4.0, Equipes, Cofre Institucional, Reuniões e Ata Inteligente

BEGIN;

-- ============================================================================
-- 1. TABELAS CENTRAIS DE ORGANIZAÇÕES E EQUIPES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  primary_color TEXT DEFAULT '#9D4EDD',
  secondary_color TEXT DEFAULT '#FFCC00',
  storage_quota_bytes BIGINT NOT NULL DEFAULT 53687091200, -- 50 GB
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  storage_boost_bytes BIGINT,
  storage_boost_until TIMESTAMPTZ,
  storage_policy TEXT NOT NULL DEFAULT 'admin_or_permitted' CHECK (storage_policy IN ('admin_or_permitted', 'open_to_members')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.organization_subteams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#9D4EDD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  org_role TEXT NOT NULL DEFAULT 'member' CHECK (org_role IN ('admin', 'member', 'guest')),
  subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  can_upload_org_vault BOOLEAN NOT NULL DEFAULT false,
  cognitive_capacity TEXT NOT NULL DEFAULT 'normal' CHECK (cognitive_capacity IN ('normal', 'reduced', 'depleted')),
  capacity_note TEXT,
  capacity_until TIMESTAMPTZ,
  is_placeholder BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.organization_members(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_subteam ON public.organization_members(subteam_id);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  target_name TEXT,
  assigned_role TEXT NOT NULL DEFAULT 'member' CHECK (assigned_role IN ('admin', 'member', 'guest')),
  assigned_subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  placeholder_member_id UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.organization_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  checklist_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 2. TABELAS DE REUNIÕES, ATAS, DISPONIBILIDADE E REVISÕES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organization_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 60,
  meet_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'canceled')),
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'under_review', 'published')),
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  live_notes_markdown TEXT NOT NULL DEFAULT '',
  process_notes_markdown TEXT NOT NULL DEFAULT '',
  published_ata_markdown TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  transcription_raw_text TEXT NOT NULL DEFAULT '',
  transcription_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_org_meetings_org_scheduled ON public.organization_meetings(organization_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.organization_meeting_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.organization_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(meeting_id, user_id, slot_start)
);

CREATE TABLE IF NOT EXISTS public.organization_meeting_personal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.organization_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes_markdown TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_meeting_process_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.organization_meetings(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_markdown TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(meeting_id, author_user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_meeting_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.organization_meetings(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  feedback_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 3. EXPANSÃO DE TABELAS EXISTENTES (TASKS, EVENTS, USER_FILES_INDEX, SHARE_LINKS)
-- ============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_member_ids UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_subteam ON public.tasks(subteam_id);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_org ON public.events(organization_id);

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_share_links_org ON public.share_links(organization_id);

-- [CORREÇÃO OBRIGATÓRIA 1]: Adiciona vault_scope_key gerada e constraint UNIQUE de tabela real
-- para compatibilidade absoluta com .upsert(..., { onConflict: 'vault_scope_key,relative_path' }) do PostgREST
ALTER TABLE public.user_files_index
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.user_files_index
  ADD COLUMN IF NOT EXISTS vault_scope_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN organization_id IS NOT NULL THEN 'org:' || organization_id::text
      ELSE 'usr:' || user_id::text
    END
  ) STORED;

ALTER TABLE public.user_files_index
  DROP CONSTRAINT IF EXISTS user_files_index_user_id_relative_path_key;

ALTER TABLE public.user_files_index
  DROP CONSTRAINT IF EXISTS uq_user_files_scope_path;

ALTER TABLE public.user_files_index
  ADD CONSTRAINT uq_user_files_scope_path UNIQUE (vault_scope_key, relative_path);

CREATE INDEX IF NOT EXISTS idx_user_files_org ON public.user_files_index(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_files_scope_key ON public.user_files_index(vault_scope_key);

-- ============================================================================
-- 4. FUNÇÕES DE SEGURANÇA E AUXILIARES (SECURITY DEFINER COM search_path = public)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND org_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_org_vault(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND (org_role = 'admin' OR can_upload_org_vault = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.update_my_member_capacity(
  p_org_id UUID,
  p_capacity TEXT,
  p_note TEXT DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.organization_members%ROWTYPE;
BEGIN
  IF p_capacity NOT IN ('normal', 'reduced', 'depleted') THEN
    RAISE EXCEPTION 'Capacidade cognitiva inválida: %', p_capacity;
  END IF;

  UPDATE public.organization_members
  SET cognitive_capacity = p_capacity,
      capacity_note = p_note,
      capacity_until = p_until,
      updated_at = timezone('utc'::text, now())
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado ou usuário não pertence à organização.';
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_org_vault_used_bytes(p_org_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COALESCE(SUM(size_bytes), 0)
  INTO v_total
  FROM public.user_files_index
  WHERE organization_id = p_org_id;

  UPDATE public.organizations
  SET storage_used_bytes = v_total,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_org_id;

  RETURN v_total;
END;
$$;

-- Herança automática de subequipe para tarefas criadas por membros
CREATE OR REPLACE FUNCTION public.inherit_task_subteam_from_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subteam UUID;
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.subteam_id IS NULL THEN
    SELECT subteam_id INTO v_subteam
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id
      AND user_id = auth.uid()
    LIMIT 1;

    IF v_subteam IS NOT NULL THEN
      NEW.subteam_id := v_subteam;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_task_subteam ON public.tasks;
CREATE TRIGGER trg_inherit_task_subteam
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_task_subteam_from_member();

-- [CORREÇÃO OBRIGATÓRIA 6]: Trigger de proteção de publicação da ata
CREATE OR REPLACE FUNCTION public.protect_meeting_review_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.review_status = 'published' AND OLD.review_status <> 'published' THEN
    -- Verifica se o publicador é Admin da Org ou o Revisor designado
    IF NOT (
      public.is_org_admin(NEW.organization_id)
      OR (NEW.reviewer_user_id IS NOT NULL AND NEW.reviewer_user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Apenas o revisor designado ou um administrador da organização podem publicar a ata.';
    END IF;

    -- Garante que exista uma aprovação formal na tabela organization_meeting_reviews
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_meeting_reviews
      WHERE meeting_id = NEW.id
        AND decision = 'approved'
    ) AND NOT public.is_org_admin(NEW.organization_id) THEN
      RAISE EXCEPTION 'A ata não pode ser publicada sem aprovação formal na revisão.';
    END IF;

    IF NEW.published_at IS NULL THEN
      NEW.published_at := timezone('utc'::text, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_meeting_review_publication ON public.organization_meetings;
CREATE TRIGGER trg_protect_meeting_review_publication
  BEFORE UPDATE ON public.organization_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_meeting_review_publication();

-- ============================================================================
-- 5. POLÍTICAS RLS COMPLETAS E ISOLAMENTO ABSOLUTO (CORREÇÃO OBRIGATÓRIA 3)
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subteams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_meeting_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_meeting_personal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_meeting_process_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_meeting_reviews ENABLE ROW LEVEL SECURITY;

-- 5.1. organizations
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(id)
    OR auth.uid() = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid
  );

DROP POLICY IF EXISTS "organizations_admin_modify" ON public.organizations;
CREATE POLICY "organizations_admin_modify" ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

-- 5.2. organization_subteams
DROP POLICY IF EXISTS "subteams_member_select" ON public.organization_subteams;
CREATE POLICY "subteams_member_select" ON public.organization_subteams
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "subteams_admin_modify" ON public.organization_subteams;
CREATE POLICY "subteams_admin_modify" ON public.organization_subteams
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 5.3. organization_members
DROP POLICY IF EXISTS "members_member_select" ON public.organization_members;
CREATE POLICY "members_member_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "members_admin_modify" ON public.organization_members;
CREATE POLICY "members_admin_modify" ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "members_self_capacity_update" ON public.organization_members;
CREATE POLICY "members_self_capacity_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.4. organization_invites
DROP POLICY IF EXISTS "invites_admin_all" ON public.organization_invites;
CREATE POLICY "invites_admin_all" ON public.organization_invites
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 5.5. organization_task_templates
DROP POLICY IF EXISTS "task_templates_member_select" ON public.organization_task_templates;
CREATE POLICY "task_templates_member_select" ON public.organization_task_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "task_templates_member_insert" ON public.organization_task_templates;
CREATE POLICY "task_templates_member_insert" ON public.organization_task_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "task_templates_admin_modify" ON public.organization_task_templates;
CREATE POLICY "task_templates_admin_modify" ON public.organization_task_templates
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "task_templates_admin_delete" ON public.organization_task_templates;
CREATE POLICY "task_templates_admin_delete" ON public.organization_task_templates
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- 5.6. organization_meetings
DROP POLICY IF EXISTS "meetings_member_select" ON public.organization_meetings;
CREATE POLICY "meetings_member_select" ON public.organization_meetings
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "meetings_member_write" ON public.organization_meetings;
CREATE POLICY "meetings_member_write" ON public.organization_meetings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "meetings_member_update" ON public.organization_meetings;
CREATE POLICY "meetings_member_update" ON public.organization_meetings
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "meetings_admin_delete" ON public.organization_meetings;
CREATE POLICY "meetings_admin_delete" ON public.organization_meetings
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- 5.7. organization_meeting_availability
DROP POLICY IF EXISTS "meeting_avail_select" ON public.organization_meeting_availability;
CREATE POLICY "meeting_avail_select" ON public.organization_meeting_availability
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_meetings m
      WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)
    )
  );

DROP POLICY IF EXISTS "meeting_avail_user_modify" ON public.organization_meeting_availability;
CREATE POLICY "meeting_avail_user_modify" ON public.organization_meeting_availability
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.8. organization_meeting_personal_notes (ISOLAMENTO ABSOLUTO POR USUÁRIO)
DROP POLICY IF EXISTS "meeting_personal_notes_all" ON public.organization_meeting_personal_notes;
CREATE POLICY "meeting_personal_notes_all" ON public.organization_meeting_personal_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.9. organization_meeting_process_notes
DROP POLICY IF EXISTS "meeting_process_notes_select" ON public.organization_meeting_process_notes;
CREATE POLICY "meeting_process_notes_select" ON public.organization_meeting_process_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_meetings m
      WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)
    )
  );

DROP POLICY IF EXISTS "meeting_process_notes_author_write" ON public.organization_meeting_process_notes;
CREATE POLICY "meeting_process_notes_author_write" ON public.organization_meeting_process_notes
  FOR ALL TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

-- 5.10. organization_meeting_reviews
DROP POLICY IF EXISTS "meeting_reviews_select" ON public.organization_meeting_reviews;
CREATE POLICY "meeting_reviews_select" ON public.organization_meeting_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_meetings m
      WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)
    )
  );

DROP POLICY IF EXISTS "meeting_reviews_insert" ON public.organization_meeting_reviews;
CREATE POLICY "meeting_reviews_insert" ON public.organization_meeting_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_meetings m
      WHERE m.id = meeting_id AND (
        public.is_org_admin(m.organization_id)
        OR m.reviewer_user_id = auth.uid()
      )
    )
  );

-- 5.11. tasks (RLS de Isolamento entre Pessoal e Org)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_unified_access" ON public.tasks;
CREATE POLICY "tasks_unified_access" ON public.tasks
  FOR ALL TO authenticated
  USING (
    (organization_id IS NULL AND user_id = auth.uid())
    OR
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  )
  WITH CHECK (
    (organization_id IS NULL AND user_id = auth.uid())
    OR
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  );

-- 5.12. user_files_index (RLS de Isolamento entre Cofre Pessoal e Org Vault)
ALTER TABLE public.user_files_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_files_personal_all" ON public.user_files_index;
DROP POLICY IF EXISTS "user_files_org_select" ON public.user_files_index;
DROP POLICY IF EXISTS "user_files_org_write" ON public.user_files_index;

CREATE POLICY "user_files_personal_all" ON public.user_files_index
  FOR ALL TO authenticated
  USING (organization_id IS NULL AND user_id = auth.uid())
  WITH CHECK (organization_id IS NULL AND user_id = auth.uid());

CREATE POLICY "user_files_org_select" ON public.user_files_index
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE POLICY "user_files_org_write" ON public.user_files_index
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.can_write_org_vault(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.can_write_org_vault(organization_id));

-- 5.13. share_links
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "share_links_access" ON public.share_links;
CREATE POLICY "share_links_access" ON public.share_links
  FOR ALL TO authenticated
  USING (
    (organization_id IS NULL AND user_id = auth.uid())
    OR
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  )
  WITH CHECK (
    (organization_id IS NULL AND user_id = auth.uid())
    OR
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  );

-- ============================================================================
-- 6. RPCS PARA GESTÃO DE CONVITES E ASSOCIAÇÃO DE MEMBROS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_organization_invite_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_org RECORD;
  v_placeholders JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > timezone('utc'::text, now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Convite inexistente, expirado ou já utilizado.');
  END IF;

  SELECT id, name, slug, avatar_url, description INTO v_org
  FROM public.organizations
  WHERE id = v_invite.organization_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'full_name', m.full_name,
        'email', m.email,
        'subteam_id', m.subteam_id
      )
    ),
    '[]'::jsonb
  ) INTO v_placeholders
  FROM public.organization_members m
  WHERE m.organization_id = v_invite.organization_id
    AND m.is_placeholder = true
    AND m.user_id IS NULL;

  RETURN jsonb_build_object(
    'valid', true,
    'organization', to_jsonb(v_org),
    'target_email', v_invite.target_email,
    'target_name', v_invite.target_name,
    'assigned_role', v_invite.assigned_role,
    'assigned_subteam_id', v_invite.assigned_subteam_id,
    'placeholder_member_id', v_invite.placeholder_member_id,
    'available_placeholders', v_placeholders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invite(
  p_token TEXT,
  p_claim_placeholder_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite RECORD;
  v_member RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
  v_target_placeholder UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para aceitar convite.';
  END IF;

  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > timezone('utc'::text, now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido ou expirado.';
  END IF;

  SELECT email, raw_user_meta_data->>'full_name'
  INTO v_user_email, v_user_name
  FROM auth.users
  WHERE id = v_user_id;

  v_target_placeholder := COALESCE(p_claim_placeholder_id, v_invite.placeholder_member_id);

  IF v_target_placeholder IS NOT NULL THEN
    UPDATE public.organization_members
    SET user_id = v_user_id,
        full_name = COALESCE(v_user_name, full_name),
        email = COALESCE(v_user_email, email),
        is_placeholder = false,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_target_placeholder
      AND organization_id = v_invite.organization_id
      AND (user_id IS NULL OR user_id = v_user_id)
    RETURNING * INTO v_member;
  END IF;

  IF v_member.id IS NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      full_name,
      email,
      org_role,
      subteam_id,
      is_placeholder
    ) VALUES (
      v_invite.organization_id,
      v_user_id,
      COALESCE(v_user_name, v_invite.target_name, 'Novo Membro'),
      COALESCE(v_user_email, v_invite.target_email),
      v_invite.assigned_role,
      v_invite.assigned_subteam_id,
      false
    )
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET
      org_role = EXCLUDED.org_role,
      subteam_id = COALESCE(organization_members.subteam_id, EXCLUDED.subteam_id),
      updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_member;
  END IF;

  UPDATE public.organization_invites
  SET accepted_at = timezone('utc'::text, now()),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_invite.organization_id,
    'member_id', v_member.id,
    'org_role', v_member.org_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_new_organization(
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_user_email TEXT;
  v_clean_name TEXT := btrim(COALESCE(p_name, ''));
  v_clean_slug TEXT := btrim(COALESCE(p_slug, ''));
  v_org public.organizations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para criar organização.';
  END IF;

  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Nome da organização é obrigatório.';
  END IF;

  IF v_clean_slug = '' THEN
    v_clean_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  END IF;

  v_clean_slug := trim(both '-' from v_clean_slug);

  INSERT INTO public.organizations (
    name,
    slug,
    description,
    created_by,
    vault_quota_bytes
  ) VALUES (
    v_clean_name,
    v_clean_slug,
    p_description,
    v_user_id,
    26843545600
  )
  RETURNING * INTO v_org;

  SELECT
    COALESCE(raw_user_meta_data->>'full_name', email),
    email
  INTO v_user_name, v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    full_name,
    email,
    org_role,
    can_upload_org_vault,
    cognitive_capacity
  ) VALUES (
    v_org.id,
    v_user_id,
    COALESCE(v_user_name, 'Admin'),
    v_user_email,
    'admin',
    true,
    'normal'
  );

  INSERT INTO public.organization_subteams (organization_id, name, color)
  VALUES
    (v_org.id, 'Coordenação', '#9D4EDD'),
    (v_org.id, 'Comunicação', '#06B6D4'),
    (v_org.id, 'Pesquisa', '#10B981');

  RETURN to_jsonb(v_org);
END;
$$;

-- ============================================================================
-- 7. SEED INSTITUCIONAL DO LABDIV (Passos 5.1 a 5.6)
-- ============================================================================

DO $$
DECLARE
  v_org_id UUID := '1ab41410-0000-4000-8000-000000000001'::uuid;
  v_subteam_comms UUID := '1ab41410-0000-4000-8000-000000000101'::uuid;
  v_subteam_pesq UUID := '1ab41410-0000-4000-8000-000000000102'::uuid;
  v_subteam_coord UUID := '1ab41410-0000-4000-8000-000000000103'::uuid;
  v_stan_uuid UUID := 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid;
  v_hub_uuid UUID := '7dcfe172-1cf0-4389-9abd-f340b1408386'::uuid;
BEGIN
  -- 7.1. Inserção da Organização LabDiv
  INSERT INTO public.organizations (
    id, slug, name, description, primary_color, secondary_color, storage_quota_bytes, storage_policy
  ) VALUES (
    v_org_id,
    'labdiv',
    'LabDiv',
    'Laboratório de Divulgação Científica (LabDiv - IFUSP)',
    '#9D4EDD',
    '#FFCC00',
    53687091200, -- 50 GB
    'admin_or_permitted'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

  -- 7.2. Subequipes Iniciais
  INSERT INTO public.organization_subteams (id, organization_id, name, description, color)
  VALUES
    (v_subteam_comms, v_org_id, 'Comunicação & Mídias', 'Gestão de redes, vídeos, podcasts e divulgação científica', '#9D4EDD'),
    (v_subteam_pesq, v_org_id, 'Pesquisa & Extensão', 'Projetos científicos, artigos, dados e parcerias acadêmicas', '#049FFF'),
    (v_subteam_coord, v_org_id, 'Administração & Coordenação', 'Governança institucional, finanças e cronogramas gerais', '#FFCC00')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- 7.3. Membros Administradores Fundadores
  -- João Paulo Stangorlini
  INSERT INTO public.organization_members (
    organization_id, user_id, full_name, email, org_role, subteam_id, can_upload_org_vault, is_placeholder
  ) VALUES (
    v_org_id,
    v_stan_uuid,
    'João Paulo Stangorlini',
    'joaopaulostangorlini@usp.br',
    'admin',
    v_subteam_coord,
    true,
    false
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = 'admin',
    can_upload_org_vault = true;

  -- Conta Institucional HUB LabDiv
  INSERT INTO public.organization_members (
    organization_id, user_id, full_name, email, org_role, subteam_id, can_upload_org_vault, is_placeholder
  ) VALUES (
    v_org_id,
    v_hub_uuid,
    'HUB LabDiv Institucional',
    'hublabdiv@gmail.com',
    'admin',
    v_subteam_coord,
    true,
    false
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = 'admin',
    can_upload_org_vault = true;

  -- 7.4. Migração e Vinculação de Tarefas Históricas do LabDiv (dimensao = 'LabDiv' ou user_id = hublabdiv)
  UPDATE public.tasks
  SET organization_id = v_org_id,
      dimensao = 'LabDiv'
  WHERE dimensao ILIKE '%labdiv%'
     OR user_id = v_hub_uuid;

  -- 7.5. Migração de Eventos Históricos do LabDiv
  UPDATE public.events
  SET organization_id = v_org_id
  WHERE dimensao ILIKE '%labdiv%'
     OR user_id = v_hub_uuid;

  -- 7.6. Criação de Placeholders para Nomes Únicos encontrados no campo responsavel das tarefas
  INSERT INTO public.organization_members (organization_id, full_name, org_role, is_placeholder)
  SELECT DISTINCT
    v_org_id,
    trim(name_part),
    'member',
    true
  FROM public.tasks t,
       LATERAL regexp_split_to_table(COALESCE(t.responsavel, ''), '[,/&+]') AS name_part
  WHERE t.organization_id = v_org_id
    AND trim(name_part) <> ''
    AND trim(name_part) NOT ILIKE '%stangorlini%'
    AND trim(name_part) NOT ILIKE '%joão paulo%'
    AND trim(name_part) NOT ILIKE '%hublabdiv%'
  ON CONFLICT DO NOTHING;

END $$;

COMMIT;

