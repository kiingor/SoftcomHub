'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { Headphones, Eye, EyeOff, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'

type Status = 'idle' | 'loading' | 'success' | 'error' | 'invalid'

function getRecoveryErrorMessage(url: URL) {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  const errorCode = url.searchParams.get('error_code') || hashParams.get('error_code')
  const errorDescription = url.searchParams.get('error_description') || hashParams.get('error_description')

  if (errorCode === 'otp_expired') {
    return 'Este link expirou ou ja foi usado. Solicite um novo link de recuperacao.'
  }

  if (errorDescription) {
    return decodeURIComponent(errorDescription.replace(/\+/g, ' '))
  }

  return 'Este link de recuperacao e invalido ou expirou. Solicite um novo link.'
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [checkingLink, setCheckingLink] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
        setCheckingLink(false)
      }
    })

    async function prepareRecoverySession() {
      const url = new URL(window.location.href)
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
      const hasError = url.searchParams.has('error') || hashParams.has('error')
      const tokenHash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type')
      const code = url.searchParams.get('code')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (hasError) {
        setError(getRecoveryErrorMessage(url))
        setStatus('invalid')
        setCheckingLink(false)
        return
      }

      // Preferred flow: token_hash is only consumed when our JS runs verifyOtp,
      // so email security scanners that pre-click the link don't burn the OTP.
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'recovery') || 'recovery',
        })
        if (error) {
          setError(error.message)
          setStatus('invalid')
        } else {
          setSessionReady(true)
        }
        setCheckingLink(false)
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError(error.message)
          setStatus('invalid')
        } else {
          setSessionReady(true)
        }
        setCheckingLink(false)
        return
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setError(error.message)
          setStatus('invalid')
        } else {
          setSessionReady(true)
        }
        setCheckingLink(false)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (data.session) setSessionReady(true)
      else setStatus('invalid')
      setCheckingLink(false)
    }

    prepareRecoverySession().catch((error) => {
      setError(error instanceof Error ? error.message : 'Erro ao validar link de recuperacao.')
      setStatus('invalid')
      setCheckingLink(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas nao coincidem.')
      return
    }

    setStatus('loading')
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setStatus('error')
      return
    }

    setStatus('success')
    // Redirect after short delay so the user can read the success message
    setTimeout(() => router.push('/workdesk/login'), 3000)
  }

  const passwordStrength = (() => {
    if (!password) return null
    if (password.length < 6) return { label: 'Muito curta', color: 'bg-red-500', width: 'w-1/4', text: 'text-red-500' }
    if (password.length < 8) return { label: 'Fraca', color: 'bg-orange-500', width: 'w-2/4', text: 'text-orange-500' }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { label: 'Media', color: 'bg-yellow-500', width: 'w-3/4', text: 'text-yellow-600 dark:text-yellow-500' }
    return { label: 'Forte', color: 'bg-emerald-500', width: 'w-full', text: 'text-emerald-600 dark:text-emerald-500' }
  })()

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
            Recuperacao de acesso
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground xl:text-5xl">
            Nova senha, novo acesso.
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
            Defina uma senha segura para retomar seus atendimentos.
          </p>
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

      {/* Right Side */}
      <div className="relative flex w-full flex-col justify-center bg-background px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="anim-rise mx-auto w-full max-w-sm"
        >
          {/* Success State */}
          {status === 'success' ? (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-secondary">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Senha redefinida!</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Sua senha foi atualizada com sucesso.
                <br />
                Redirecionando para o login...
              </p>
              <div className="mt-6 flex justify-center">
                <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3 }}
                  />
                </div>
              </div>
            </div>
          ) : checkingLink ? (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Validando link</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Aguarde enquanto preparamos a redefinicao da senha.
              </p>
            </div>
          ) : !sessionReady ? (
            /* Invalid / expired link */
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Link invalido</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {error || 'Este link de recuperacao e invalido ou expirou.'}
              </p>
              <Button
                onClick={() => router.push('/workdesk/login')}
                className="mt-8 h-11 w-full font-semibold"
              >
                Ir para o login
              </Button>
            </div>
          ) : (
            /* Reset Form */
            <>
              <div className="mb-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  Redefinir senha
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Escolha uma nova senha para sua conta.
                </p>
              </div>

              <form onSubmit={handleReset} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium text-foreground">
                    Nova senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimo 6 caracteres"
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

                  {/* Password strength bar */}
                  {passwordStrength && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-1"
                    >
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <motion.div
                          className={`h-full rounded-full ${passwordStrength.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: passwordStrength.width }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className={`text-xs font-medium ${passwordStrength.text}`}>
                        Forca: {passwordStrength.label}
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                    Confirmar nova senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repita a nova senha"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="glass-input h-11 pr-11 shadow-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-destructive">As senhas nao coincidem.</p>
                  )}
                  {confirm && password === confirm && confirm.length > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">Senhas coincidem.</p>
                  )}
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
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Salvando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      Salvar nova senha
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-10 flex justify-center"
          >
            <img src="/logo-softcom.svg" alt="Softcom" className="h-5 opacity-50 dark:invert" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
