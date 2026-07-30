-- Tags de operação por vínculo atendente ↔ canal.
--
-- A tag pertence ao vínculo em `colaboradores_setores`, permitindo que
-- Suporte Chat e Pit Stop coexistam no mesmo canal. Esta migration substitui
-- as versões não publicadas 20260730_tags_setor.sql e
-- 20260730b_tag_setor_no_atendente.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.tags_setor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#6B7280',
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  setor_id uuid REFERENCES public.setores(id) ON DELETE CASCADE
);

-- Mantém a migration resiliente caso uma versão de rascunho tenha sido rodada
-- manualmente antes de esta branch ser publicada.
ALTER TABLE public.tags_setor
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id) ON DELETE CASCADE;

UPDATE public.tags_setor AS tag
SET setor_id = setor.id
FROM public.setores AS setor
WHERE tag.setor_id IS NULL
  AND (
    (lower(tag.nome) = 'suporte chat' AND setor.nome = 'ServiceDesk Matriz Chat')
    OR (lower(tag.nome) = 'pit stop' AND setor.nome = 'PIT STOP')
  );

DELETE FROM public.tags_setor WHERE setor_id IS NULL;
ALTER TABLE public.tags_setor ALTER COLUMN setor_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tags_setor_setor_id
  ON public.tags_setor (setor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_setor_nome_por_canal
  ON public.tags_setor (setor_id, lower(nome));

ALTER TABLE public.colaboradores_setores
  ADD COLUMN IF NOT EXISTS tag_setor_id uuid REFERENCES public.tags_setor(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_colab_setores_tag_setor_id
  ON public.colaboradores_setores (tag_setor_id);

-- O mesmo critério usado na interface também é aplicado no banco. Dessa
-- forma, trocar a chamada no navegador ou chamar o PostgREST diretamente não
-- permite transformar um atendente em outra operação.
CREATE OR REPLACE FUNCTION public.can_manage_tags_setor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores AS colaborador
    LEFT JOIN public.permissoes AS permissao ON permissao.id = colaborador.permissao_id
    WHERE colaborador.id = auth.uid()
      AND colaborador.ativo IS TRUE
      AND (
        colaborador.is_master IS TRUE
        OR COALESCE(permissao.can_view_dashboard, false) IS TRUE
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_tags_setor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_tags_setor() TO authenticated;

ALTER TABLE public.tags_setor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler tags_setor" ON public.tags_setor;
DROP POLICY IF EXISTS "Autenticados podem gerenciar tags_setor" ON public.tags_setor;
DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.tags_setor;
DROP POLICY IF EXISTS "tags_setor_select_scoped" ON public.tags_setor;
DROP POLICY IF EXISTS "tags_setor_insert_manager" ON public.tags_setor;
DROP POLICY IF EXISTS "tags_setor_update_manager" ON public.tags_setor;
DROP POLICY IF EXISTS "tags_setor_delete_manager" ON public.tags_setor;

-- Leitura: gestor administrador vê todos os catálogos; atendente só enxerga
-- as tags dos canais a que está vinculado. Escrita nunca usa uma policy ampla.
CREATE POLICY "tags_setor_select_scoped"
  ON public.tags_setor
  FOR SELECT TO authenticated
  USING (
    public.can_manage_tags_setor()
    OR EXISTS (
      SELECT 1
      FROM public.colaboradores_setores AS vinculo
      WHERE vinculo.colaborador_id = auth.uid()
        AND vinculo.setor_id = tags_setor.setor_id
    )
  );

CREATE POLICY "tags_setor_insert_manager"
  ON public.tags_setor
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_tags_setor());

CREATE POLICY "tags_setor_update_manager"
  ON public.tags_setor
  FOR UPDATE TO authenticated
  USING (public.can_manage_tags_setor())
  WITH CHECK (public.can_manage_tags_setor());

CREATE POLICY "tags_setor_delete_manager"
  ON public.tags_setor
  FOR DELETE TO authenticated
  USING (public.can_manage_tags_setor());

-- `colaboradores_setores` tem uma policy legada ampla porque seus demais
-- vínculos ainda são administrados diretamente pelo painel. O trigger fecha
-- especificamente a coluna nova, inclusive para chamadas diretas ao PostgREST,
-- sem abrir permissão adicional para inserir/remover vínculos de canal.
CREATE OR REPLACE FUNCTION public.validate_colaborador_setor_tag_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tag_setor_id IS NOT DISTINCT FROM OLD.tag_setor_id THEN
    RETURN NEW;
  END IF;

  IF NEW.tag_setor_id IS NOT NULL OR TG_OP = 'UPDATE' THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.can_manage_tags_setor() THEN
      RAISE EXCEPTION 'Sem permissão para alterar a tag de operação';
    END IF;
  END IF;

  IF NEW.tag_setor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tags_setor AS tag
       WHERE tag.id = NEW.tag_setor_id
         AND tag.setor_id = NEW.setor_id
     ) THEN
    RAISE EXCEPTION 'A tag de operação deve pertencer ao mesmo canal do atendente';
  END IF;

  RETURN NEW;
END;
$$;

-- Cadastro inicial e backfill apenas onde a operação já é inequívoca.
INSERT INTO public.tags_setor (nome, cor, ordem, setor_id)
SELECT 'Suporte Chat', '#3B82F6', 1, setor.id
FROM public.setores AS setor
WHERE setor.nome = 'ServiceDesk Matriz Chat'
ON CONFLICT DO NOTHING;

INSERT INTO public.tags_setor (nome, cor, ordem, setor_id)
SELECT 'Pit Stop', '#8B5CF6', 2, setor.id
FROM public.setores AS setor
WHERE setor.nome = 'PIT STOP'
ON CONFLICT DO NOTHING;

UPDATE public.colaboradores_setores AS vinculo
SET tag_setor_id = tag.id
FROM public.setores AS setor
JOIN public.tags_setor AS tag
  ON tag.setor_id = setor.id
WHERE vinculo.setor_id = setor.id
  AND vinculo.tag_setor_id IS NULL
  AND (
    (setor.nome = 'ServiceDesk Matriz Chat' AND lower(tag.nome) = 'suporte chat')
    OR (setor.nome = 'PIT STOP' AND lower(tag.nome) = 'pit stop')
  );

DROP TRIGGER IF EXISTS validate_colaborador_setor_tag_setor ON public.colaboradores_setores;
CREATE TRIGGER validate_colaborador_setor_tag_setor
  BEFORE INSERT OR UPDATE OF tag_setor_id ON public.colaboradores_setores
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_colaborador_setor_tag_setor();

CREATE OR REPLACE VIEW public.vw_nps_colaborador_tag_setor AS
SELECT
  avaliacao.colaborador_id,
  vinculo.tag_setor_id,
  count(*)::bigint AS total,
  sum(avaliacao.nota)::bigint AS soma_notas
FROM public.avaliacoes AS avaliacao
LEFT JOIN public.tickets AS ticket ON ticket.id = avaliacao.ticket_id
LEFT JOIN public.colaboradores_setores AS vinculo
  ON vinculo.colaborador_id = avaliacao.colaborador_id
  AND vinculo.setor_id = ticket.setor_id
WHERE avaliacao.colaborador_id IS NOT NULL
  AND avaliacao.nota IS NOT NULL
GROUP BY avaliacao.colaborador_id, vinculo.tag_setor_id;

ALTER VIEW public.vw_nps_colaborador_tag_setor SET (security_invoker = true);
GRANT SELECT ON public.vw_nps_colaborador_tag_setor TO authenticated;

-- A versão de rascunho chegou a criar esta coluna no canal. A fonte de verdade
-- final é o vínculo atendente ↔ canal; manter as duas permitiria divergência.
DROP INDEX IF EXISTS public.idx_setores_tag_setor_id;
ALTER TABLE public.setores DROP COLUMN IF EXISTS tag_setor_id;

COMMIT;
