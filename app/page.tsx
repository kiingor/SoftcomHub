import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canViewDashboard } from '@/lib/permissions'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user permissions to redirect to correct area
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('permissoes:permissao_id(can_view_dashboard)')
    .eq('email', user.email)
    .maybeSingle()

  redirect(canViewDashboard(colaborador?.permissoes) ? '/dashboard' : '/workdesk')
}
