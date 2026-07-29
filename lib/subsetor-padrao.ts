/**
 * Subsetor padrão de um setor, derivado do cadastro.
 *
 * 41% dos tickets do ServiceDesk chegam sem subsetor — e em Suporte a Franquias
 * são 98%, no Kenobi 91%. As rotas de criação aceitam `subsetor_id` como
 * opcional e não preenchem nada quando vem vazio, então o ticket fica órfão:
 * no passe compatível ele só casa com atendente SEM vínculo de subsetor, e no
 * ServiceDesk são 4 de 75 pessoas.
 *
 * A derivação é automática para não exigir configuração em 27 setores.
 */

export type SubsetorCandidato = {
  id: string
  nome: string
  ativo?: boolean | null
}

const NOME_PREFERIDO = 'suporte'

function normalizar(nome: string): string {
  return nome
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Escolhe o padrão, ou `null` quando não há escolha segura.
 *
 * `idsComAtendente` é a trava que impede a regressão medida no Kenobi: lá os 4
 * atendentes não têm vínculo de subsetor nenhum, então hoje eles pegam os
 * tickets órfãos justamente por serem órfãos também. Preencher "Suporte" faria
 * os 259 tickets mirarem um subsetor sem ninguém e caírem inteiros no fallback
 * — pior que o comportamento atual. Sem atendente vinculado, devolve `null` e
 * o ticket segue como era.
 */
export function escolherSubsetorPadrao(
  subsetores: readonly SubsetorCandidato[],
  idsComAtendente: ReadonlySet<string>,
): string | null {
  const ativos = subsetores.filter((s) => s.ativo !== false && s.id)
  if (ativos.length === 0) return null

  const atendidos = ativos.filter((s) => idsComAtendente.has(s.id))
  if (atendidos.length === 0) return null

  // "Suporte" é o destino natural: existe em 24 dos 27 setores e é para onde
  // vai o trabalho não classificado.
  const suporte = atendidos.find((s) => normalizar(s.nome) === NOME_PREFERIDO)
  if (suporte) return suporte.id

  // Setor com um subsetor só (Financeiro Matriz, Ouvidoria Matriz, Comercial
  // Matriz): não há ambiguidade, é ele.
  if (ativos.length === 1) return atendidos[0]?.id ?? null

  // Vários subsetores e nenhum chamado "Suporte" — escolher um seria adivinhar
  // o roteamento do setor. Melhor deixar como está.
  return null
}
