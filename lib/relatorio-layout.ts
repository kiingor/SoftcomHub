export interface RelatorioLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const ROTEAMENTO_LEGADO = { x: 10, y: 9, w: 2, h: 4 }
const ROTEAMENTO_ATUAL = { x: 6, y: 18, w: 6, h: 6 }

function ocupaMesmoEspaco(primeiro: RelatorioLayoutItem, segundo: RelatorioLayoutItem) {
  return (
    primeiro.x < segundo.x + segundo.w
    && primeiro.x + primeiro.w > segundo.x
    && primeiro.y < segundo.y + segundo.h
    && primeiro.y + primeiro.h > segundo.y
  )
}

function encontrarPosicaoLivre(layout: readonly RelatorioLayoutItem[]) {
  let y = ROTEAMENTO_ATUAL.y

  for (;;) {
    const candidato = { ...ROTEAMENTO_ATUAL, i: 'roteamento' }
    candidato.y = y
    const colisao = layout.find((item) => ocupaMesmoEspaco(candidato, item))
    if (!colisao) return candidato
    y = Math.max(y + 1, colisao.y + colisao.h)
  }
}

export function migrarLayoutRoteamentoV7<T extends RelatorioLayoutItem>(layout: readonly T[]): T[] {
  const roteamento = layout.find((item) => (
    item.i === 'roteamento'
    && item.x === ROTEAMENTO_LEGADO.x
    && item.y === ROTEAMENTO_LEGADO.y
    && item.w === ROTEAMENTO_LEGADO.w
    && item.h === ROTEAMENTO_LEGADO.h
  ))
  if (!roteamento) return [...layout]

  const posicao = encontrarPosicaoLivre(layout.filter((item) => item !== roteamento))
  return layout.map((item) => (
    item === roteamento
      ? { ...item, ...posicao } as T
      : item
  ))
}
