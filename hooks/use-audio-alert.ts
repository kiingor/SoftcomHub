'use client'

import { useCallback, useRef, useEffect } from 'react'

export type AlertType = 'new_ticket' | 'new_message'
export type TicketSoundType = 'default' | 'buhbuh'

const BUHBUH_URL = 'https://wgmcavssrufxgwvjxwms.supabase.co/storage/v1/object/public/whatsapp-media/buhbuh.mp3'

export function useAudioAlert() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioEnabledRef = useRef(true)
  const userInteractedRef = useRef(false)
  const ticketSoundTypeRef = useRef<TicketSoundType>('default')

  // Get or create AudioContext (must be after user interaction)
  const getContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== 'undefined') {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch {
        return null
      }
    }
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended') {
      ctx.resume()
    }
    return ctx
  }, [])

  // Initialize on first user interaction (click/keypress anywhere)
  const initAudioContext = useCallback(() => {
    if (!userInteractedRef.current) {
      userInteractedRef.current = true
      getContext()
    }
  }, [getContext])

  // Register global interaction listener to unlock audio
  useEffect(() => {
    const handler = () => {
      if (!userInteractedRef.current) {
        userInteractedRef.current = true
        getContext()
      }
    }
    document.addEventListener('click', handler, { once: false })
    document.addEventListener('keydown', handler, { once: false })
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [getContext])

  // Generate a tone with attack/release envelope
  const playTone = useCallback((ctx: AudioContext, frequency: number, startTime: number, duration: number, volume: number) => {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    // Smooth envelope
    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01)
    gainNode.gain.setValueAtTime(volume, startTime + duration - 0.02)
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  }, [])

  // Play the buhbuh MP3 via HTMLAudioElement
  const playBuhBuh = useCallback(() => {
    try {
      const audio = new Audio(BUHBUH_URL)
      audio.volume = 0.8
      audio.play().catch((err) => {
        console.warn('[AudioAlert] Falha ao reproduzir buhbuh:', err)
      })
    } catch (err) {
      console.error('[AudioAlert] Erro ao criar Audio buhbuh:', err)
    }
  }, [])

  // Play notification sound entirely via Web Audio API
  const playAlert = useCallback((type: AlertType) => {
    if (!audioEnabledRef.current || !userInteractedRef.current) return

    if (type === 'new_ticket' && ticketSoundTypeRef.current === 'buhbuh') {
      playBuhBuh()
      return
    }

    const ctx = getContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime

      if (type === 'new_ticket') {
        // Three ascending tones - distinctive "new ticket" sound
        playTone(ctx, 523, now, 0.12, 0.35)        // C5
        playTone(ctx, 659, now + 0.14, 0.12, 0.35)  // E5
        playTone(ctx, 784, now + 0.28, 0.18, 0.35)  // G5
      } else {
        // Single short "pop" - subtle message notification
        playTone(ctx, 880, now, 0.08, 0.25)          // A5
      }
    } catch (error) {
      console.error('Error playing alert:', error)
    }
  }, [getContext, playTone, playBuhBuh])

  // Toggle audio
  const setAudioEnabled = useCallback((enabled: boolean) => {
    audioEnabledRef.current = enabled
    if (typeof window !== 'undefined') {
      localStorage.setItem('audioAlertsEnabled', enabled.toString())
    }
  }, [])

  const isAudioEnabled = useCallback(() => {
    return audioEnabledRef.current
  }, [])

  // Set ticket sound type
  const setTicketSoundType = useCallback((type: TicketSoundType) => {
    ticketSoundTypeRef.current = type
    if (typeof window !== 'undefined') {
      localStorage.setItem('ticketSoundType', type)
    }
  }, [])

  const getTicketSoundType = useCallback((): TicketSoundType => {
    return ticketSoundTypeRef.current
  }, [])

  // Load saved preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEnabled = localStorage.getItem('audioAlertsEnabled')
      audioEnabledRef.current = savedEnabled !== 'false'

      const savedSoundType = localStorage.getItem('ticketSoundType') as TicketSoundType | null
      if (savedSoundType === 'buhbuh' || savedSoundType === 'default') {
        ticketSoundTypeRef.current = savedSoundType
      }
    }
  }, [])

  return {
    playAlert,
    setAudioEnabled,
    isAudioEnabled,
    initAudioContext,
    setTicketSoundType,
    getTicketSoundType,
    playBuhBuh,
  }
}
