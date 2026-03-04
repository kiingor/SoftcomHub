-- Remove duplicate fields that were created by mistake
ALTER TABLE clientes DROP COLUMN IF EXISTS cnpj;
ALTER TABLE clientes DROP COLUMN IF EXISTS registro;
ALTER TABLE clientes DROP COLUMN IF EXISTS pdv;
