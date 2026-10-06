import { Component, type ReactNode } from 'react'
import i18n from '../i18n'
import { Lean } from './lean'

/* ============================================================
   If any screen crashes, show Lean with the error and a reload button instead of a blank page.
   The error text helps to find the cause; nothing is sent anywhere.
   ============================================================ */

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Screen crashed:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <section className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <Lean pose="surprised" size={130} />
        <h1 className="mt-4 font-display text-3xl font-semibold">{i18n.t('crash.title')}</h1>
        <p className="mt-2 text-mute">{i18n.t('crash.text')}</p>
        <button onClick={() => location.reload()} className="mt-6 rounded-full bg-plum px-6 py-3 font-semibold text-paper">
          {i18n.t('crash.reload')}
        </button>
        <details className="mt-6 w-full text-left text-xs text-mute">
          <summary className="cursor-pointer">{i18n.t('crash.details')}</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3">{String(error.message || error)}</pre>
        </details>
      </section>
    )
  }
}
