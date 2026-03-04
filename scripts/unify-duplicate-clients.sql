-- Script para unificar clientes duplicados e prevenir duplicatas futuras
-- Execute este script no Supabase SQL Editor

-- 1. Primeiro, vamos identificar clientes duplicados (mesmo telefone)
-- e mover todos os tickets para o cliente mais antigo

-- Criar tabela temporária com clientes duplicados
WITH duplicates AS (
  SELECT 
    telefone,
    MIN(criado_em) as primeiro_criado,
    array_agg(id ORDER BY criado_em) as cliente_ids
  FROM clientes
  WHERE telefone IS NOT NULL
  GROUP BY telefone
  HAVING COUNT(*) > 1
)
SELECT * FROM duplicates;

-- 2. Para cada telefone duplicado, atualizar tickets para usar o cliente mais antigo
DO $$
DECLARE
  rec RECORD;
  primeiro_cliente_id uuid;
  outros_ids uuid[];
BEGIN
  FOR rec IN 
    SELECT 
      telefone,
      (array_agg(id ORDER BY criado_em))[1] as primeiro_id,
      array_agg(id ORDER BY criado_em) as todos_ids
    FROM clientes
    WHERE telefone IS NOT NULL
    GROUP BY telefone
    HAVING COUNT(*) > 1
  LOOP
    primeiro_cliente_id := rec.primeiro_id;
    outros_ids := rec.todos_ids[2:array_length(rec.todos_ids, 1)];
    
    -- Atualizar tickets para usar o primeiro cliente
    UPDATE tickets 
    SET cliente_id = primeiro_cliente_id 
    WHERE cliente_id = ANY(outros_ids);
    
    -- Atualizar mensagens para usar o primeiro cliente
    UPDATE mensagens 
    SET cliente_id = primeiro_cliente_id 
    WHERE cliente_id = ANY(outros_ids);
    
    RAISE NOTICE 'Unificado telefone % - Cliente principal: %, removidos: %', 
      rec.telefone, primeiro_cliente_id, outros_ids;
  END LOOP;
END $$;

-- 3. Deletar clientes duplicados (mantendo apenas o mais antigo)
DELETE FROM clientes c1
WHERE EXISTS (
  SELECT 1 FROM clientes c2
  WHERE c2.telefone = c1.telefone
  AND c2.criado_em < c1.criado_em
);

-- 4. Adicionar constraint UNIQUE no campo telefone (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'clientes_telefone_unique'
  ) THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_telefone_unique UNIQUE (telefone);
    RAISE NOTICE 'Constraint UNIQUE adicionada ao campo telefone';
  ELSE
    RAISE NOTICE 'Constraint UNIQUE já existe';
  END IF;
END $$;

-- 5. Verificar resultado
SELECT 
  telefone,
  COUNT(*) as qtd
FROM clientes
WHERE telefone IS NOT NULL
GROUP BY telefone
HAVING COUNT(*) > 1;
-- Deve retornar 0 linhas se tudo funcionou corretamente
