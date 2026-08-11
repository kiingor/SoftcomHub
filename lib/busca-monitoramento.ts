// Busca da tela de monitoramento — uma regra única para todas as abas.
//
// Cada lista filtrava do seu jeito: "Em andamento" olhava número e contato,
// "Aguardando atendimento" só o contato (procurar um ticket da fila pelo número
// devolvia vazio) e a aba Nexus tinha ainda outra regra. Nenhuma delas tratava
// o `#` nem os espaços — e o número aparece na tabela como `#97049`, então quem
// copiava o valor da tela não achava nada. Concentrar a regra aqui é o que
// impede as listas de divergirem de novo.

export type TermoBusca = {
  /** Termo cru, minúsculo e sem espaços nas pontas. */
  texto: string
  /** Termo sem o `#` inicial, para casar com o número do ticket. */
  numero: string
  /** Só os dígitos, para casar telefone com ou sem máscara e com ou sem DDI. */
  digitos: string
}

/**
 * Normaliza o termo uma única vez, fora do laço das listas.
 * Devolve `null` quando não há o que filtrar — inclusive para um `#` solto,
 * que é só o começo de quem está digitando `#97049`.
 */
export function normalizarTermoBusca(valor: string | null | undefined): TermoBusca | null {
  const texto = (valor ?? '').trim().toLowerCase()
  if (!texto) return null

  const numero = texto.replace(/^#+/, '').trim()
  if (!numero) return null

  return {
    texto,
    numero,
    digitos: texto.replace(/\D/g, ''),
  }
}

export type AlvoBusca = {
  numero?: string | number | null
  contato?: string | null
  telefone?: string | null
  setor?: string | null
}

function contemTexto(valor: string | null | undefined, termo: string): boolean {
  return typeof valor === 'string' && valor.toLowerCase().includes(termo)
}

/**
 * Termo vazio não filtra nada. Com termo, casa por número do ticket (substring,
 * então prefixo e valor exato também casam), nome do contato, telefone
 * (ignorando máscara e DDI) ou nome do setor.
 */
export function correspondeAoTermo(alvo: AlvoBusca, termo: TermoBusca | null): boolean {
  if (!termo) return true

  const numero = alvo.numero == null ? '' : String(alvo.numero).trim().toLowerCase()
  if (numero && numero.includes(termo.numero)) return true

  if (contemTexto(alvo.contato, termo.texto)) return true
  if (contemTexto(alvo.setor, termo.texto)) return true

  const telefone = (alvo.telefone ?? '').replace(/\D/g, '')
  return Boolean(termo.digitos) && telefone.includes(termo.digitos)
}

type TicketBuscavel = {
  id?: string | null
  numero?: string | number | null
  clientes?: { nome?: string | null; telefone?: string | null } | null
  setores?: { nome?: string | null } | null
}

/**
 * Campos que a busca enxerga em um ticket. Ticket sem `numero` cai no prefixo
 * do id, que é o que a tela mostra nesse caso.
 */
export function alvoDeBuscaDoTicket(ticket: TicketBuscavel): AlvoBusca {
  return {
    numero: ticket.numero ?? ticket.id?.slice(0, 8) ?? null,
    contato: ticket.clientes?.nome || ticket.clientes?.telefone || null,
    telefone: ticket.clientes?.telefone ?? null,
    setor: ticket.setores?.nome ?? null,
  }
}
