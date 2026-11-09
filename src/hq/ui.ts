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
  /** Rondloopmodus: je loopt als mens door het gebouw. */
  walk: boolean;
  /** Muis vrij (Esc): het menu staat open en je staat stil. */
  walkPaused: boolean;
  /** Geen muisvergrendeling mogelijk: rondkijken door te slepen. */
  walkDrag: boolean;
  /** Plek om te starten: id van een ruimte, -1 = buiten voor de deur (achter # staat een teller voor opnieuw springen). */
  walkSpot: string;
  /** Naam van de ruimte waar je nu staat. */
  walkRoom: string;
  /** Camera: over je schouder of door je eigen ogen. */
  walkView: 'derde' | 'eerste';
  /** Wat je hier kan doen: 'pingpong', 'pool' of 'bel:<id>'. */
  walkHint: string;
  /** Korte melding onderaan. */
  walkMelding: string;
  /** Aan welke speltafel je speelt. */
  spel: 'pingpong' | 'pool' | null;
}

let state: UiState = { level: -1, focus: null, hoverLevel: null, aim: 0, walk: false, walkPaused: false, walkDrag: false, walkSpot: '-1', walkRoom: '', walkView: 'derde', walkHint: '', walkMelding: '', spel: null };
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
