import { Suspense } from 'react'
import { WidgetRoot } from '@/components/widget/WidgetRoot'

interface PageProps {
  searchParams: Promise<{ key?: string }>
}

export const metadata = {
  robots: 'noindex',
  title: 'SoftcomHub - Chat Widget',
}

function WidgetLoader({ widgetKey }: { widgetKey: string }) {
  return <WidgetRoot widgetKey={widgetKey} />
}

export default async function WidgetPage({ searchParams }: PageProps) {
  const params = await searchParams
  const widgetKey = params.key

  if (!widgetKey) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-gray-100">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800">
            Configuração inválida
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Widget key não fornecido
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-white">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Carregando…</div>}>
        <WidgetLoader widgetKey={widgetKey} />
      </Suspense>
    </div>
  )
}
