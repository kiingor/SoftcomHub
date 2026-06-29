'use client'

import React from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Headphones, Eye, EyeOff, ArrowRight, MessageCircle, Zap, Users, Clock, ArrowLeft, Mail } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'

type View = 'login' | 'forgot' | 'forgot-sent'

export default function WorkdeskLoginPage() {
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
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
      // Try master login first
      const masterRes = await fetch('/api/auth/master-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const masterBody = await masterRes.json().catch(() => ({}))

      if (masterRes.ok && masterBody.session) {
        // Sign out any existing session first to avoid conflicts
        await supabase.auth.signOut({ scope: 'local' })
        // Set the new session from master login
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: masterBody.session.access_token,
          refresh_token: masterBody.session.refresh_token,
        })
        if (sessionError) {
          throw new Error('Erro ao definir sessão. Tente novamente.')
        }
        // Verify we got the correct user session
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || user.email?.toLowerCase() !== masterBody.targetEmail?.toLowerCase()) {
          await supabase.auth.signOut()
          throw new Error('Erro de sessão: usuário incorreto. Tente novamente.')
        }
        router.push('/workdesk')
        return
      }

      // If not master password, do normal login
      if (masterBody.error && masterBody.error !== 'not_master') {
        throw new Error(masterBody.error)
      }

      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      // Check if user is a colaborador
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id, ativo')
        .eq('email', data.user.email)
        .single()

      if (!colaborador) {
        throw new Error('Voce nao tem permissao para acessar o WorkDesk')
      }

      if (!colaborador.ativo) {
        throw new Error('Sua conta esta desativada. Entre em contato com o administrador.')
      }

      router.push('/workdesk')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao fazer login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
        redirectTo: `${origin}/workdesk/reset-password`,
      })
      if (error) throw error
      setView('forgot-sent')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao enviar e-mail de recuperacao')
    } finally {
      setIsLoading(false)
    }
  }

  const goToForgot = () => {
    setForgotEmail(email)
    setError(null)
    setView('forgot')
  }

  const goToLogin = () => {
    setError(null)
    setView('login')
  }

  const features = [
    { icon: MessageCircle, text: 'Chat em tempo real' },
    { icon: Zap, text: 'Respostas rapidas' },
    { icon: Users, text: 'Gestao de filas' },
    { icon: Clock, text: 'Historico completo' },
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
            <Headphones className="h-5 w-5" />
          </div>
          <div className="leading-none">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Softcom · Atendimento
            </p>
            <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
              WorkDesk
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
            Central de atendimento
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground xl:text-5xl">
            Pronto para atender?
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
            Sua central de atendimento ao cliente. Conecte-se e faca a diferenca em cada conversa.
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
              Atendimento de qualidade comeca aqui
            </p>
          </div>
          <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-70 dark:invert" />
        </motion.div>
      </div>

      {/* Right Side - Form */}
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
            <Headphones className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">WorkDesk</span>
        </motion.div>

        <div className="mx-auto w-full max-w-sm">
          <AnimatePresence mode="wait">

            {/* ── LOGIN ── */}
            {view === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="anim-rise"
              >
                <div className="mb-8">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Entrar
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    Bom te ver!
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Entre com suas credenciais para acessar sua area de trabalho
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
                      placeholder="seu@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="glass-input h-11 shadow-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium text-foreground">
                        Senha
                      </Label>
                      <button
                        type="button"
                        onClick={goToForgot}
                        className="rounded text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Esqueceu sua senha?
                      </button>
                    </div>
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
                        Acessar WorkDesk
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    )}
                  </Button>
                </form>

                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    E um administrador?{' '}
                    <a
                      href="/login"
                      className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Acesse o Dashboard
                    </a>
                  </p>
                </div>

                {/* Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-12 grid grid-cols-3 divide-x divide-border rounded-md border border-border"
                >
                  <div className="px-3 py-4 text-center">
                    <p className="tabnums text-sm font-semibold tracking-tight text-foreground">24/7</p>
                    <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Suporte</p>
                  </div>
                  <div className="px-3 py-4 text-center">
                    <p className="tabnums text-sm font-semibold tracking-tight text-foreground">99%</p>
                    <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Uptime</p>
                  </div>
                  <div className="px-3 py-4 text-center">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <span className="signal-dot" aria-hidden="true" />
                      <span className="text-sm font-semibold tracking-tight text-foreground">Ativo</span>
                    </span>
                    <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                  </div>
                </motion.div>

                {/* Softcom Logo */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8 flex justify-center"
                >
                  <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
                </motion.div>
              </motion.div>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {view === 'forgot' && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  type="button"
                  onClick={goToLogin}
                  className="mb-6 flex items-center gap-2 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </button>

                <div className="mb-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                    Recuperar senha
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Informe seu e-mail e enviaremos um link para redefinir sua senha.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-sm font-medium text-foreground">
                      E-mail
                    </Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="glass-input h-11 shadow-none"
                    />
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
                        Enviando...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        Enviar link de recuperacao
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    )}
                  </Button>
                </form>

                <div className="mt-8 flex justify-center">
                  <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
                </div>
              </motion.div>
            )}

            {/* ── FORGOT SENT ── */}
            {view === 'forgot-sent' && (
              <motion.div
                key="forgot-sent"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="text-center"
              >
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-secondary">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                </div>

                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  E-mail enviado!
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Enviamos um link de recuperacao para{' '}
                  <span className="font-medium text-foreground">{forgotEmail}</span>.
                  <br />
                  Verifique sua caixa de entrada e spam.
                </p>

                <div className="mt-8 rounded-md border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
                  O link expira em <span className="font-medium text-foreground">1 hora</span>.
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={goToLogin}
                  className="mt-8 h-11 w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Button>

                <div className="mt-8 flex justify-center">
                  <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
