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
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      // Check user permissions - must have dashboard access
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id, ativo, permissoes:permissao_id(can_view_dashboard)')
        .eq('email', data.user.email)
        .maybeSingle()

      if (!colaborador) {
        throw new Error('Voce nao tem permissao para acessar o sistema')
      }

      if (!colaborador.ativo) {
        throw new Error('Sua conta esta desativada. Entre em contato com o administrador.')
      }

      const canViewDashboard = colaborador?.permissoes?.can_view_dashboard ?? false
      
      if (!canViewDashboard) {
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
    <div className="flex min-h-svh">
      {/* Left Side - Branding */}
      <div className="relative hidden w-1/2 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 lg:flex lg:flex-col lg:justify-between p-12">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-white blur-3xl" />
        </div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">Dashboard</span>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 space-y-6"
        >
          <h1 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
            Gerencie seu
            <br />
            atendimento
          </h1>
          <p className="max-w-md text-lg text-white/80">
            Painel administrativo completo para gestao de equipes, setores e metricas de atendimento.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.text}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <feature.icon className="h-5 w-5 text-white" />
                <span className="text-sm font-medium text-white">{feature.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative z-10 flex items-center justify-between"
        >
          <p className="text-sm text-white/60">
            Acesso exclusivo para administradores
          </p>
          <img src="/logo-softcom.svg" alt="Softcom" className="h-6 opacity-70" />
        </motion.div>
      </div>

      {/* Right Side - Login Form */}
      <div className="relative flex w-full flex-col justify-center px-8 py-12 lg:w-1/2 lg:px-16 xl:px-24 bg-background">
        {/* Theme Toggle */}
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        {/* Mobile Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-3 lg:hidden"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-foreground">Dashboard</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Area Administrativa
            </h2>
            <p className="mt-2 text-muted-foreground">
              Entre com suas credenciais de administrador
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@empresa.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-secondary/50 border-border/50 focus:border-violet-500 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
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
                  className="h-12 bg-secondary/50 border-border/50 pr-12 focus:border-violet-500 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              className="h-12 w-full bg-gradient-to-r from-violet-600 to-purple-600 font-semibold text-white hover:from-violet-700 hover:to-purple-700 transition-all"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
              E um atendente? <a href="/workdesk/login" className="text-violet-600 hover:underline font-medium">Acesse o WorkDesk</a>
            </p>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12 grid grid-cols-3 gap-4 border-t border-border/50 pt-8"
          >
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">Admin</p>
              <p className="text-xs text-muted-foreground">Nivel</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">Full</p>
              <p className="text-xs text-muted-foreground">Acesso</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-violet-600">Ativo</p>
              <p className="text-xs text-muted-foreground">Status</p>
            </div>
          </motion.div>

          {/* Softcom Logo - Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 flex justify-center"
          >
            <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
