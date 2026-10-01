import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Generous wait for findBy* queries: CPU-heavy AI suites run in parallel with the UI tests.
configure({ asyncUtilTimeout: 10_000 })

// jsdom does not implement scrolling; React Router's <ScrollRestoration> calls it on navigation.
window.scrollTo = () => {}

// jsdom does not implement the modal <dialog> API. Browsers do; this models just open/close.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

afterEach(() => {
  cleanup()
  // What one test leaves on the "device" (best scores, recent games) must not reach the next.
  window.localStorage.clear()
})
