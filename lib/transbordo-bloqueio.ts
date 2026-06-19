// Avalia se o transbordo do setor está bloqueado AGORA por uma janela de horário
// configurada (ex.: almoço). Durante a janela, o ticket aguarda na fila do setor
// em vez de transbordar para o receptor.
//
// Em caso de erro (ex.: tabela ainda não existe), retorna false — falha de forma
// segura mantendo o comportamento atual (transbordo segue funcionando).
export async function isTransbordoBloqueado(supabase: any, setorId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('transbordo_bloqueios')
      .select('hora_inicio, hora_fim, dias')
      .eq('setor_id', setorId)

    if (error || !data || data.length === 0) return false

    // Hora atual no fuso de Brasília (o servidor roda em UTC)
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const dia = agora.getDay() // 0=Dom .. 6=Sáb
    const hm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`

    return data.some((b: any) => {
      const dias: number[] = Array.isArray(b.dias) ? b.dias : []
      if (dias.length > 0 && !dias.includes(dia)) return false
      const ini = String(b.hora_inicio ?? '').slice(0, 5)
      const fim = String(b.hora_fim ?? '').slice(0, 5)
      if (!ini || !fim || fim <= ini) return false // janela inválida/atravessa meia-noite: ignora
      return hm >= ini && hm < fim
    })
  } catch (e) {
    console.error('[transbordo-bloqueio] erro ao avaliar bloqueio:', e)
    return false
  }
}
