'use client'

import { Component, type ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex min-h-[200px] items-center justify-center p-8">
          <div className="glass-surface-modal max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--glass-tone-danger-bg)] flex items-center justify-center">
              <AppIcon name="alertOutline" size={24} className="text-[var(--glass-tone-danger-fg)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              Something went wrong
            </h3>
            <p className="text-sm text-[var(--glass-text-secondary)]">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
