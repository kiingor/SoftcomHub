# Solicitação de desenvolvimento — Filtro de subsetor e segundos na pausa

**Data:** 23/07/2026  
**Tela alvo:** Dashboard → Setores → abrir um setor → Monitoramento → aba Atendentes  
**Status:** Pronto para implementação

## Objetivo

Permitir que o supervisor filtre a aba **Atendentes** por um ou mais subsetores e mantenha essa seleção após atualizar ou reabrir a tela. Na mesma aba, exibir o tempo de pausa ao vivo no formato `HH:MM:SS`.

## Comportamento confirmado

- Nenhum subsetor selecionado exibe todos os atendentes do setor.
- Vários subsetores selecionados usam regra **OU**: o atendente aparece se estiver vinculado a qualquer um deles.
- A opção **Sem subsetor** exibe atendentes sem vínculo em `colaboradores_subsetores`.
- O filtro de atendente já existente e o filtro de subsetor devem ser combinados com regra **E**.
- A seleção deve sobreviver a F5, saída e retorno à tela, no mesmo navegador.
- A preferência deve ser isolada por supervisor e por setor.
- O tempo de pausa deve avançar a cada segundo sem reiniciar após F5.

## Contexto já existente no código

Em `app/setor/[id]/page.tsx`:

- `fetchSetorData` já consulta `colaboradores_subsetores` e adiciona `subsetor_ids` e `subsetor_nomes` aos atendentes.
- `subsetorFilter`, `subsetorFiltroOptions` e o filtro rápido global de subsetores já existem.
- `matchesAtendenteSubsetorFilter` já representa vazio = todos, múltiplos = OU e `sem_subsetor` = sem vínculos.
- `realtimeStats` já usa essa regra para contar atendentes online.
- `sortedMonitoringAttendants` ainda considera apenas `atendenteFilter`; por isso a tabela não acompanha o subsetor selecionado.
- Já existe um `setInterval` único de 1 segundo enquanto a seção Monitoramento está aberta.

Em `lib/pausa-status.ts`, `formatPausaElapsedLabel` ainda gera somente `HH:MM`. Esse helper também é usado pelo monitoramento global.

## Implementação esperada

### 1. Aplicar o subsetor à lista de atendentes

- Filtrar `sortedMonitoringAttendants` também por `subsetorFilter`, reutilizando a regra de associação existente.
- Não criar uma segunda seleção independente de subsetores. A aba e o filtro rápido global devem refletir o mesmo `subsetorFilter`.
- Criar apenas um estado separado para controlar a abertura do novo popover da aba; dois `MultiSelectFilter` não devem compartilhar o mesmo estado `open`.
- Renderizar um `MultiSelectFilter` dentro da aba **Atendentes**, acima da tabela, com texto claro como “Filtrar atendentes por subsetor”.
- Reutilizar `subsetorFiltroOptions`, incluindo **Sem subsetor**, e habilitar busca.
- Um atendente ligado a mais de um subsetor deve aparecer uma única vez.
- As contagens **Em atendimento** e **Finalizados hoje** da tabela devem respeitar os subsetores selecionados. Sem filtro, continuam mostrando os totais do setor.
- Quando há atendentes cadastrados, mas nenhum corresponde aos filtros, mostrar um estado vazio explícito e uma ação para limpar os filtros. Não deixar apenas uma tabela sem linhas.

Para permitir teste unitário sem importar a página React, mover ou expor a regra pura de correspondência no módulo de domínio `lib/subsetor-routing.ts` e cobri-la em `tests/subsetor-routing.test.mjs`. Preservar o comportamento atual de `isExactSubsetorMatch`.

### 2. Persistir a seleção

Usar `localStorage`, sem alteração de banco:

- Chave versionada contendo `colaboradorLogado.id` e `setorId`.
- Salvar somente um array de IDs de subsetor.
- Ler e gravar dentro de `try/catch`.
- Aceitar somente JSON que seja um array de strings; qualquer valor inválido volta para `[]`.
- Usar uma guarda de hidratação para impedir que o primeiro render grave `[]` antes da leitura do valor salvo.
- Após os subsetores carregarem, remover IDs inexistentes ou inativos da seleção e da preferência salva.
- Limpar o multisseletor deve persistir `[]`.
- Não compartilhar a seleção entre usuários diferentes no mesmo navegador nem entre setores diferentes.

Esta persistência é intencionalmente por navegador/dispositivo. Sincronização entre dispositivos está fora do escopo.

### 3. Exibir pausa em `HH:MM:SS`

- Alterar `formatPausaElapsedLabel` para produzir horas, minutos e segundos com dois dígitos.
- Manter horas acumuladas acima de 24; não tratar o valor como horário do dia.
- Continuar calculando o tempo a partir de `pausaInfo.inicio` e do horário atual.
- Reutilizar o intervalo de 1 segundo já existente. Não criar timer por linha nem um segundo intervalo global.
- Preservar o comportamento quando `inicio` ainda não carregou: mostrar apenas o nome da pausa, nunca `null`.
- Preservar a regra do limite: exatamente no limite ainda não está estourado; após ultrapassá-lo, fica vermelho.
- Atualizar `tests/pausa-status.test.mjs`.

