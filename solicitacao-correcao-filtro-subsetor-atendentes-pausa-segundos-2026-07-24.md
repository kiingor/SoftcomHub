# Solicitação de correção — Filtro de subsetor e pausa em segundos

**Data:** 24/07/2026  
**Referências:** `solicitacao-filtro-subsetor-atendentes-pausa-segundos-2026-07-23.md` e `resposta-filtro-subsetor-atendentes-pausa-segundos-2026-07-23.md`  
**Status:** Pronto para correção

## Objetivo

Corrigir a persistência do filtro de subsetores sem refazer a implementação aprovada do multisseletor e do formato `HH:MM:SS`. A preferência deve continuar isolada por colaborador e setor, inclusive durante navegação rápida e quando o setor possui zero subsetores ativos.

## Problemas confirmados

1. Em `app/setor/[id]/page.tsx`, a sanitização retorna quando `subsetores.length === 0`. Se o último subsetor for removido ou desativado, um ID salvo deixa de ser descartado e pode manter a tela filtrada.
2. Os dois controles de subsetor são ocultados quando existe somente a opção `Sem subsetor`. Com uma seleção ainda ativa, isso pode deixar um filtro sem controle visível para limpá-lo.
3. `fetchSubsetores()` aceita qualquer resposta assíncrona. Uma resposta atrasada do setor A pode substituir os dados já carregados do setor B, fazer a sanitização remover a preferência válida de B e persistir `[]`.
4. A guarda booleana `subsetorFilterHydrated` não representa qual chave foi hidratada. Na troca de setor ou usuário, o efeito de escrita ainda pode gravar o filtro anterior na chave nova antes do próximo render.
5. Os testes de interseção e não duplicidade não comprovam completamente o que seus nomes afirmam. Também falta a transição exata `00:00:59 → 00:01:00`.
6. O relatório anterior informa uma branch incorreta e atribui ao `git diff --stat` uma separação de autoria que esse comando não demonstra.

## Correções obrigatórias

- [ ] Substituir a guarda booleana por uma identificação da chave efetivamente hidratada. A persistência só pode escrever quando a chave hidratada for exatamente a chave atual de `setorId + colaboradorLogado.id`.
- [ ] Controlar para qual setor a lista de subsetores foi carregada. Um resultado `[]` deve representar “carregado e vazio”, não “ainda carregando”.
- [ ] Ignorar respostas obsoletas de `fetchSubsetores()` quando o usuário já estiver em outro setor. Pode ser usada uma sequência de requisições, cancelamento ou outra solução simples que garanta o mesmo resultado.
- [ ] Sanitizar a preferência somente com os subsetores carregados para o setor atual, inclusive quando a lista final for vazia. Manter apenas `SEM_SUBSETOR_ID` e IDs ativos existentes.
- [ ] Garantir que um filtro ativo nunca fique invisível. Os controles podem continuar ocultos quando não existem subsetores ativos e a seleção está vazia, mas devem aparecer enquanto `subsetorFilter.length > 0`.
- [ ] Adicionar `aria-hidden="true"` ao ícone decorativo do novo estado vazio.
- [ ] Preservar o mesmo `subsetorFilter` nos dois multisseletores, estados `open` independentes, regra OU entre subsetores e regra E com o filtro de atendentes.
- [ ] Preservar o `HH:MM:SS`, as horas acima de 24 e o único intervalo global já existente. Não alterar `computePausaElapsedMs` para tratar datas futuras ou inválidas nesta correção.

## Testes obrigatórios

Em `tests/subsetor-routing.test.mjs`:

- Um ID removido com lista carregada vazia deve ser convertido em `[]`.
- Um ID inativo deve ser removido; um ID ativo e `SEM_SUBSETOR_ID` devem ser preservados.
- Tornar a interseção discriminante: por exemplo, filtro de atendentes `['bruno', 'carla']` + subsetor A deve retornar somente Carla.
- Testar não duplicidade sobre uma coleção filtrada: Ana(A), Bruno(B) e Carla(A+B), selecionando A+B, devem produzir exatamente três IDs únicos.

