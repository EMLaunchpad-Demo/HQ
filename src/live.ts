// Live-activiteit van het Claude Code-team. Online is er geen activiteitslog (dat staat op de pc), lokaal wel.
import type { LiveEvent } from './types';

const listeners = new Set<(e: LiveEvent) => void>();
let started = false;

export function onActivity(l: (e: LiveEvent) => void) {
  listeners.add(l);
  if (!started) {
    started = true;
    const es = new EventSource('/activity');
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as LiveEvent;
        listeners.forEach((f) => f(e));
      } catch {
        /* onbekende regel */
      }
    };
  }
  return () => {
    listeners.delete(l);
  };
}
