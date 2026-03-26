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
        // Set the session from master login
        await supabase.auth.setSession({
          access_token: masterBody.session.access_token,
          refresh_token: masterBody.session.refresh_token,
        })
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
      const origin = window.location.origin
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
    <div className="flex min-h-svh">
      {/* Left Side - Branding */}
      <div className="relative hidden w-1/2 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 lg:flex lg:flex-col lg:justify-between p-12">
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
            <Headphones className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">WorkDesk</span>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 space-y-6"
        >
          <h1 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
            Pronto para
            <br />
            atender?
          </h1>
          <p className="max-w-md text-lg text-white/80">
            Sua central de atendimento ao cliente. Conecte-se e faca a diferenca em cada conversa.
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
            Atendimento de qualidade comeca aqui
          </p>
          <img src="/logo-softcom.svg" alt="Softcom" className="h-6 opacity-70" />
        </motion.div>
      </div>

      {/* Right Side - Form */}
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
            <Headphones className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-foreground">WorkDesk</span>
        </motion.div>

        <div className="mx-auto w-full max-w-sm">
          <AnimatePresence mode="wait">

            {/* ── LOGIN ── */}
            {view === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Bom te ver!
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    Entre com suas credenciais para acessar sua area de trabalho
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
                      placeholder="seu@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 bg-secondary/50 border-border/50 focus:border-emerald-500 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Senha
                      </Label>
                      <button
                        type="button"
                        onClick={goToForgot}
                        className="text-xs text-emerald-500 hover:text-emerald-600 transition-colors font-medium"
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
                        className="h-12 bg-secondary/50 border-border/50 pr-12 focus:border-emerald-500 focus:ring-emerald-500"
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
                    className="h-12 w-full bg-gradient-to-r from-emerald-500 to-teal-500 font-semibold text-white hover:from-emerald-600 hover:to-teal-600 transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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

                {/* Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-12 grid grid-cols-3 gap-4 border-t border-border/50 pt-8"
                >
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">24/7</p>
                    <p className="text-xs text-muted-foreground">Suporte</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">99%</p>
                    <p className="text-xs text-muted-foreground">Uptime</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-500">Ativo</p>
                    <p className="text-xs text-muted-foreground">Status</p>
                  </div>
                </motion.div>

                {/* Softcom Logo */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  type="button"
                  onClick={goToLogin}
                  className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </button>

                <div className="mb-8">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                    <Mail className="h-7 w-7 text-emerald-500" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Recuperar senha
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    Informe seu e-mail e enviaremos um link para redefinir sua senha.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-sm font-medium">
                      E-mail
                    </Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-12 bg-secondary/50 border-border/50 focus:border-emerald-500 focus:ring-emerald-500"
                    />
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
                    className="h-12 w-full bg-gradient-to-r from-emerald-500 to-teal-500 font-semibold text-white hover:from-emerald-600 hover:to-teal-600 transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="text-center"
              >
                <div className="mb-6 flex justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
                    <Mail className="h-10 w-10 text-emerald-500" />
                  </div>
                </div>

                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  E-mail enviado!
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Enviamos um link de recuperacao para{' '}
                  <span className="font-medium text-foreground">{forgotEmail}</span>.
                  <br />
                  Verifique sua caixa de entrada e spam.
                </p>

                <div className="mt-8 rounded-lg bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
                  O link expira em <span className="font-medium text-foreground">1 hora</span>.
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={goToLogin}
                  className="mt-8 h-12 w-full"
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
