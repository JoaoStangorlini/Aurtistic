-- Este programa é um software livre (Licença AGPLv3)
-- ============================================================================
-- MIGRATION 16: Metas de Organização, Demandas Operacionais e Cascata de Deleção
-- ============================================================================

-- 1. Tabela de Metas Compartilhadas da Organização
CREATE TABLE IF NOT EXISTS public.organization_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_organization_goals_org
  ON public.organization_goals(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_goals_subteam
  ON public.organization_goals(subteam_id);

-- 2. Coluna goal_id em tasks para vínculo relacional 1:N com metas
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.organization_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_goal_id
  ON public.tasks(goal_id);

-- 3. Tabela de Demandas e Solicitações Internas de Organização
CREATE TABLE IF NOT EXISTS public.organization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  subteam_id UUID REFERENCES public.organization_subteams(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_organization_requests_org
  ON public.organization_requests(organization_id);

-- 4. RLS para organization_goals e organization_requests
ALTER TABLE public.organization_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_requests ENABLE ROW LEVEL SECURITY;

-- Goals: Membros da organização podem ler e gerenciar metas da mesma org
DROP POLICY IF EXISTS "Membros leem metas da organização" ON public.organization_goals;
CREATE POLICY "Membros leem metas da organização" ON public.organization_goals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_goals.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Membros gerenciam metas da organização" ON public.organization_goals;
CREATE POLICY "Membros gerenciam metas da organização" ON public.organization_goals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_goals.organization_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_goals.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Requests: Membros da organização podem ler e criar demandas
DROP POLICY IF EXISTS "Membros leem demandas da organização" ON public.organization_requests;
CREATE POLICY "Membros leem demandas da organização" ON public.organization_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_requests.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Membros gerenciam demandas da organização" ON public.organization_requests;
CREATE POLICY "Membros gerenciam demandas da organização" ON public.organization_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_requests.organization_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_requests.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- 5. Política de exclusão de perfil sem deixar orfãos
-- Quando o usuário exclui sua conta (deleteAurtisticProfile), garante que seus dados de perfil podem ser limpos
DROP POLICY IF EXISTS "Usuários podem excluir seu próprio perfil" ON public.user_profiles;
CREATE POLICY "Usuários podem excluir seu próprio perfil" ON public.user_profiles
  FOR DELETE
  USING (auth.uid() = id);
