ALTER TABLE public.ticket_assignment_logs
  ADD COLUMN IF NOT EXISTS previous_setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_assignment_logs_ticket_created
  ON public.ticket_assignment_logs (ticket_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_ticket_assignment_timing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.colaborador_id IS NOT NULL THEN
      INSERT INTO public.ticket_assignment_logs (
        ticket_id,
        colaborador_id,
        setor_id,
        previous_setor_id,
        action,
        assignment_reason
      ) VALUES (
        NEW.id,
        NEW.colaborador_id,
        NEW.setor_id,
        NULL,
        'auto_assigned',
        'Atribuição inicial do ticket'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.setor_id IS NOT DISTINCT FROM OLD.setor_id
    AND NEW.colaborador_id IS NOT DISTINCT FROM OLD.colaborador_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ticket_assignment_logs (
    ticket_id,
    colaborador_id,
    setor_id,
    previous_colaborador_id,
    previous_setor_id,
    action,
    assignment_reason
  ) VALUES (
    NEW.id,
    NEW.colaborador_id,
    NEW.setor_id,
    OLD.colaborador_id,
    OLD.setor_id,
    CASE
      WHEN NEW.setor_id IS DISTINCT FROM OLD.setor_id OR OLD.colaborador_id IS NOT NULL THEN 'transferred'
      ELSE 'auto_assigned'
    END,
    'Evento automático de atribuição para medição de tempo'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_assignment_timing_log ON public.tickets;

CREATE TRIGGER ticket_assignment_timing_log
AFTER INSERT OR UPDATE OF setor_id, colaborador_id ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.log_ticket_assignment_timing();
