import { useEffect } from 'react'

const APP_NAME = 'Cyan Arcade'

/** Sets the browser tab title to "<title> · Cyan Arcade" while the calling page is mounted. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
