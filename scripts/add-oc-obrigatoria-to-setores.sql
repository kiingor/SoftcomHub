-- Caso #97240 — exigir OC do Service Desk antes de encerrar o ticket.
--
-- Opt-in POR SETOR. Nasce `false` em todo mundo de propósito: mesmo com a env
-- `OC_OBRIGATORIA_PARA_ENCERRAR` ligada, nenhum setor trava até alguém ligar o
-- switch em /setor/[id] > Configurações > "Ocorrência Obrigatória".
--
-- Isso é o que permite o rollout gradual. Numa amostra de 31 tickets encerrados,
-- só 6 tinham OC — ligar para todos os 35 setores de uma vez travaria a maioria
-- dos encerramentos no mesmo instante.
--
-- O código roda sem esta coluna: a rota /api/oc e a tela de setor detectam a
-- ausência (42703/PGRST204) e tratam como "não exige". Rodar isto só habilita a
-- opção; não muda o comportamento de nenhum setor sozinho.

ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS oc_obrigatoria_para_encerrar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN setores.oc_obrigatoria_para_encerrar IS
  'Caso #97240: exige OC aberta no Service Desk para encerrar tickets deste setor. '
  'Só vale com OC_OBRIGATORIA_PARA_ENCERRAR ligada. Tickets de disparo são isentos.';
