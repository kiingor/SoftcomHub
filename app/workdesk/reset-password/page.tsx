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

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()

  // Supabase sends the recovery token via hash fragment (#access_token=...).
  // The browser client automatically exchanges it for a session when we call
  // onAuthStateChange and receives the PASSWORD_RECOVERY event.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    // Also check if already in a valid session (e.g. page refresh after exchange)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true)
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
    if (password.length < 6) return { label: 'Muito curta', color: 'bg-red-500', width: 'w-1/4' }
    if (password.length < 8) return { label: 'Fraca', color: 'bg-orange-500', width: 'w-2/4' }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { label: 'Media', color: 'bg-yellow-500', width: 'w-3/4' }
    return { label: 'Forte', color: 'bg-emerald-500', width: 'w-full' }
  })()

  return (
    <div className="flex min-h-svh">
      {/* Left Side - Branding */}
      <div className="relative hidden w-1/2 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 lg:flex lg:flex-col lg:justify-between p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-white blur-3xl" />
        </div>

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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 space-y-4"
        >
          <h1 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
            Nova senha,
            <br />
            novo acesso.
          </h1>
          <p className="max-w-md text-lg text-white/80">
            Defina uma senha segura para retomar seus atendimentos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative z-10 flex items-center justify-between"
        >
          <p className="text-sm text-white/60">Atendimento de qualidade comeca aqui</p>
          <img src="/logo-softcom.svg" alt="Softcom" className="h-6 opacity-70" />
        </motion.div>
      </div>

      {/* Right Side */}
      <div className="relative flex w-full flex-col justify-center px-8 py-12 lg:w-1/2 lg:px-16 xl:px-24 bg-background">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-auto w-full max-w-sm"
        >
          {/* Success State */}
          {status === 'success' ? (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
                  <ShieldCheck className="h-10 w-10 text-emerald-500" />
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Senha redefinida!</h2>
              <p className="mt-3 text-muted-foreground">
                Sua senha foi atualizada com sucesso.
                <br />
                Redirecionando para o login...
              </p>
              <div className="mt-6 flex justify-center">
                <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3 }}
                  />
                </div>
              </div>
            </div>
          ) : !sessionReady ? (
            /* Invalid / expired link */
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Link invalido</h2>
              <p className="mt-3 text-muted-foreground">
                Este link de recuperacao e invalido ou expirou.
                <br />
                Solicite um novo link de redefinicao.
              </p>
              <Button
                onClick={() => router.push('/workdesk/login')}
                className="mt-8 h-12 w-full bg-gradient-to-r from-emerald-500 to-teal-500 font-semibold text-white hover:from-emerald-600 hover:to-teal-600"
              >
                Ir para o login
              </Button>
            </div>
          ) : (
            /* Reset Form */
            <>
              <div className="mb-8">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <ShieldCheck className="h-7 w-7 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Redefinir senha
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Escolha uma nova senha para sua conta.
                </p>
              </div>

              <form onSubmit={handleReset} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium">
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
                      <p className={`text-xs font-medium ${
                        passwordStrength.label === 'Forte' ? 'text-emerald-500' :
                        passwordStrength.label === 'Media' ? 'text-yellow-500' : 'text-orange-500'
                      }`}>
                        Forca: {passwordStrength.label}
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
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
                      className="h-12 bg-secondary/50 border-border/50 pr-12 focus:border-emerald-500 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-destructive">As senhas nao coincidem.</p>
                  )}
                  {confirm && password === confirm && confirm.length > 0 && (
                    <p className="text-xs text-emerald-500">Senhas coincidem.</p>
                  )}
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
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
