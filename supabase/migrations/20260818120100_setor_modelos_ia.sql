-- =============================================
-- Modelo de IA escolhido por setor — caso #97520
-- =============================================
-- Até aqui os nomes de modelo eram fixos no código: 'gpt-4o-mini'/'cx/gpt-5.4'
-- no chat e 'whisper-1' na transcrição. Os nomes NÃO são intercambiáveis entre
-- provedores: o gateway da Softcom roteia por prefixo e não tem credencial da
-- OpenAI, então pedir 'whisper-1' lá volta
--   400 "No credentials for provider: openai"
-- — ou seja, o botão "Transcrever áudio" nunca funcionou em setor com URL
-- personalizada (verificado em 18/08/2026 no setor Financeiro Matriz; o mesmo
-- áudio transcreve normalmente com 'groq/whisper-large-v3').
--
-- NULL = usar o padrão do provedor, que é o comportamento anterior.
-- =============================================

ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS openai_modelo_chat TEXT;

ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS openai_modelo_transcricao TEXT;

COMMENT ON COLUMN setores.openai_modelo_chat IS
  'Modelo para /chat/completions (melhorar mensagem). NULL = padrão do provedor.';
COMMENT ON COLUMN setores.openai_modelo_transcricao IS
  'Modelo para /audio/transcriptions. NULL = padrão do provedor.';

-- -----------------------------------------------------------------
-- Rollback:
-- -----------------------------------------------------------------
-- ALTER TABLE setores DROP COLUMN IF EXISTS openai_modelo_chat;
-- ALTER TABLE setores DROP COLUMN IF EXISTS openai_modelo_transcricao;
