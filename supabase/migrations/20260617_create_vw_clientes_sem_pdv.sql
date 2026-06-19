-- View: clientes sem PDV preenchido no cadastro.
-- "PDV", "CNPJ" e "Registro" são colunas case-sensitive (criadas com letras
-- maiúsculas), por isso exigem aspas duplas. Um cliente é considerado "sem PDV"
-- quando a coluna é NULL ou só contém espaços em branco.
--
-- security_invoker = true: a view respeita o RLS de quem consulta (mesma
-- visibilidade que um SELECT direto em `clientes` teria). No Supabase Studio,
-- consultando como service role, todas as linhas aparecem normalmente.

CREATE OR REPLACE VIEW public.vw_clientes_sem_pdv
WITH (security_invoker = true) AS
SELECT
  id,
  nome,
  telefone,
  email,
  documento,
  "CNPJ",
  "Registro",
  "PDV"
FROM public.clientes
WHERE "PDV" IS NULL
   OR btrim("PDV") = ''
ORDER BY nome;
