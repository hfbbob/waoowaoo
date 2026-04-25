'use client'

import { SessionProvider } from "next-auth/react"
import { ToastProvider } from "@/contexts/ToastContext"
import { QueryProvider } from "@/components/providers/QueryProvider"
import { ErrorBoundary } from "@/components/ErrorBoundary"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SessionProvider
        refetchOnWindowFocus={false}
        refetchInterval={0}
      >
        <QueryProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </QueryProvider>
      </SessionProvider>
    </ErrorBoundary>
  )
}
