// Online komt het werk van de agents via de verbinding van het kantoor binnen (call.ts), lokaal via /activity.
// Deze kleine bus verbindt call.ts met model.ts zonder dat ze elkaar moeten importeren.
import type { LiveEvent } from '../types';

type Luisteraar = (e: LiveEvent & { tijd?: string }) => void;
const luisteraars = new Set<Luisteraar>();

export function opAgentWerk(f: Luisteraar) {
  luisteraars.add(f);
  return () => void luisteraars.delete(f);
}

export function meldAgentWerk(lijst: unknown) {
  if (!Array.isArray(lijst)) return;
  for (const e of lijst) if (e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string') luisteraars.forEach((f) => f(e as LiveEvent));
}
