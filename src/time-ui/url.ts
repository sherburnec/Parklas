import { createAppState, toSearch } from './state';
import type { AppStateStore } from './state';

/**
 * The shared state, started from the page's URL and written back to it (replacing the history entry, so the
 * back button is not filled with every hour change). Nothing goes to browser storage.
 */
export function createUrlState(): AppStateStore {
  const state = createAppState(window.location.search);
  state.subscribe((s) => {
    const search = toSearch(s, window.location.search);
    window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  });
  return state;
}
