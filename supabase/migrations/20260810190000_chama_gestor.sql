BEGIN;

SET LOCAL lock_timeout = '5s';

-- Metadados opcionais usados para abrir avisos relacionados ao apoio.
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS url text;

CREATE INDEX IF NOT EXISTS idx_notificacoes_ticket_id
  ON public.notificacoes (ticket_id)
  WHERE ticket_id IS NOT NULL;

-- O grupo Gestor fica separado dos subsetores operacionais e não participa da fila.
CREATE TABLE IF NOT EXISTS public.setor_gestores (
  setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  criado_por_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT setor_gestores_setor_colaborador_key UNIQUE (setor_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_setor_gestores_colaborador
  ON public.setor_gestores (colaborador_id, setor_id);

-- Administradores globais podem apoiar qualquer setor existente.
INSERT INTO public.setor_gestores (setor_id, colaborador_id)
SELECT setor.id, colaborador.id
FROM public.setores AS setor
CROSS JOIN public.colaboradores AS colaborador
WHERE colaborador.ativo IS TRUE
  AND colaborador.is_master IS TRUE
ON CONFLICT (setor_id, colaborador_id) DO NOTHING;

-- Supervisores entram somente nos setores aos quais estão vinculados.
WITH setores_vinculados AS (
  SELECT colaborador_id, setor_id FROM public.colaborador_setores
  UNION
  SELECT colaborador_id, setor_id FROM public.colaboradores_setores
  UNION
  SELECT id AS colaborador_id, setor_id
  FROM public.colaboradores
  WHERE setor_id IS NOT NULL
)
INSERT INTO public.setor_gestores (setor_id, colaborador_id)
SELECT DISTINCT vinculo.setor_id, colaborador.id
FROM setores_vinculados AS vinculo
JOIN public.colaboradores AS colaborador
  ON colaborador.id = vinculo.colaborador_id
JOIN public.permissoes AS permissao
  ON permissao.id = colaborador.permissao_id
WHERE colaborador.ativo IS TRUE
  AND COALESCE(permissao.can_view_dashboard, false) IS TRUE
ON CONFLICT (setor_id, colaborador_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ticket_apoios_gestor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  atendente_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  atendente_nome text NOT NULL,
  solicitante_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  gestor_id uuid REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  gestor_nome text,
  origem text NOT NULL,
  status text NOT NULL,
  motivo text,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  aceito_em timestamptz,
  encerrado_em timestamptz,
  encerrado_por_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_apoios_gestor_origem_check
    CHECK (origem IN ('atendente', 'gestor')),
  CONSTRAINT ticket_apoios_gestor_status_check
    CHECK (status IN ('pendente', 'ativo', 'encerrado', 'cancelado')),
  CONSTRAINT ticket_apoios_gestor_motivo_check
    CHECK (motivo IS NULL OR char_length(motivo) <= 2000),
  CONSTRAINT ticket_apoios_gestor_participantes_check
    CHECK (gestor_id IS NULL OR gestor_id <> atendente_id),
  CONSTRAINT ticket_apoios_gestor_solicitante_check
    CHECK (
      (origem = 'atendente' AND solicitante_id = atendente_id)
      OR
      (origem = 'gestor' AND gestor_id IS NOT NULL AND solicitante_id = gestor_id)
    ),
  CONSTRAINT ticket_apoios_gestor_estado_check
    CHECK (
      (
        status = 'pendente'
        AND origem = 'atendente'
        AND gestor_id IS NULL
        AND aceito_em IS NULL
        AND encerrado_em IS NULL
      )
      OR
      (
        status = 'ativo'
        AND gestor_id IS NOT NULL
        AND aceito_em IS NOT NULL
        AND encerrado_em IS NULL
      )
      OR
      (
        status = 'encerrado'
        AND gestor_id IS NOT NULL
        AND aceito_em IS NOT NULL
        AND encerrado_em IS NOT NULL
      )
      OR
      (
        status = 'cancelado'
        AND gestor_id IS NULL
        AND aceito_em IS NULL
        AND encerrado_em IS NOT NULL
      )
    ),
  CONSTRAINT ticket_apoios_gestor_encerramento_check
    CHECK (encerrado_em IS NULL OR aceito_em IS NULL OR encerrado_em >= aceito_em)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_apoios_gestor_ticket_aberto
  ON public.ticket_apoios_gestor (ticket_id)
  WHERE status IN ('pendente', 'ativo');

CREATE INDEX IF NOT EXISTS idx_ticket_apoios_gestor_pendentes_setor
  ON public.ticket_apoios_gestor (setor_id, solicitado_em, id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_ticket_apoios_gestor_atendente_status
  ON public.ticket_apoios_gestor (atendente_id, status, solicitado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_apoios_gestor_gestor_status
  ON public.ticket_apoios_gestor (gestor_id, status, solicitado_em DESC)
  WHERE gestor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ticket_apoio_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apoio_id uuid NOT NULL REFERENCES public.ticket_apoios_gestor(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  autor_nome text NOT NULL,
  conteudo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_apoio_mensagens_conteudo_check
    CHECK (char_length(conteudo) <= 5000 AND char_length(btrim(conteudo)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_ticket_apoio_mensagens_apoio_ordem
  ON public.ticket_apoio_mensagens (apoio_id, criado_em, id);

-- Resolve o colaborador da sessão sem pressupor que colaboradores.id = auth.uid().
CREATE OR REPLACE FUNCTION public.chama_gestor_colaborador_atual_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH colaborador_por_id AS (
    SELECT colaborador.id
    FROM public.colaboradores AS colaborador
    WHERE colaborador.id = auth.uid()
      AND colaborador.ativo IS TRUE
    LIMIT 1
  ),
  colaboradores_por_email AS (
    SELECT colaborador.id
    FROM public.colaboradores AS colaborador
    WHERE colaborador.ativo IS TRUE
      AND NULLIF(auth.jwt() ->> 'email', '') IS NOT NULL
      AND lower(colaborador.email) = lower(auth.jwt() ->> 'email')
      AND NOT EXISTS (SELECT 1 FROM colaborador_por_id)
  ),
  colaborador_unico_por_email AS (
    SELECT (array_agg(id ORDER BY id::text))[1] AS id
    FROM colaboradores_por_email
    HAVING count(*) = 1
  )
  SELECT id FROM colaborador_por_id
  UNION ALL
  SELECT id FROM colaborador_unico_por_email
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_tem_acesso_setor(p_setor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores AS colaborador
    WHERE colaborador.id = public.chama_gestor_colaborador_atual_id()
      AND colaborador.ativo IS TRUE
      AND (
        colaborador.is_master IS TRUE
        OR colaborador.setor_id = p_setor_id
        OR EXISTS (
          SELECT 1
          FROM public.colaborador_setores AS vinculo_dashboard
          WHERE vinculo_dashboard.colaborador_id = colaborador.id
            AND vinculo_dashboard.setor_id = p_setor_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.colaboradores_setores AS vinculo_atendimento
          WHERE vinculo_atendimento.colaborador_id = colaborador.id
            AND vinculo_atendimento.setor_id = p_setor_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_pode_gerir_setor(p_setor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores AS colaborador
    LEFT JOIN public.permissoes AS permissao
      ON permissao.id = colaborador.permissao_id
    WHERE colaborador.id = public.chama_gestor_colaborador_atual_id()
      AND colaborador.ativo IS TRUE
      AND (
        colaborador.is_master IS TRUE
        OR (
          COALESCE(permissao.can_view_dashboard, false) IS TRUE
          AND public.chama_gestor_tem_acesso_setor(p_setor_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_eh_gestor_setor(p_setor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.setor_gestores AS vinculo
    JOIN public.colaboradores AS colaborador
      ON colaborador.id = vinculo.colaborador_id
    LEFT JOIN public.permissoes AS permissao
      ON permissao.id = colaborador.permissao_id
    WHERE vinculo.setor_id = p_setor_id
      AND vinculo.colaborador_id = public.chama_gestor_colaborador_atual_id()
      AND colaborador.ativo IS TRUE
      AND (
        colaborador.is_master IS TRUE
        OR (
          COALESCE(permissao.can_view_dashboard, false) IS TRUE
          AND public.chama_gestor_tem_acesso_setor(p_setor_id)
        )
      )
  );
$$;

-- Todas as mutações do grupo usam a mesma trava transacional por setor.
CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_setor(p_setor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_setor_id IS NULL THEN
    RAISE EXCEPTION 'Setor é obrigatório' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    96439,
    pg_catalog.hashtext(p_setor_id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_serializar_setor_gestores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.chama_gestor_bloquear_setor(OLD.setor_id);
    RETURN OLD;
  END IF;

  PERFORM public.chama_gestor_bloquear_setor(NEW.setor_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setor_gestores_serializar_mutacao
  ON public.setor_gestores;
CREATE TRIGGER setor_gestores_serializar_mutacao
  BEFORE INSERT OR DELETE ON public.setor_gestores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_serializar_setor_gestores();

-- Mantém o grupo lógico derivado dos perfis e vínculos atuais, sem tocar na fila.
CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  colaborador_ativo boolean;
  colaborador_master boolean;
  colaborador_pode_ver_dashboard boolean;
  colaborador_setor_legado uuid;
  setor_id_bloqueado uuid;
  setores_bloqueados uuid[] := ARRAY[]::uuid[];
  setores_desejados uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_colaborador_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    96438,
    pg_catalog.hashtext(p_colaborador_id::text)
  );

  SELECT colaborador.ativo,
         colaborador.is_master,
         COALESCE(permissao.can_view_dashboard, false),
         colaborador.setor_id
    INTO colaborador_ativo,
         colaborador_master,
         colaborador_pode_ver_dashboard,
         colaborador_setor_legado
  FROM public.colaboradores AS colaborador
  LEFT JOIN public.permissoes AS permissao
    ON permissao.id = colaborador.permissao_id
  WHERE colaborador.id = p_colaborador_id;

  IF FOUND AND colaborador_ativo IS TRUE AND colaborador_master IS TRUE THEN
    SELECT COALESCE(array_agg(setor.id ORDER BY setor.id), ARRAY[]::uuid[])
      INTO setores_desejados
    FROM public.setores AS setor;
  ELSIF FOUND
        AND colaborador_ativo IS TRUE
        AND colaborador_pode_ver_dashboard IS TRUE THEN
    SELECT COALESCE(array_agg(vinculo.setor_id ORDER BY vinculo.setor_id), ARRAY[]::uuid[])
      INTO setores_desejados
    FROM (
      SELECT colaborador_setor_legado AS setor_id
      WHERE colaborador_setor_legado IS NOT NULL
      UNION
      SELECT vinculo_dashboard.setor_id
      FROM public.colaborador_setores AS vinculo_dashboard
      WHERE vinculo_dashboard.colaborador_id = p_colaborador_id
      UNION
      SELECT vinculo_atendimento.setor_id
      FROM public.colaboradores_setores AS vinculo_atendimento
      WHERE vinculo_atendimento.colaborador_id = p_colaborador_id
    ) AS vinculo
    JOIN public.setores AS setor
      ON setor.id = vinculo.setor_id;
  END IF;

  SELECT COALESCE(array_agg(escopo.setor_id ORDER BY escopo.setor_id), ARRAY[]::uuid[])
    INTO setores_bloqueados
  FROM (
    SELECT setor_desejado.setor_id
    FROM unnest(setores_desejados) AS setor_desejado(setor_id)
    UNION
    SELECT gestor.setor_id
    FROM public.setor_gestores AS gestor
    WHERE gestor.colaborador_id = p_colaborador_id
  ) AS escopo;

  -- Primeiro protege as linhas dos setores; depois toma os advisory locks
  -- na mesma ordem para evitar ciclos entre sincronizações de masters.
  FOREACH setor_id_bloqueado IN ARRAY setores_bloqueados
  LOOP
    PERFORM 1
    FROM public.setores AS setor
    WHERE setor.id = setor_id_bloqueado
    FOR KEY SHARE;
  END LOOP;

  FOREACH setor_id_bloqueado IN ARRAY setores_bloqueados
  LOOP
    PERFORM public.chama_gestor_bloquear_setor(setor_id_bloqueado);
  END LOOP;

  DELETE FROM public.setor_gestores AS gestor
  WHERE gestor.colaborador_id = p_colaborador_id
    AND NOT (gestor.setor_id = ANY(setores_desejados));

  INSERT INTO public.setor_gestores (setor_id, colaborador_id)
  SELECT setor_id, p_colaborador_id
  FROM unnest(setores_desejados) AS setor_desejado(setor_id)
  ON CONFLICT (setor_id, colaborador_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador_alterado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.chama_gestor_sincronizar_colaborador(NEW.id);

  IF TG_OP = 'UPDATE'
     AND OLD.ativo IS TRUE
     AND NEW.ativo IS NOT TRUE THEN
    UPDATE public.ticket_apoios_gestor AS apoio
    SET status = CASE
          WHEN apoio.status = 'pendente' THEN 'cancelado'
          ELSE 'encerrado'
        END,
        encerrado_em = clock_timestamp(),
        atualizado_em = clock_timestamp()
    WHERE apoio.atendente_id = NEW.id
      AND apoio.status IN ('pendente', 'ativo');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_vinculo_alterado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  colaborador_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.chama_gestor_sincronizar_colaborador(OLD.colaborador_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.colaborador_id IS DISTINCT FROM NEW.colaborador_id THEN
    FOR colaborador_id IN
      SELECT vinculo.colaborador_id
      FROM (
        VALUES (OLD.colaborador_id), (NEW.colaborador_id)
      ) AS vinculo(colaborador_id)
      ORDER BY vinculo.colaborador_id
    LOOP
      PERFORM public.chama_gestor_sincronizar_colaborador(colaborador_id);
    END LOOP;

    RETURN NEW;
  END IF;

  PERFORM public.chama_gestor_sincronizar_colaborador(NEW.colaborador_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_permissao_alterada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  colaborador_id uuid;
BEGIN
  FOR colaborador_id IN
    SELECT colaborador.id
    FROM public.colaboradores AS colaborador
    WHERE colaborador.permissao_id = NEW.id
    ORDER BY colaborador.id
  LOOP
    PERFORM public.chama_gestor_sincronizar_colaborador(colaborador_id);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_incluir_masters_em_setor_novo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.setor_gestores (setor_id, colaborador_id)
  SELECT NEW.id, colaborador.id
  FROM public.colaboradores AS colaborador
  WHERE colaborador.ativo IS TRUE
    AND colaborador.is_master IS TRUE
  ON CONFLICT (setor_id, colaborador_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_encerrar_apoio_ao_remover_gestor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.ticket_apoios_gestor AS apoio
  SET status = 'encerrado',
      encerrado_em = clock_timestamp(),
      atualizado_em = clock_timestamp()
  WHERE apoio.setor_id = OLD.setor_id
    AND apoio.gestor_id = OLD.colaborador_id
    AND apoio.status = 'ativo';

  UPDATE public.ticket_apoios_gestor AS apoio
  SET status = 'cancelado',
      encerrado_em = clock_timestamp(),
      atualizado_em = clock_timestamp()
  WHERE apoio.setor_id = OLD.setor_id
    AND apoio.status = 'pendente'
    AND NOT EXISTS (
      SELECT 1
      FROM public.setor_gestores AS gestor
      JOIN public.colaboradores AS colaborador
        ON colaborador.id = gestor.colaborador_id
      LEFT JOIN public.permissoes AS permissao
        ON permissao.id = colaborador.permissao_id
      WHERE gestor.setor_id = OLD.setor_id
        AND colaborador.ativo IS TRUE
        AND (
          colaborador.is_master IS TRUE
          OR (
            COALESCE(permissao.can_view_dashboard, false) IS TRUE
            AND (
              colaborador.setor_id = OLD.setor_id
              OR EXISTS (
                SELECT 1
                FROM public.colaborador_setores AS vinculo_dashboard
                WHERE vinculo_dashboard.colaborador_id = colaborador.id
                  AND vinculo_dashboard.setor_id = OLD.setor_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.colaboradores_setores AS vinculo_atendimento
                WHERE vinculo_atendimento.colaborador_id = colaborador.id
                  AND vinculo_atendimento.setor_id = OLD.setor_id
              )
            )
          )
        )
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS setor_gestores_encerrar_apoio
  ON public.setor_gestores;
CREATE TRIGGER setor_gestores_encerrar_apoio
  AFTER DELETE ON public.setor_gestores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_encerrar_apoio_ao_remover_gestor();

DROP TRIGGER IF EXISTS chama_gestor_sincronizar_colaborador
  ON public.colaboradores;
CREATE TRIGGER chama_gestor_sincronizar_colaborador
  AFTER INSERT OR UPDATE OF ativo, is_master, permissao_id, setor_id
  ON public.colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_sincronizar_colaborador_alterado();

DROP TRIGGER IF EXISTS chama_gestor_sincronizar_vinculo_dashboard
  ON public.colaborador_setores;
CREATE TRIGGER chama_gestor_sincronizar_vinculo_dashboard
  AFTER INSERT OR UPDATE OR DELETE ON public.colaborador_setores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_sincronizar_vinculo_alterado();

DROP TRIGGER IF EXISTS chama_gestor_sincronizar_vinculo_atendimento
  ON public.colaboradores_setores;
CREATE TRIGGER chama_gestor_sincronizar_vinculo_atendimento
  AFTER INSERT OR UPDATE OR DELETE ON public.colaboradores_setores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_sincronizar_vinculo_alterado();

DROP TRIGGER IF EXISTS chama_gestor_sincronizar_permissao
  ON public.permissoes;
CREATE TRIGGER chama_gestor_sincronizar_permissao
  AFTER UPDATE OF can_view_dashboard ON public.permissoes
  FOR EACH ROW
  WHEN (OLD.can_view_dashboard IS DISTINCT FROM NEW.can_view_dashboard)
  EXECUTE FUNCTION public.chama_gestor_sincronizar_permissao_alterada();

DROP TRIGGER IF EXISTS chama_gestor_incluir_masters_setor_novo
  ON public.setores;
CREATE TRIGGER chama_gestor_incluir_masters_setor_novo
  AFTER INSERT ON public.setores
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_incluir_masters_em_setor_novo();

-- Reconcilia dados existentes e remove vínculos que já ficaram obsoletos.
DO $$
DECLARE
  colaborador_id uuid;
BEGIN
  FOR colaborador_id IN
    SELECT colaborador.id
    FROM public.colaboradores AS colaborador
    ORDER BY colaborador.id
  LOOP
    PERFORM public.chama_gestor_sincronizar_colaborador(colaborador_id);
  END LOOP;
END;
$$;

-- Trava as fontes de elegibilidade antes de qualquer lock setorial.
CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_elegibilidade_gestor(
  p_colaborador_id uuid,
  p_setor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  colaborador_ativo boolean;
  colaborador_master boolean;
  colaborador_permissao_id uuid;
  colaborador_setor_legado uuid;
  pode_ver_dashboard boolean;
BEGIN
  IF p_colaborador_id IS NULL OR p_setor_id IS NULL THEN
    RAISE EXCEPTION 'Gestor e setor são obrigatórios' USING ERRCODE = '23514';
  END IF;

  SELECT colaborador.ativo,
         colaborador.is_master,
         colaborador.permissao_id,
         colaborador.setor_id
    INTO colaborador_ativo,
         colaborador_master,
         colaborador_permissao_id,
         colaborador_setor_legado
  FROM public.colaboradores AS colaborador
  WHERE colaborador.id = p_colaborador_id
  FOR SHARE;

  IF NOT FOUND OR colaborador_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Gestor inativo ou inexistente' USING ERRCODE = '23514';
  END IF;

  IF colaborador_master IS TRUE THEN
    pode_ver_dashboard := true;
  ELSE
    SELECT COALESCE(permissao.can_view_dashboard, false)
      INTO pode_ver_dashboard
    FROM public.permissoes AS permissao
    WHERE permissao.id = colaborador_permissao_id
    FOR SHARE;

    IF NOT FOUND OR pode_ver_dashboard IS NOT TRUE THEN
      RAISE EXCEPTION 'Colaborador não possui perfil de gestor' USING ERRCODE = '23514';
    END IF;

    IF colaborador_setor_legado IS DISTINCT FROM p_setor_id THEN
      PERFORM 1
      FROM public.colaborador_setores AS vinculo_dashboard
      WHERE vinculo_dashboard.colaborador_id = p_colaborador_id
        AND vinculo_dashboard.setor_id = p_setor_id
      FOR KEY SHARE;

      IF NOT FOUND THEN
        PERFORM 1
        FROM public.colaboradores_setores AS vinculo_atendimento
        WHERE vinculo_atendimento.colaborador_id = p_colaborador_id
          AND vinculo_atendimento.setor_id = p_setor_id
        FOR KEY SHARE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Gestor não possui vínculo atual com o setor'
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END IF;

END;
$$;

-- Usada pelos triggers de apoio; o vínculo do grupo é travado por último.
CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_gestor_elegivel(
  p_colaborador_id uuid,
  p_setor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.chama_gestor_bloquear_elegibilidade_gestor(
    p_colaborador_id,
    p_setor_id
  );

  PERFORM 1
  FROM public.setor_gestores AS gestor
  WHERE gestor.setor_id = p_setor_id
    AND gestor.colaborador_id = p_colaborador_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gestor não pertence ao grupo deste setor' USING ERRCODE = '23514';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.chama_gestor_substituir_gestores_setor(uuid, uuid[]);

-- Altera um único membro sem misturar validação e remoção de vínculos stale.
CREATE OR REPLACE FUNCTION public.chama_gestor_definir_gestor_setor(
  p_setor_id uuid,
  p_colaborador_id uuid,
  p_incluir boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  linhas_alteradas integer;
BEGIN
  IF p_setor_id IS NULL OR p_colaborador_id IS NULL OR p_incluir IS NULL THEN
    RAISE EXCEPTION 'Setor, colaborador e operação são obrigatórios'
      USING ERRCODE = '23514';
  END IF;

  IF p_incluir THEN
    PERFORM public.chama_gestor_bloquear_elegibilidade_gestor(
      p_colaborador_id,
      p_setor_id
    );
  END IF;

  PERFORM 1
  FROM public.setores AS setor
  WHERE setor.id = p_setor_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setor inexistente' USING ERRCODE = '23514';
  END IF;

  PERFORM public.chama_gestor_bloquear_setor(p_setor_id);

  IF p_incluir THEN
    INSERT INTO public.setor_gestores (setor_id, colaborador_id)
    VALUES (p_setor_id, p_colaborador_id)
    ON CONFLICT (setor_id, colaborador_id) DO NOTHING;
  ELSE
    DELETE FROM public.setor_gestores AS gestor
    WHERE gestor.setor_id = p_setor_id
      AND gestor.colaborador_id = p_colaborador_id;
  END IF;

  GET DIAGNOSTICS linhas_alteradas = ROW_COUNT;
  RETURN linhas_alteradas = 1;
END;
$$;

-- O aceite toma todos os locks de contexto antes da linha do apoio.
CREATE OR REPLACE FUNCTION public.chama_gestor_aceitar_apoio(
  p_ticket_id uuid,
  p_apoio_id uuid,
  p_gestor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  apoio_atendente_id uuid;
  apoio_gestor_id uuid;
  apoio_setor_id uuid;
  apoio_status text;
  nome_gestor text;
  linhas_alteradas integer;
  participante_id uuid;
  ticket_atendente_id uuid;
  ticket_setor_id uuid;
  ticket_status text;
BEGIN
  IF p_ticket_id IS NULL OR p_apoio_id IS NULL OR p_gestor_id IS NULL THEN
    RAISE EXCEPTION 'Ticket, apoio e gestor são obrigatórios'
      USING ERRCODE = '23514';
  END IF;

  SELECT apoio.setor_id,
         apoio.atendente_id,
         apoio.gestor_id,
         apoio.status
    INTO apoio_setor_id,
         apoio_atendente_id,
         apoio_gestor_id,
         apoio_status
  FROM public.ticket_apoios_gestor AS apoio
  WHERE apoio.id = p_apoio_id
    AND apoio.ticket_id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apoio inexistente ou não pertence ao ticket'
      USING ERRCODE = '23514';
  END IF;

  IF apoio_status <> 'pendente' OR apoio_gestor_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_gestor_id = apoio_atendente_id THEN
    RAISE EXCEPTION 'O gestor não pode ser o atendente do apoio'
      USING ERRCODE = '23514';
  END IF;

  FOR participante_id IN
    SELECT DISTINCT participante.id
    FROM (
      VALUES (apoio_atendente_id), (p_gestor_id)
    ) AS participante(id)
    ORDER BY participante.id
  LOOP
    PERFORM 1
    FROM public.colaboradores AS colaborador
    WHERE colaborador.id = participante_id
      AND colaborador.ativo IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Participante inativo ou inexistente'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  PERFORM public.chama_gestor_bloquear_gestor_elegivel(
    p_gestor_id,
    apoio_setor_id
  );

  SELECT colaborador.nome
    INTO nome_gestor
  FROM public.colaboradores AS colaborador
  WHERE colaborador.id = p_gestor_id;

  SELECT ticket.status,
         ticket.setor_id,
         ticket.colaborador_id
    INTO ticket_status,
         ticket_setor_id,
         ticket_atendente_id
  FROM public.tickets AS ticket
  WHERE ticket.id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND
     OR ticket_status NOT IN ('aberto', 'em_atendimento')
     OR ticket_setor_id IS DISTINCT FROM apoio_setor_id
     OR ticket_atendente_id IS DISTINCT FROM apoio_atendente_id THEN
    RAISE EXCEPTION 'O contexto do apoio mudou' USING ERRCODE = '23514';
  END IF;

  UPDATE public.ticket_apoios_gestor AS apoio
  SET gestor_id = p_gestor_id,
      gestor_nome = nome_gestor,
      status = 'ativo',
      aceito_em = clock_timestamp(),
      atualizado_em = clock_timestamp()
  WHERE apoio.id = p_apoio_id
    AND apoio.ticket_id = p_ticket_id
    AND apoio.setor_id = apoio_setor_id
    AND apoio.atendente_id = apoio_atendente_id
    AND apoio.status = 'pendente'
    AND apoio.gestor_id IS NULL;

  GET DIAGNOSTICS linhas_alteradas = ROW_COUNT;
  RETURN linhas_alteradas = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.chama_gestor_validar_apoio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ticket_status text;
  ticket_setor_id uuid;
  ticket_atendente_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('pendente', 'ativo') THEN
    RAISE EXCEPTION 'Um apoio deve iniciar pendente ou ativo' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.ticket_id,
      NEW.setor_id,
      NEW.atendente_id,
      NEW.atendente_nome,
      NEW.solicitante_id,
      NEW.origem,
      NEW.solicitado_em
    ) IS DISTINCT FROM ROW(
      OLD.ticket_id,
      OLD.setor_id,
      OLD.atendente_id,
      OLD.atendente_nome,
      OLD.solicitante_id,
      OLD.origem,
      OLD.solicitado_em
    ) THEN
      RAISE EXCEPTION 'O contexto original do apoio é imutável' USING ERRCODE = '23514';
    END IF;

    IF NOT (
      (OLD.status = 'pendente' AND NEW.status IN ('ativo', 'cancelado'))
      OR (OLD.status = 'ativo' AND NEW.status = 'encerrado')
    ) THEN
      RAISE EXCEPTION 'Transição de estado do apoio inválida' USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'pendente' AND NEW.status = 'ativo' THEN
      IF OLD.gestor_id IS NOT NULL OR NEW.gestor_id IS NULL THEN
        RAISE EXCEPTION 'O aceite exige um único gestor' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.gestor_id IS DISTINCT FROM OLD.gestor_id THEN
      RAISE EXCEPTION 'O gestor do apoio não pode ser substituído' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status IN ('pendente', 'ativo') THEN
    IF TG_OP = 'INSERT' THEN
      -- A linha nova ainda não é alcançada pelo cleanup concorrente do ticket.
      SELECT ticket.status, ticket.setor_id, ticket.colaborador_id
        INTO ticket_status, ticket_setor_id, ticket_atendente_id
      FROM public.tickets AS ticket
      WHERE ticket.id = NEW.ticket_id
      FOR UPDATE;
    ELSE
      -- O UPDATE já trava o apoio; o trigger do ticket serializa o fechamento.
      SELECT ticket.status, ticket.setor_id, ticket.colaborador_id
        INTO ticket_status, ticket_setor_id, ticket_atendente_id
      FROM public.tickets AS ticket
      WHERE ticket.id = NEW.ticket_id;
    END IF;

    IF NOT FOUND
       OR ticket_status NOT IN ('aberto', 'em_atendimento')
       OR ticket_setor_id IS DISTINCT FROM NEW.setor_id
       OR ticket_atendente_id IS DISTINCT FROM NEW.atendente_id THEN
      RAISE EXCEPTION 'O ticket mudou e não aceita este apoio' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.colaboradores AS atendente
    WHERE atendente.id = NEW.atendente_id
      AND atendente.ativo IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Atendente inativo ou inexistente' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'pendente' THEN
    IF NEW.origem <> 'atendente' OR NEW.solicitante_id <> NEW.atendente_id THEN
      RAISE EXCEPTION 'Somente o atendente atual pode solicitar apoio pendente'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'ativo' THEN
    PERFORM public.chama_gestor_bloquear_gestor_elegivel(NEW.gestor_id, NEW.setor_id);
  END IF;

  IF NEW.status IN ('encerrado', 'cancelado')
     AND NEW.encerrado_por_id IS NOT NULL
     AND NEW.encerrado_por_id <> NEW.atendente_id
     AND NEW.encerrado_por_id IS DISTINCT FROM NEW.gestor_id THEN
    RAISE EXCEPTION 'Somente um participante pode encerrar o apoio'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_apoios_gestor_validar_contexto
  ON public.ticket_apoios_gestor;
CREATE TRIGGER ticket_apoios_gestor_validar_contexto
  BEFORE INSERT OR UPDATE ON public.ticket_apoios_gestor
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_validar_apoio();

-- A notificação persistida participa da mesma transação do apoio.
CREATE OR REPLACE FUNCTION public.chama_gestor_notificar_apoio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ticket_numero bigint;
  ticket_rotulo text;
  notificacoes_criadas integer;
  notificacao_titulo text;
  notificacao_mensagem text;
  notificacao_url text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' THEN
    notificacao_titulo := 'Atendente solicitou apoio';
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'ativo' THEN
    notificacao_titulo := 'Gestor iniciou um apoio';
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'pendente'
        AND NEW.status = 'ativo' THEN
    notificacao_titulo := 'Gestor aceitou o chamado';
  ELSE
    RETURN NEW;
  END IF;

  SELECT ticket.numero
    INTO ticket_numero
  FROM public.tickets AS ticket
  WHERE ticket.id = NEW.ticket_id;

  ticket_rotulo := CASE
    WHEN ticket_numero IS NULL THEN 'ticket selecionado'
    ELSE 'ticket #' || ticket_numero::text
  END;

  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' THEN
    notificacao_mensagem :=
      NEW.atendente_nome || ' solicitou um gestor no ' || ticket_rotulo || '.';
    notificacao_url :=
      '/setor/' || NEW.setor_id::text
      || '?ticket=' || NEW.ticket_id::text
      || '&apoio=' || NEW.id::text;

    INSERT INTO public.notificacoes (
      setor_id,
      remetente_id,
      destinatario_id,
      titulo,
      mensagem,
      tipo,
      ticket_id,
      url
    )
    SELECT NEW.setor_id,
           NEW.atendente_id,
           gestor.colaborador_id,
           notificacao_titulo,
           notificacao_mensagem,
           'chama_gestor',
           NEW.ticket_id,
           notificacao_url
    FROM public.setor_gestores AS gestor
    JOIN public.colaboradores AS colaborador
      ON colaborador.id = gestor.colaborador_id
    LEFT JOIN public.permissoes AS permissao
      ON permissao.id = colaborador.permissao_id
    WHERE gestor.setor_id = NEW.setor_id
      AND gestor.colaborador_id <> NEW.atendente_id
      AND colaborador.ativo IS TRUE
      AND (
        colaborador.is_master IS TRUE
        OR (
          COALESCE(permissao.can_view_dashboard, false) IS TRUE
          AND (
            colaborador.setor_id = NEW.setor_id
            OR EXISTS (
              SELECT 1
              FROM public.colaborador_setores AS vinculo_dashboard
              WHERE vinculo_dashboard.colaborador_id = colaborador.id
                AND vinculo_dashboard.setor_id = NEW.setor_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.colaboradores_setores AS vinculo_atendimento
              WHERE vinculo_atendimento.colaborador_id = colaborador.id
                AND vinculo_atendimento.setor_id = NEW.setor_id
            )
          )
        )
      )
    FOR KEY SHARE OF gestor;

    GET DIAGNOSTICS notificacoes_criadas = ROW_COUNT;
    IF notificacoes_criadas = 0 THEN
      RAISE EXCEPTION 'Não há gestor elegível para receber o chamado'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    notificacao_mensagem := CASE
      WHEN TG_OP = 'INSERT'
        THEN COALESCE(NEW.gestor_nome, 'Gestor')
          || ' iniciou apoio no ' || ticket_rotulo || '.'
      ELSE COALESCE(NEW.gestor_nome, 'Gestor')
        || ' aceitou o apoio do ' || ticket_rotulo || '.'
    END;
    notificacao_url :=
      '/workdesk?ticket=' || NEW.ticket_id::text
      || '&apoio=' || NEW.id::text;

    INSERT INTO public.notificacoes (
      setor_id,
      remetente_id,
      destinatario_id,
      titulo,
      mensagem,
      tipo,
      ticket_id,
      url
    )
    VALUES (
      NEW.setor_id,
      NEW.gestor_id,
      NEW.atendente_id,
      notificacao_titulo,
      notificacao_mensagem,
      'chama_gestor',
      NEW.ticket_id,
      notificacao_url
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_apoios_gestor_notificar
  ON public.ticket_apoios_gestor;
CREATE TRIGGER ticket_apoios_gestor_notificar
  AFTER INSERT OR UPDATE OF status ON public.ticket_apoios_gestor
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_notificar_apoio();

CREATE OR REPLACE FUNCTION public.chama_gestor_validar_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  apoio_ticket_id uuid;
  apoio_setor_id uuid;
  apoio_atendente_id uuid;
  apoio_gestor_id uuid;
  apoio_status text;
  ticket_status text;
  ticket_setor_id uuid;
  ticket_atendente_id uuid;
BEGIN
  SELECT apoio.ticket_id,
         apoio.setor_id,
         apoio.atendente_id,
         apoio.gestor_id,
         apoio.status
    INTO apoio_ticket_id,
         apoio_setor_id,
         apoio_atendente_id,
         apoio_gestor_id,
         apoio_status
  FROM public.ticket_apoios_gestor AS apoio
  WHERE apoio.id = NEW.apoio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apoio inexistente' USING ERRCODE = '23514';
  END IF;

  IF apoio_status <> 'ativo' THEN
    RAISE EXCEPTION 'O apoio não está ativo' USING ERRCODE = '23514';
  END IF;

  SELECT ticket.status, ticket.setor_id, ticket.colaborador_id
    INTO ticket_status, ticket_setor_id, ticket_atendente_id
  FROM public.tickets AS ticket
  WHERE ticket.id = apoio_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket inexistente' USING ERRCODE = '23514';
  END IF;

  IF NEW.autor_id <> apoio_atendente_id
     AND NEW.autor_id IS DISTINCT FROM apoio_gestor_id THEN
    RAISE EXCEPTION 'Somente participantes podem enviar mensagens'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.colaboradores AS autor
  WHERE autor.id = NEW.autor_id
    AND autor.ativo IS TRUE
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autor inativo ou inexistente' USING ERRCODE = '23514';
  END IF;

  IF NEW.autor_id = apoio_gestor_id THEN
    PERFORM public.chama_gestor_bloquear_gestor_elegivel(NEW.autor_id, apoio_setor_id);
  END IF;

  -- Revalida e trava o apoio após ticket, autor e vínculo.
  SELECT apoio.ticket_id,
         apoio.setor_id,
         apoio.atendente_id,
         apoio.gestor_id,
         apoio.status
    INTO apoio_ticket_id,
         apoio_setor_id,
         apoio_atendente_id,
         apoio_gestor_id,
         apoio_status
  FROM public.ticket_apoios_gestor AS apoio
  WHERE apoio.id = NEW.apoio_id
  FOR UPDATE;

  IF NOT FOUND
     OR apoio_status <> 'ativo'
     OR ticket_status NOT IN ('aberto', 'em_atendimento')
     OR ticket_setor_id IS DISTINCT FROM apoio_setor_id
     OR ticket_atendente_id IS DISTINCT FROM apoio_atendente_id THEN
    RAISE EXCEPTION 'O contexto do apoio mudou' USING ERRCODE = '23514';
  END IF;

  IF NEW.autor_id <> apoio_atendente_id
     AND NEW.autor_id IS DISTINCT FROM apoio_gestor_id THEN
    RAISE EXCEPTION 'Somente participantes podem enviar mensagens'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_apoio_mensagens_validar_contexto
  ON public.ticket_apoio_mensagens;
CREATE TRIGGER ticket_apoio_mensagens_validar_contexto
  BEFORE INSERT ON public.ticket_apoio_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_validar_mensagem();

CREATE OR REPLACE FUNCTION public.chama_gestor_definir_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.atualizado_em := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_apoios_gestor_atualizado_em
  ON public.ticket_apoios_gestor;
CREATE TRIGGER ticket_apoios_gestor_atualizado_em
  BEFORE UPDATE ON public.ticket_apoios_gestor
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_definir_atualizado_em();

-- Troca de responsável/setor ou encerramento do ticket fecha o apoio atual.
CREATE OR REPLACE FUNCTION public.chama_gestor_encerrar_apoio_ao_alterar_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
     OR NEW.setor_id IS DISTINCT FROM OLD.setor_id
     OR COALESCE(NEW.status, '') NOT IN ('aberto', 'em_atendimento') THEN
    UPDATE public.ticket_apoios_gestor AS apoio
    SET status = CASE
          WHEN apoio.status = 'pendente' THEN 'cancelado'
          ELSE 'encerrado'
        END,
        encerrado_em = clock_timestamp(),
        atualizado_em = clock_timestamp()
    WHERE apoio.ticket_id = NEW.id
      AND apoio.status IN ('pendente', 'ativo');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_encerrar_apoio_gestor ON public.tickets;
CREATE TRIGGER tickets_encerrar_apoio_gestor
  AFTER UPDATE OF colaborador_id, setor_id, status ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.chama_gestor_encerrar_apoio_ao_alterar_ticket();

ALTER TABLE public.setor_gestores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_apoios_gestor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_apoio_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_lidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_select_escopo" ON public.notificacoes;
CREATE POLICY "notificacoes_select_escopo"
  ON public.notificacoes
  FOR SELECT TO authenticated
  USING (
    destinatario_id = public.chama_gestor_colaborador_atual_id()
    OR (
      destinatario_id IS NULL
      AND setor_id IS NOT NULL
      AND public.chama_gestor_tem_acesso_setor(setor_id)
    )
    OR (
      remetente_id = public.chama_gestor_colaborador_atual_id()
      AND setor_id IS NOT NULL
      AND public.chama_gestor_pode_gerir_setor(setor_id)
    )
  );

DROP POLICY IF EXISTS "notificacoes_delete_remetente_gestor" ON public.notificacoes;
CREATE POLICY "notificacoes_delete_remetente_gestor"
  ON public.notificacoes
  FOR DELETE TO authenticated
  USING (
    remetente_id = public.chama_gestor_colaborador_atual_id()
    AND setor_id IS NOT NULL
    AND public.chama_gestor_pode_gerir_setor(setor_id)
  );

DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.notificacoes_lidas;
DROP POLICY IF EXISTS "notificacoes_lidas_select_proprio" ON public.notificacoes_lidas;
CREATE POLICY "notificacoes_lidas_select_proprio"
  ON public.notificacoes_lidas
  FOR SELECT TO authenticated
  USING (colaborador_id = public.chama_gestor_colaborador_atual_id());

DROP POLICY IF EXISTS "notificacoes_lidas_insert_proprio" ON public.notificacoes_lidas;
CREATE POLICY "notificacoes_lidas_insert_proprio"
  ON public.notificacoes_lidas
  FOR INSERT TO authenticated
  WITH CHECK (colaborador_id = public.chama_gestor_colaborador_atual_id());

DROP POLICY IF EXISTS "notificacoes_lidas_update_proprio" ON public.notificacoes_lidas;
CREATE POLICY "notificacoes_lidas_update_proprio"
  ON public.notificacoes_lidas
  FOR UPDATE TO authenticated
  USING (colaborador_id = public.chama_gestor_colaborador_atual_id())
  WITH CHECK (colaborador_id = public.chama_gestor_colaborador_atual_id());

DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.setor_gestores;
DROP POLICY IF EXISTS "setor_gestores_select_proprio" ON public.setor_gestores;
CREATE POLICY "setor_gestores_select_proprio"
  ON public.setor_gestores
  FOR SELECT TO authenticated
  USING (colaborador_id = public.chama_gestor_colaborador_atual_id());

DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.ticket_apoios_gestor;
DROP POLICY IF EXISTS "ticket_apoios_gestor_select_participantes" ON public.ticket_apoios_gestor;
CREATE POLICY "ticket_apoios_gestor_select_participantes"
  ON public.ticket_apoios_gestor
  FOR SELECT TO authenticated
  USING (
    atendente_id = public.chama_gestor_colaborador_atual_id()
    OR gestor_id = public.chama_gestor_colaborador_atual_id()
    OR public.chama_gestor_eh_gestor_setor(setor_id)
  );

DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.ticket_apoio_mensagens;
DROP POLICY IF EXISTS "ticket_apoio_mensagens_select_participantes" ON public.ticket_apoio_mensagens;
CREATE POLICY "ticket_apoio_mensagens_select_participantes"
  ON public.ticket_apoio_mensagens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_apoios_gestor AS apoio
      WHERE apoio.id = ticket_apoio_mensagens.apoio_id
        AND (
          apoio.atendente_id = public.chama_gestor_colaborador_atual_id()
          OR apoio.gestor_id = public.chama_gestor_colaborador_atual_id()
        )
    )
  );

REVOKE ALL ON TABLE public.setor_gestores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_apoios_gestor FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_apoio_mensagens FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.setor_gestores TO authenticated;
GRANT SELECT ON TABLE public.ticket_apoios_gestor TO authenticated;
GRANT SELECT ON TABLE public.ticket_apoio_mensagens TO authenticated;

GRANT ALL ON TABLE public.setor_gestores TO service_role;
GRANT ALL ON TABLE public.ticket_apoios_gestor TO service_role;
GRANT ALL ON TABLE public.ticket_apoio_mensagens TO service_role;

REVOKE ALL ON FUNCTION public.chama_gestor_colaborador_atual_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chama_gestor_tem_acesso_setor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chama_gestor_pode_gerir_setor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chama_gestor_eh_gestor_setor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chama_gestor_bloquear_setor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_serializar_setor_gestores()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_sincronizar_colaborador(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_bloquear_elegibilidade_gestor(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_bloquear_gestor_elegivel(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_definir_gestor_setor(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chama_gestor_aceitar_apoio(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chama_gestor_colaborador_atual_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chama_gestor_tem_acesso_setor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chama_gestor_pode_gerir_setor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chama_gestor_eh_gestor_setor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chama_gestor_sincronizar_colaborador(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chama_gestor_bloquear_gestor_elegivel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chama_gestor_definir_gestor_setor(uuid, uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.chama_gestor_aceitar_apoio(uuid, uuid, uuid)
  TO service_role;

-- Realtime é adicionado apenas quando a publication usa uma lista explícita.
DO $$
DECLARE
  publication_for_all_tables boolean;
BEGIN
  SELECT publication.puballtables
    INTO publication_for_all_tables
  FROM pg_catalog.pg_publication AS publication
  WHERE publication.pubname = 'supabase_realtime';

  IF FOUND AND NOT publication_for_all_tables THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ticket_apoios_gestor'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_apoios_gestor;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ticket_apoio_mensagens'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_apoio_mensagens;
    END IF;
  END IF;
END;
$$;

COMMIT;
