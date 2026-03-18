import { useEffect } from 'react'

export default function ThemeToggle() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return null
}
