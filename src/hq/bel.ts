// Een inkomende videocall moet opvallen, ook met het HQ in een achtergrondtab:
// een kort belgeluid (WebAudio, tot je opneemt, weigert of 30 s), een knipperende titel van het tabblad,
// en een melding van het systeem als de founder dat eerder toeliet (enkel na een klik gevraagd).

const BEL_S = 30;
const TITEL = 'Inkomende oproep';

let audio: AudioContext | null = null;
let nr = 0;
let stopGeluid: () => void = () => {};
let geluidTimer: ReturnType<typeof setTimeout> | undefined;
let titelTimer: ReturnType<typeof setInterval> | undefined;
let titel: string | null = null;
let systeemMelding: Notification | null = null;

/**
 * Een AudioContext mag pas geluid maken na een klik of toets op de pagina. Daarom maken we hem bij de eerste
 * klik, en leggen we hem meteen stil tot er gebeld wordt (dan mag hij weer, de browser onthoudt de klik).
 */
function ontgrendel() {
  if (audio) return;
  try {
    audio = new AudioContext();
    void audio.suspend().catch(() => {});
  } catch {
    audio = null;
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', ontgrendel, { capture: true, passive: true });
  window.addEventListener('keydown', ontgrendel, { capture: true });
}

/**
 * Het belpatroon (twee tonen, om de 2,4 s) wordt in één keer op de klok van WebAudio gezet. Timers in een
 * achtergrondtab lopen traag, de audioklok niet. Geeft een functie terug die het geluid meteen stopt.
 */
function speel(ctx: AudioContext): () => void {
  const t0 = ctx.currentTime + 0.05;
  const einde = t0 + BEL_S;
  const tonen = (
    [
      [880, 0, 0.16],
      [660, 0.2, 0.3],
    ] as const
  ).map(([freq, start, duur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    for (let t = t0 + start; t + duur < einde; t += 2.4) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + duur);
      gain.gain.setValueAtTime(0, t + duur + 0.01);
    }
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(einde + 0.1);
    return { osc, gain };
  });
  return () => {
    for (const { osc, gain } of tonen) {
      try {
        osc.stop();
      } catch {
        /* al gestopt */
      }
      osc.disconnect();
      gain.disconnect();
    }
  };
}

export const meldingenMogelijk = () => typeof window !== 'undefined' && 'Notification' in window;

/** 'default' = nog niet gevraagd, 'granted' = aan, 'denied' = geweigerd, 'niet' = deze browser kan het niet. */
export function meldingenToestemming(): NotificationPermission | 'niet' {
  return meldingenMogelijk() ? Notification.permission : 'niet';
}

/** Enkel na een klik van de founder: toestemming vragen voor meldingen (en meteen ook het belgeluid toelaten). */
export async function meldingenAanzetten(): Promise<NotificationPermission | 'niet'> {
  ontgrendel();
  if (!meldingenMogelijk()) return 'niet';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Start het bellen voor een inkomende oproep van `naam`. */
export function startBel(naam: string) {
  stopBel();
  const mijn = ++nr;

  // Geluid: kan pas als de pagina al eens aangeklikt werd; anders blijft het stil (titel en melding werken wel).
  void (async () => {
    try {
      audio ??= new AudioContext();
      if (audio.state !== 'running') await audio.resume();
    } catch {
      return;
    }
    if (mijn !== nr || !audio || audio.state !== 'running') return;
    stopGeluid = speel(audio);
    geluidTimer = setTimeout(() => {
      if (mijn !== nr) return;
      stopGeluid();
      stopGeluid = () => {};
    }, BEL_S * 1000);
  })();

  // Titel van het tabblad laten knipperen.
  titel = document.title;
  document.title = TITEL;
  let aan = true;
  titelTimer = setInterval(() => {
    aan = !aan;
    document.title = aan ? TITEL : titel ?? '';
  }, 1000);

  // Melding van het systeem, enkel als de founder niet naar het HQ kijkt.
  if (meldingenToestemming() === 'granted' && (document.hidden || !document.hasFocus())) {
    try {
      const n = new Notification(TITEL, { body: `${naam} klopt aan bij je kantoor in het HQ.`, tag: 'hq-oproep', requireInteraction: true });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      systeemMelding = n;
    } catch {
      /* bv. Android zonder service worker: dan enkel geluid en titel */
    }
  }
}

/** Stopt geluid, knipperende titel en melding (opgenomen, geweigerd, opgehangen of elders opgenomen). */
export function stopBel() {
  nr++;
  stopGeluid();
  stopGeluid = () => {};
  clearTimeout(geluidTimer);
  clearInterval(titelTimer);
  if (titel !== null) {
    document.title = titel;
    titel = null;
  }
  systeemMelding?.close();
  systeemMelding = null;
  // Weer stil leggen: een draaiende AudioContext zonder geluid kost stroom.
  if (audio?.state === 'running') void audio.suspend().catch(() => {});
}
