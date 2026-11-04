// Wat je in het HQ bekijkt: buiten of een verdieping, en wie of welk kantoor geselecteerd is.
import { useSyncExternalStore } from 'react';

export interface UiState {
  /** -1 = buiten, anders het niveau van de verdieping. */
  level: number;
  /** Geselecteerde agent, rol of kantoor (id). */
  focus: string | null;
  hoverLevel: number | null;
  /** Telt op bij elke "camera opnieuw richten". */
  aim: number;
}

let state: UiState = { level: -1, focus: null, hoverLevel: null, aim: 0 };
const subs = new Set<() => void>();

export const ui = {
  get: () => state,
  set(p: Partial<UiState>) {
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
  go(level: number, focus: string | null = null) {
    state = { ...state, level, focus, aim: state.aim + 1 };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => sel(state));
}
