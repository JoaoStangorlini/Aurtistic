-- Este programa é um software livre (Licença AGPLv3)
-- Fase 1: múltiplas equipes por tarefa/subtarefa + delegação de subtarefas + RLS organizacional
BEGIN;

-- 1. Suporte a múltiplas Equipes responsáveis na tarefa e subtarefa
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_subteam_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill: tarefas que já tinham subteam_id passam a tê-lo em assigned_subteam_ids
UPDATE public.tasks
SET assigned_subteam_ids = ARRAY[subteam_id]
WHERE subteam_id IS NOT NULL
  AND COALESCE(array_length(assigned_subteam_ids, 1), 0) = 0;

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_subteams_gin ON public.tasks USING GIN (assigned_subteam_ids);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_members_gin ON public.tasks USING GIN (assigned_member_ids);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_order ON public.tasks (parent_id, ordem_manual, created_at) WHERE parent_id IS NOT NULL;

-- 3. Remove o trigger legado (ordem alfabética conflitava) e unifica a resolução em uma única função
DROP TRIGGER IF EXISTS trg_inherit_task_subteam ON public.tasks;
DROP FUNCTION IF EXISTS public.inherit_task_subteam_from_member();
DROP TRIGGER IF EXISTS trg_sync_task_subteams_array ON public.tasks;
DROP FUNCTION IF EXISTS public.sync_task_subteams_array();
DROP TRIGGER IF EXISTS trg_01_resolve_and_sync_task_subteams ON public.tasks;

CREATE OR REPLACE FUNCTION public.resolve_and_sync_task_subteams()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_subteam UUID;
BEGIN
  IF NEW.assigned_subteam_ids IS NULL THEN
    NEW.assigned_subteam_ids := '{}'::uuid[];
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Caso 1: array preenchido -> subteam_id = 1º item
    IF COALESCE(array_length(NEW.assigned_subteam_ids, 1), 0) > 0 THEN
      NEW.subteam_id := NEW.assigned_subteam_ids[1];

    -- Caso 2: legado enviou apenas subteam_id
    ELSIF NEW.subteam_id IS NOT NULL THEN
      NEW.assigned_subteam_ids := ARRAY[NEW.subteam_id];

    -- Caso 3: tarefa organizacional raiz sem equipe e sem indivíduos -> herda equipe do autor
    ELSIF NEW.organization_id IS NOT NULL
      AND NEW.parent_id IS NULL
      AND COALESCE(array_length(NEW.assigned_member_ids, 1), 0) = 0 THEN
      SELECT subteam_id INTO v_member_subteam
      FROM public.organization_members
      WHERE organization_id = NEW.organization_id
        AND user_id = auth.uid()
      LIMIT 1;

      IF v_member_subteam IS NOT NULL THEN
        NEW.subteam_id := v_member_subteam;
        NEW.assigned_subteam_ids := ARRAY[v_member_subteam];
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- assigned_subteam_ids é a fonte da verdade (inclusive quando esvaziado)
    IF NEW.assigned_subteam_ids IS DISTINCT FROM OLD.assigned_subteam_ids THEN
      IF COALESCE(array_length(NEW.assigned_subteam_ids, 1), 0) > 0 THEN
        NEW.subteam_id := NEW.assigned_subteam_ids[1];
      ELSE
        NEW.subteam_id := NULL;
      END IF;

    -- Alteração apenas de subteam_id por código legado: preserva as demais equipes
    ELSIF NEW.subteam_id IS DISTINCT FROM OLD.subteam_id THEN
      IF NEW.subteam_id IS NOT NULL THEN
        NEW.assigned_subteam_ids := array_prepend(
          NEW.subteam_id,
          array_remove(COALESCE(OLD.assigned_subteam_ids, '{}'::uuid[]), NEW.subteam_id)
        );
      ELSE
        NEW.assigned_subteam_ids := '{}'::uuid[];
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_01_resolve_and_sync_task_subteams
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_and_sync_task_subteams();

-- 4. Políticas RLS explícitas para tarefas e subtarefas organizacionais
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can select org tasks and subtasks" ON public.tasks;
CREATE POLICY "Org members can select org tasks and subtasks"
  ON public.tasks FOR SELECT
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org members can insert org tasks and subtasks" ON public.tasks;
CREATE POLICY "Org members can insert org tasks and subtasks"
  ON public.tasks FOR INSERT
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org members can update org tasks and subtasks" ON public.tasks;
CREATE POLICY "Org members can update org tasks and subtasks"
  ON public.tasks FOR UPDATE
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org members can delete org tasks and subtasks" ON public.tasks;
CREATE POLICY "Org members can delete org tasks and subtasks"
  ON public.tasks FOR DELETE
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

COMMIT;

