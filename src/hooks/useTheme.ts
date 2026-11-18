import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'ats-lens-theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === 'dark' || t === 'light' ? t : null
  } catch {
    return null
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Follow the OS until the user picks explicitly.
  useEffect(() => {
    if (storedTheme()) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* private mode etc. */
      }
      return next
    })
  }, [])

  return [theme, toggle]
}
