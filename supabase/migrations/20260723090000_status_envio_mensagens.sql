-- Estado persistente e claim atômico dos envios iniciados pelo WorkDesk.
-- Fase 1 do rollout: aplicar antes do código novo. Esta etapa é compatível
-- com a aplicação antiga porque não altera permissões nem instala triggers.
-- Validar em homologação; não executar diretamente em produção sem janela/rollback.
SET lock_timeout = '5s';

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS status_envio TEXT,
  ADD COLUMN IF NOT EXISTS erro_envio TEXT,
  ADD COLUMN IF NOT EXISTS envio_tentativa_id UUID,
  ADD COLUMN IF NOT EXISTS envio_tentativa_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.mensagens'::regclass
      AND conname = 'mensagens_status_envio_check'
  ) THEN
    ALTER TABLE public.mensagens
      ADD CONSTRAINT mensagens_status_envio_check
      CHECK (
        status_envio IS NULL
        OR status_envio IN ('pendente', 'enviando', 'enviado', 'falhou', 'indeterminado')
      )
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.mensagens'::regclass
      AND conname = 'mensagens_claim_envio_consistente_check'
  ) THEN
    ALTER TABLE public.mensagens
      ADD CONSTRAINT mensagens_claim_envio_consistente_check
      CHECK (
        (
          status_envio = 'enviando'
          AND envio_tentativa_id IS NOT NULL
          AND envio_tentativa_em IS NOT NULL
        )
        OR (
          status_envio IS DISTINCT FROM 'enviando'
          AND envio_tentativa_id IS NULL
          AND envio_tentativa_em IS NULL
        )
      )
      NOT VALID;
  END IF;
END
$$;

COMMENT ON COLUMN public.mensagens.envio_tentativa_id IS
  'Token de claim que impede dois requests de enviarem a mesma mensagem.';
COMMENT ON COLUMN public.mensagens.envio_tentativa_em IS
  'Instante em que o claim de envio foi adquirido.';

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
