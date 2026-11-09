-- Este programa é um software livre (Licença AGPLv3)
-- ARQUIVO: supabase/migrations/newsqls/07_update_labdiv_name.sql
-- DESCRIÇÃO: Atualização do Nome do LabDiv na Tabela public.organizations

UPDATE public.organizations 
SET name = 'LabDiv', 
    description = 'Laboratório de Divulgação Científica (LabDiv - IFUSP)' 
WHERE slug = 'labdiv';

