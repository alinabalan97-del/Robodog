/**
 * src/mocks/browser.ts
 *
 * Boots the MSW worker in the browser. Called from main.ts in dev only.
 * Requires public/mockServiceWorker.js (the worker script MSW serves through).
 */

import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

/** Start mocking. Resolves once the worker is ready, so app boot can await it. */
export function startMocks () {
  return worker.start({
    // Don't warn on requests we deliberately let hit the network (assets, fonts).
    onUnhandledRequest: 'bypass',
  })
}
