# Correção do detalhamento de roteamento

## Goal
Corrigir as métricas, o histórico, os filtros e a migração de layout introduzidos em `368bcda`.

## Tasks
- [x] Mapear as consultas e o contrato de dados de roteamento. → Verificar os movimentos e logs históricos.
- [x] Definir taxa de transbordo com denominador explícito. → Cobrir origem com muitas transferências manuais.
- [x] Recuperar histórico pré-`previous_setor_id` sem duplicidade. → Cobrir eventos antigos e novos.
- [x] Aplicar filtros do relatório ao detalhamento. → Cobrir tags, atendentes e subsetores.
- [x] Migrar layouts v7 preservando personalizações. → Cobrir layout salvo sem o novo card.
- [x] Rodar testes, tipos e verificações aplicáveis. → Regressões, tipos e contratos passam; suíte tem uma falha pré-existente fora do escopo e o projeto não declara ESLint.
