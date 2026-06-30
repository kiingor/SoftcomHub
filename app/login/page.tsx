'use client'

import React from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, Eye, EyeOff, ArrowRight, BarChart3, Settings, Shield, PieChart } from 'lucide-react'
import { motion } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'
import { canViewDashboard } from '@/lib/permissions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      // 1. Tenta o master login primeiro (admin entrando como qualquer usuário).
      const masterRes = await fetch('/api/auth/master-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const masterBody = await masterRes.json().catch(() => ({}))

      let userEmail: string | null = null

      if (masterRes.ok && masterBody.session) {
        // Assume a sessão do usuário-alvo retornada pelo endpoint.
        await supabase.auth.signOut({ scope: 'local' })
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: masterBody.session.access_token,
          refresh_token: masterBody.session.refresh_token,
        })
        if (sessionError) throw new Error('Erro ao definir sessão. Tente novamente.')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || user.email?.toLowerCase() !== masterBody.targetEmail?.toLowerCase()) {
          await supabase.auth.signOut()
          throw new Error('Erro de sessão: usuário incorreto. Tente novamente.')
        }
        userEmail = user.email ?? null
      } else {
        // Senha não é a master → login normal.
        if (masterBody.error && masterBody.error !== 'not_master') {
          throw new Error(masterBody.error)
        }
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        userEmail = data.user.email ?? null
      }

      // 2. Permissão de dashboard (vale p/ login normal e master). Sem acesso → desloga.
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id, ativo, permissoes:permissao_id(can_view_dashboard)')
        .eq('email', userEmail)
        .maybeSingle()

      if (!colaborador || !colaborador.ativo || !canViewDashboard(colaborador?.permissoes)) {
        await supabase.auth.signOut()
        if (!colaborador) throw new Error('Voce nao tem permissao para acessar o sistema')
        if (!colaborador.ativo) throw new Error('Sua conta esta desativada. Entre em contato com o administrador.')
        throw new Error('Voce nao tem permissao para acessar o Dashboard. Use o WorkDesk.')
      }

      router.push('/dashboard')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao fazer login')
    } finally {
      setIsLoading(false)
    }
  }

  const features = [
    { icon: BarChart3, text: 'Metricas em tempo real' },
    { icon: PieChart, text: 'Relatorios detalhados' },
    { icon: Settings, text: 'Gestao de setores' },
    { icon: Shield, text: 'Controle de acesso' },
  ]

  return (
    <div className="flex min-h-svh bg-background">
      {/* Left Side - Editorial Branding */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-border bg-card p-12 lg:flex xl:p-16">
        {/* Masthead */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground text-background">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="leading-none">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Softcom · Painel
            </p>
            <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
              Dashboard
            </p>
          </div>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative z-10 max-w-md"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Console de atendimento
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground xl:text-5xl">
            Gerencie seu atendimento
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
            Painel administrativo completo para gestao de equipes, setores e metricas de atendimento.
          </p>

          {/* Editorial index */}
          <div className="mt-10">
            {features.map((feature, index) => (
              <motion.div
                key={feature.text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.06 }}
                className="flex items-center gap-4 border-t border-border py-3.5 last:border-b"
              >
                <span className="tabnums text-xs font-medium text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <feature.icon className="h-4 w-4 text-foreground/70" />
                <span className="text-sm font-medium text-foreground">{feature.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 flex items-center justify-between border-t border-border pt-6"
        >
          <div className="flex items-center gap-2.5">
            <span className="signal-dot" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Acesso exclusivo para administradores
            </p>
          </div>
          <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-70 dark:invert" />
        </motion.div>
      </div>

      {/* Right Side - Login Form */}
      <div className="relative flex w-full flex-col justify-center bg-background px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        {/* Theme Toggle */}
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        {/* Mobile Logo */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex items-center gap-3 lg:hidden"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">Dashboard</span>
        </motion.div>

        <div className="anim-rise mx-auto w-full max-w-sm">
          <div className="mb-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Entrar
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Area Administrativa
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Entre com suas credenciais de administrador
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@empresa.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input h-11 shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input h-11 pr-11 shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              className="h-11 w-full font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Entrando...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  Acessar Dashboard
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              E um atendente?{' '}
              <a
                href="/workdesk/login"
                className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Acesse o WorkDesk
              </a>
            </p>
          </div>

          {/* Access summary */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-12 grid grid-cols-3 divide-x divide-border rounded-md border border-border"
          >
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-semibold tracking-tight text-foreground">Admin</p>
              <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Nivel</p>
            </div>
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-semibold tracking-tight text-foreground">Full</p>
              <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Acesso</p>
            </div>
            <div className="px-3 py-4 text-center">
              <span className="inline-flex items-center justify-center gap-1.5">
                <span className="signal-dot" aria-hidden="true" />
                <span className="text-sm font-semibold tracking-tight text-foreground">Ativo</span>
              </span>
              <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
            </div>
          </motion.div>

          {/* Softcom Logo - Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 flex justify-center"
          >
            <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
