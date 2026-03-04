'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  activeClassName?: string
  loadingClassName?: string
  showLoader?: boolean
  prefetch?: boolean
  onClick?: () => void
}

export function NavLink({
  href,
  children,
  className,
  activeClassName,
  loadingClassName,
  showLoader = true,
  prefetch = true,
  onClick,
}: NavLinkProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick?.()
    setIsNavigating(true)
    startTransition(() => {
      router.push(href)
    })
  }

  const isLoading = isPending || isNavigating

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={handleClick}
      className={cn(
        'relative cursor-pointer select-none transition-all active:scale-[0.98]',
        className,
        isLoading && loadingClassName
      )}
    >
      {isLoading && showLoader ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </Link>
  )
}

// Button variant for navigation
interface NavButtonProps {
  href: string
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
  onClick?: () => void
}

export function NavButton({
  href,
  children,
  className,
  variant = 'default',
  size = 'default',
  disabled,
  onClick,
}: NavButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    onClick?.()
    setIsNavigating(true)
    startTransition(() => {
      router.push(href)
    })
  }

  const isLoading = isPending || isNavigating

  const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]'
  
  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  }
  
  const sizeStyles = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
  }

  return (
    <Link
      href={href}
      prefetch
      onClick={handleClick}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        isLoading && 'opacity-80 pointer-events-none',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="sr-only">Carregando...</span>
          {typeof children === 'string' ? children : null}
        </>
      ) : (
        children
      )}
    </Link>
  )
}
