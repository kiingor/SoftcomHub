-- =============================================================
-- Integridade do cache e intervalo de geração do Status do atendimento
--
-- A assinatura protege contra reutilizar uma análise quando o texto efetivo
-- mudou sem trocar o id da mensagem (por exemplo, após transcrever um áudio).
-- A tabela de reservas serializa chamadas concorrentes entre instâncias.
-- Nenhuma policy RLS existente é criada, alterada ou removida aqui.
-- =============================================================

SET lock_timeout = '5s';

ALTER TABLE public.ticket_analises_ia
  ADD COLUMN IF NOT EXISTS assinatura_conteudo text,
  ADD COLUMN IF NOT EXISTS metadados_prompt jsonb,
  ADD COLUMN IF NOT EXISTS versao_prompt text;

-- Linhas anteriores a esta migration ficam com a assinatura nula. A rota as
-- considera cache legado e as regenera, em vez de aceitá-las por acaso.
ALTER TABLE public.ticket_analises_ia
  DROP CONSTRAINT IF EXISTS ticket_analises_ia_assinatura_conteudo_sha256;
ALTER TABLE public.ticket_analises_ia
  ADD CONSTRAINT ticket_analises_ia_assinatura_conteudo_sha256
  CHECK (
    assinatura_conteudo IS NULL
    OR assinatura_conteudo ~ '^[0-9a-f]{64}$'
  );

CREATE TABLE IF NOT EXISTS public.ticket_analises_ia_geracoes (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  ultima_geracao_em timestamptz NOT NULL
);

-- Só o service role pode chamar a RPC. A tabela não recebe policy RLS nova:
-- sua leitura/escrita direta também é removida dos papéis expostos pelo app.
REVOKE ALL ON TABLE public.ticket_analises_ia_geracoes FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reservar_geracao_status_atendimento(
  p_ticket_id uuid,
  p_intervalo_segundos integer DEFAULT 30
)
RETURNS TABLE (
  permitida boolean,
  proxima_geracao_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  agora timestamptz;
  ultima_geracao timestamptz;
  proxima_geracao timestamptz;
BEGIN
  IF p_ticket_id IS NULL THEN
    RAISE EXCEPTION 'ticket_id é obrigatório';
  END IF;
  IF p_intervalo_segundos IS NULL OR p_intervalo_segundos < 1 THEN
    RAISE EXCEPTION 'O intervalo de geração deve ser positivo';
  END IF;

  agora := clock_timestamp();
  INSERT INTO public.ticket_analises_ia_geracoes (
    ticket_id,
    ultima_geracao_em
  ) VALUES (
    p_ticket_id,
    agora
  )
  ON CONFLICT (ticket_id) DO NOTHING
  RETURNING ultima_geracao_em INTO ultima_geracao;

  IF FOUND THEN
    RETURN QUERY SELECT true, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT limite.ultima_geracao_em
    INTO ultima_geracao
    FROM public.ticket_analises_ia_geracoes AS limite
    WHERE limite.ticket_id = p_ticket_id
    FOR UPDATE;

  agora := clock_timestamp();
  proxima_geracao := ultima_geracao + make_interval(secs => p_intervalo_segundos);
  IF proxima_geracao > agora THEN
    RETURN QUERY SELECT false, proxima_geracao;
    RETURN;
  END IF;

  UPDATE public.ticket_analises_ia_geracoes
    SET ultima_geracao_em = agora
    WHERE ticket_id = p_ticket_id;

  RETURN QUERY SELECT true, NULL::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_geracao_status_atendimento(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_geracao_status_atendimento(uuid, integer) TO service_role;

RESET lock_timeout;

-- =============================================================
-- ROLLBACK
-- =============================================================
-- DROP FUNCTION IF EXISTS public.reservar_geracao_status_atendimento(uuid, integer);
-- DROP TABLE IF EXISTS public.ticket_analises_ia_geracoes;
-- ALTER TABLE public.ticket_analises_ia
--   DROP CONSTRAINT IF EXISTS ticket_analises_ia_assinatura_conteudo_sha256,
--   DROP COLUMN IF EXISTS assinatura_conteudo,
--   DROP COLUMN IF EXISTS metadados_prompt,
--   DROP COLUMN IF EXISTS versao_prompt;