Se a sanitização ainda estiver embutida no componente, extrair somente a regra pura necessária para `lib/subsetor-routing.ts`. Não adicionar biblioteca de testes.

Em `tests/pausa-status.test.mjs`:

- Adicionar `59_000 ms → 00:00:59`.
- Adicionar `60_000 ms → 00:01:00`.
- Manter os casos existentes de `00:59:59`, `01:00:00`, mais de 24 horas, rótulo completo, ausência de início e limite da pausa.

## Validação manual

Confirmar, sem criar ou alterar dados de produção:

1. Salvar manualmente no `localStorage` um ID inexistente para um setor sem subsetores ativos, recarregar e confirmar que a preferência vira `[]`.
2. Com somente `Sem subsetor` selecionado, confirmar que existe um controle visível para limpar a seleção.
3. Navegar rapidamente entre dois setores e confirmar que opções e preferências não se misturam.
4. Trocar de setor, atualizar com F5 e retornar ao primeiro; cada setor deve restaurar somente sua própria seleção.
5. Confirmar `00:00:59 → 00:01:00` e `00:59:59 → 01:00:00`.

Se algum cenário não puder ser executado por autenticação ou falta de dados seguros, registrar como não executado. Não declarar aprovação por leitura de código como se fosse teste manual.

## Arquivos esperados

- `app/setor/[id]/page.tsx`
- `lib/subsetor-routing.ts`, somente se receber a função pura de sanitização
- `tests/subsetor-routing.test.mjs`
- `tests/pausa-status.test.mjs`
- `resposta-correcao-filtro-subsetor-atendentes-pausa-segundos-2026-07-24.md`

Não modificar `components/monitoramento/multi-select-filter.tsx`, `lib/pausa-status.ts` ou `app/dashboard/monitoramento/page.tsx` sem necessidade comprovada e justificativa no relatório.

## Verificações finais

Executar e registrar o resultado real:

```powershell
npm test
npx tsc --noEmit --incremental false
npm run build
git diff --check
npm run lint
```

O lint atualmente pode falhar porque o executável `eslint` não está instalado. Não instalar dependências apenas para contornar esse baseline; registrar o exit code e a mensagem real.

## Relatório obrigatório

Criar `resposta-correcao-filtro-subsetor-atendentes-pausa-segundos-2026-07-24.md` contendo:

- causa raiz e solução de cada problema;
- arquivos efetivamente alterados;
- chave de armazenamento e condição exata que autoriza leitura, sanitização e escrita;
- proteção contra resposta assíncrona obsoleta;
- testes adicionados e respectivos cenários;
- saída resumida de cada comando;
- roteiro manual realmente executado;
- branch obtida com `git branch --show-current`;
- alterações alheias já existentes, sem afirmar que `git diff --stat` comprova autoria;
- limitações reais, sem commit, push ou deploy.

## Fora do escopo

- Criar migration, tabela ou sincronização entre dispositivos.
- Criar uma segunda seleção independente de subsetores.
- Mudar regras de distribuição, permissões, RLS ou vínculos.
- Corrigir paginação, cards ou problemas preexistentes não causados por esta funcionalidade.
- Instalar dependências, fazer commit, push, deploy ou reverter alterações alheias.

## Definição de pronto

- Nenhuma preferência é gravada antes da hidratação da chave atual.
- Respostas de outro setor não alteram opções nem preferências do setor aberto.
- IDs removidos ou inativos são descartados mesmo quando a lista carregada é `[]`.
- Nenhum filtro ativo fica sem controle visível para limpeza.
- Os testes de interseção, unicidade e transições de segundos são discriminantes e passam.
- `npm test`, TypeScript, build e `git diff --check` passam; limitações preexistentes são documentadas com precisão.
- O relatório final corresponde ao estado real do repositório.