Como o formatador é compartilhado, a mudança também exibirá segundos em `app/dashboard/monitoramento/page.tsx`. Isso é esperado para manter os dois monitoramentos consistentes; validar essa tela, mas não duplicar lógica nela.

## Casos automatizados obrigatórios

### Subsetores

- Seleção vazia aceita qualquer atendente.
- Selecionar A aceita atendente A e atendente A+B, mas não B.
- Selecionar A+B aplica união sem duplicidade.
- **Sem subsetor** aceita somente atendente sem vínculos.
- A + **Sem subsetor** aceita ambos os grupos.
- Filtro de atendente e subsetor usam interseção.

### Pausa

- `0 ms` → `00:00:00`.
- `1 s` → `00:00:01`.
- `59 min 59 s` → `00:59:59`.
- `1 h` → `01:00:00`.
- Mais de 24 horas não reinicia a contagem.
- Nome completo, por exemplo: `Almoço · 00:30:01`.
- Sem `inicio`, mantém somente o nome.
- Os testes existentes de limite da pausa continuam passando.

## Validação manual

Usar atendentes com estas associações:

- Ana: subsetor A.
- Bruno: subsetor B.
- Carla: subsetores A e B.
- Diego: sem subsetor.

Confirmar:

1. Sem seleção: Ana, Bruno, Carla e Diego.
2. A: Ana e Carla.
3. B: Bruno e Carla.
4. A+B: Ana, Bruno e Carla, sem duplicar Carla.
5. Sem subsetor: Diego.
6. A + Sem subsetor: Ana, Carla e Diego.
7. Combinar subsetor com o multisseletor de atendentes.
8. Limpar filtros restaura todos.
9. F5 e reabertura do setor restauram a seleção.
10. Outro setor e outro usuário não herdam a seleção.
11. ID salvo inválido, removido ou inativo é descartado sem quebrar a tela.
12. Pausa avança em `00:00:59 → 00:01:00` e `00:59:59 → 01:00:00`.
13. Trocar de aba ou deixar o navegador em segundo plano não reinicia nem acumula atraso no relógio.
14. Navegação por teclado, foco visível, busca e ação **Limpar** do multisseletor continuam funcionando.

## Arquivos esperados

- `app/setor/[id]/page.tsx`
- `lib/subsetor-routing.ts`
- `lib/pausa-status.ts`
- `tests/subsetor-routing.test.mjs`
- `tests/pausa-status.test.mjs`
- O relatório final solicitado abaixo

`components/monitoramento/multi-select-filter.tsx` e `app/dashboard/monitoramento/page.tsx` não devem precisar de alteração. Se forem modificados, justificar no relatório.

## Fora do escopo

- Migration ou nova tabela de preferências.
- Mudança na distribuição de tickets por subsetor.
- Mudança de permissões, RLS ou vínculos de atendentes.
- Instalação de biblioteca de estado, teste ou persistência.
- Commit, push, deploy ou alterações em produção.
- Reverter ou incluir alterações não relacionadas que já estão no working tree.

## Verificações finais

Executar e registrar o resultado real:

```powershell
npm test
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

O script `npm run lint` existe, mas o baseline atual não possui o executável `eslint`. Não instalar dependências apenas para esta tarefa; registrar essa limitação com honestidade se ela continuar presente.

## Relatório obrigatório do Sonnet

Criar na raiz:

`resposta-filtro-subsetor-atendentes-pausa-segundos-2026-07-23.md`

O relatório deve conter:

- resumo do que foi implementado;
- arquivos efetivamente alterados;
- chave e regras usadas na persistência;
- comportamento do filtro e dos estados vazios;
- impacto do formato `HH:MM:SS` nas duas telas de monitoramento;
- testes adicionados;
- saída/resumo de cada comando de verificação;
- roteiro manual executado e resultado;
- limitações ou pendências reais;
- confirmação de que alterações alheias já existentes não foram revertidas nem incluídas no escopo.

Não declarar uma validação como aprovada se o comando ou cenário não tiver sido realmente executado.

## Definição de pronto

- O supervisor consegue filtrar a aba Atendentes por subsetores com regra OU.
- Sem seleção, todos os atendentes voltam a aparecer.
- A seleção é restaurada corretamente por usuário e setor no mesmo navegador.
- Estados salvos inválidos não prendem a tela em um filtro invisível.
- O tempo de pausa aparece e avança como `HH:MM:SS`.
- Não há novo timer por atendente, migration ou dependência.
- Testes, TypeScript, build e verificação de diff estão aprovados, ou qualquer bloqueio preexistente está documentado com evidência.
