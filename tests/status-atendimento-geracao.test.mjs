import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const {
  INTERVALO_GERACAO_STATUS_ATENDIMENTO_SEGUNDOS,
  interpretarReservaGeracao,
  reservarGeracaoStatusAtendimento,
} = await import('../lib/server/status-atendimento-analise.ts')

function lerArquivo(caminho) {
  return readFileSync(fileURLToPath(new URL(`../${caminho}`, import.meta.url)), 'utf8')
}

test('interpreta a reserva persistente e calcula o Retry-After', () => {
  const agora = Date.parse('2026-08-06T15:00:00.000Z')
  const proximaGeracaoEm = new Date(agora + 6_500).toISOString()

  assert.deepEqual(
    interpretarReservaGeracao([{ permitida: true, proxima_geracao_em: null }], agora),
    { ok: true, permitida: true },
  )
  assert.deepEqual(
    interpretarReservaGeracao([{ permitida: false, proxima_geracao_em: proximaGeracaoEm }], agora),
    {
      ok: true,
      permitida: false,
      retryAfterSeconds: 7,
      proximaGeracaoEm,
    },
  )
})

test('a reserva chama a RPC com o intervalo fixo e falha fechada', async () => {
  const chamadas = []
  const db = {
    async rpc(nome, parametros) {
      chamadas.push({ nome, parametros })
      return { data: [{ permitida: true, proxima_geracao_em: null }], error: null }
    },
  }

  const permitida = await reservarGeracaoStatusAtendimento(db, 'ticket-1')
  assert.deepEqual(permitida, { ok: true, permitida: true })
  assert.deepEqual(chamadas, [{
    nome: 'reservar_geracao_status_atendimento',
    parametros: {
      p_ticket_id: 'ticket-1',
      p_intervalo_segundos: INTERVALO_GERACAO_STATUS_ATENDIMENTO_SEGUNDOS,
    },
  }])

  const indisponivel = await reservarGeracaoStatusAtendimento({
    async rpc() {
      return { data: null, error: { message: 'function missing' } }
    },
  }, 'ticket-1')
  assert.deepEqual(indisponivel, { ok: false, erro: 'function missing' })
})

test('a migration reserva no banco com lock e limita a RPC ao service role', () => {
  const migration = lerArquivo('supabase/migrations/20260806160000_status_atendimento_cache_assinatura_limite.sql')

  assert.match(migration, /ticket_analises_ia_geracoes/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/)
  assert.doesNotMatch(migration, /CREATE POLICY|ENABLE ROW LEVEL SECURITY|DROP POLICY/)
})

test('a rota informa o limite no mesmo SSE e com status 429', () => {
  const route = lerArquivo('app/api/ia/status-atendimento/route.ts')

  assert.match(route, /reservarGeracaoStatusAtendimento/)
  assert.match(route, /ANALISE_GERACAO_LIMITADA/)
  assert.match(route, /Retry-After/)
  assert.match(route, /\n\s*429,/)
})

test('reanálise forçada ignora o cache, mas ainda passa pela reserva persistente', () => {
  const route = lerArquivo('app/api/ia/status-atendimento/route.ts')
  const cache = route.indexOf('salva\n      && !forcar')
  const reserva = route.indexOf('const reserva = await reservarGeracaoStatusAtendimento')

  assert.ok(cache >= 0)
  assert.ok(reserva > cache)
})

test('o tooltip explica que a primeira resposta começa no fim do bloco do cliente', () => {
  const painel = lerArquivo('components/setor/status-atendimento-panel.tsx')

  assert.match(
    painel,
    /Da última mensagem do bloco consecutivo do cliente até a primeira resposta humana\./,
  )
})
