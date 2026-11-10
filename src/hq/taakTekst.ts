// Wat er in het HQ boven een agent staat: geen ruwe opdrachttekst, maar een leesbare naam van de taak.
// Dezelfde regels staan in scripts/activity-hook.mjs (die schrijft het logboek).

const hoofdletter = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Maakt de taaknaam leesbaar. null = geen nieuwe taak (bv. een melding dat een collega klaar is): de agent werkt
 * dan gewoon verder aan wat hij deed.
 */
export function schoneTaak(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^<task-notification\b/i.test(s)) return null;
  const gepland = /<scheduled-task\b[^>]*\bname="([^"]+)"/i.exec(s);
  if (gepland) return `Geplande taak: ${hoofdletter(gepland[1].replace(/^em-launchpad-/, '').replace(/-/g, ' '))}`;
  const zonderTags = s.replace(/<[^>]*>?/g, ' ').replace(/\s+/g, ' ').trim();
  return zonderTags || '';
}

export const kort = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
