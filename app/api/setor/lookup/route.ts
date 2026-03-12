import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { searchParams } = new URL(request.url)
    const identifier = searchParams.get('identifier')

    if (!identifier) {
      return NextResponse.json(
        { error: 'Informe o parametro identifier (api_key, instancia ou phone_number_id)' },
        { status: 400 },
      )
    }

    // Search in setor_canais table by multiple fields — return ALL matches
    const { data: canalMatches, error: canalError } = await supabase
      .from('setor_canais')
      .select(`
        id, setor_id, nome, tipo, ativo, instancia, max_disparos_dia, criado_em,
        phone_number_id, whatsapp_token, template_id, template_language,
        evolution_base_url, evolution_api_key,
        discord_bot_token, discord_guild_id,
        setores(id, nome)
      `)
      .or(`evolution_api_key.eq.${identifier},instancia.eq.${identifier},phone_number_id.eq.${identifier}`)

    if (canalMatches && canalMatches.length > 0) {
      const results = await Promise.all(
        canalMatches.map(async (canalMatch) => {
          const setor = canalMatch.setores as any

          // Build canal response based on type
          const canalBase = {
            id: canalMatch.id,
            nome: canalMatch.nome,
            tipo: canalMatch.tipo,
            ativo: canalMatch.ativo,
            instancia: canalMatch.instancia || null,
            max_disparos_dia: canalMatch.max_disparos_dia || 0,
            criado_em: canalMatch.criado_em,
          }

          let canalEspecifico = {}

          if (canalMatch.tipo === 'whatsapp') {
            canalEspecifico = {
              phone_number_id: canalMatch.phone_number_id || null,
              whatsapp_token: canalMatch.whatsapp_token || null,
              template_id: canalMatch.template_id || null,
              template_language: canalMatch.template_language || 'pt_BR',
            }
          } else if (canalMatch.tipo === 'evolution_api') {
            canalEspecifico = {
              evolution_base_url: canalMatch.evolution_base_url || null,
              evolution_api_key: canalMatch.evolution_api_key || null,
            }
          } else if (canalMatch.tipo === 'discord') {
            canalEspecifico = {
              discord_bot_token: canalMatch.discord_bot_token || null,
              discord_guild_id: canalMatch.discord_guild_id || null,
            }
          }

          // Buscar setores de atendimento associados ao setor (não ao canal)
          const { data: tiposAtendimento } = await supabase
            .from('setor_tipos_atendimento')
            .select('tipo, setor_destino_id, setores!setor_tipos_atendimento_setor_destino_id_fkey(id, nome)')
            .eq('setor_id', canalMatch.setor_id)

          const setoresAtendimento: Record<string, { setor_id: string; setor_nome: string } | null> = {
            suporte: null,
            ouvidoria: null,
            financeiro: null,
            implantacao: null,
            comercial: null,
          }

          if (tiposAtendimento) {
            for (const tipo of tiposAtendimento) {
              const setorInfo = tipo.setores as any
              setoresAtendimento[tipo.tipo] = {
                setor_id: tipo.setor_destino_id,
                setor_nome: setorInfo?.nome || null,
              }
            }
          }

          // Buscar subsetores do setor
          const { data: subsetoresData } = await supabase
            .from('subsetores')
            .select('id, nome, descricao, ativo')
            .eq('setor_id', canalMatch.setor_id)
            .eq('ativo', true)
            .order('nome')

          const subsetores = (subsetoresData || []).map((s) => ({
            id: s.id,
            nome: s.nome,
            descricao: s.descricao,
          }))

          return {
            source: 'setor_canais',
            setor_id: canalMatch.setor_id,
            setor_nome: setor?.nome || null,
            canal: {
              ...canalBase,
              ...canalEspecifico,
            },
            setores_atendimento: setoresAtendimento,
            subsetores,
          }
        }),
      )

      return NextResponse.json(results)
    }

    // Priority 2: Fallback to setores table — return ALL matches
    const { data: setorMatches } = await supabase
      .from('setores')
      .select('id, nome, canal')
      .or(`evolution_api_key.eq.${identifier},phone_number_id.eq.${identifier}`)

    if (setorMatches && setorMatches.length > 0) {
      return NextResponse.json(
        setorMatches.map((s) => ({
          source: 'setores',
          setor_id: s.id,
          setor_nome: s.nome,
          canal: null,
        })),
      )
    }

    return NextResponse.json(
      { error: 'Nenhum setor encontrado para o identificador informado', identifier },
      { status: 404 },
    )
  } catch (error) {
    console.error('[Setor Lookup] Error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
