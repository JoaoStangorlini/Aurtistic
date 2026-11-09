-- Este programa é um software livre (Licença AGPLv3)
-- 3_quick_filters.sql
-- Adiciona a coluna quick_filters na tabela user_profiles para salvar as preferências do usuário
-- sobre quais colunas aparecem na barra horizontal de Filtros Rápidos.

-- O array padrão conterá as chaves nativas que já existiam na UI anterior,
-- garantindo retrocompatibilidade (Responsáveis e Dimensões).
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS quick_filters JSONB DEFAULT '["responsavel", "dimensao"]'::jsonb;
