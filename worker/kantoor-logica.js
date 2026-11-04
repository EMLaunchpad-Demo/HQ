// De regels van het kantoor: welke call-berichtjes mogen, en naar welk tabblad ze gaan.
// Zuivere functies zonder Cloudflare: het Durable Object (worker.js) en de lokale dev-server (server/hq.ts)
// gebruiken exact dezelfde regels, en scripts/hq-worker-test.mjs test ze zonder Cloudflare.
//
// Een verbinding (één tabblad) is { wie, sid, sinds, belt, gesprek }:
//   wie      founder-id uit de login (nooit uit het bericht zelf)
//   sid      sessie-id van dat tabblad (crypto.randomUUID() in de Worker)
//   sinds    tijdstip van verbinden (ms), om bij te veel tabbladen het oudste te sluiten
//   belt     id van wie dit tabblad nu belt (rinkelt nog), anders null
//   gesprek  { wie, sid } van het tabblad waarmee dit tabblad in gesprek is, anders null

export const SOORTEN = ['bellen', 'aanvaard', 'aanbod', 'antwoord', 'ice', 'geweigerd', 'bezet', 'ophangen', 'elders'];
/** Grootste bericht dat we aanvaarden (een SDP-aanbod is een paar KB). */
export const MAX_BERICHT = 64 * 1024;
/** Hoeveel tabbladen of toestellen één persoon tegelijk mag hebben. */
export const MAX_PER_PERSOON = 3;
/** Close-code voor het oudste tabblad als er te veel zijn (de browser verbindt dan niet opnieuw). */
export const SLUIT_TE_VEEL = 4000;
export const SID_PATROON = /^[A-Za-z0-9-]{8,64}$/;

const MAX_SDP = 60_000;
/** Na deze berichtjes is het gesprek (of de oproep) voorbij. */
const EINDE = new Set(['ophangen', 'geweigerd', 'bezet']);

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const tekstOfNull = (x, max) => (x == null ? null : typeof x === 'string' && x.length <= max ? x : undefined);

export function nieuweVerbinding(wie, sid, sinds = Date.now()) {
  return { wie, sid, sinds, belt: null, gesprek: null };
}

/**
 * Controleert een ruw bericht van een tabblad. Geeft { naar, soort, naarSid, data } terug, of null als het niet mag.
 * `van` is de afzender (uit de login), `bekend` de founder-id's die mogen meedoen.
 * Enkel de velden die WebRTC nodig heeft gaan verder; al de rest valt weg.
 */
export function valideerBericht(raw, van, bekend) {
  let tekst;
  if (typeof raw === 'string') {
    if (raw.length > MAX_BERICHT || new TextEncoder().encode(raw).length > MAX_BERICHT) return null;
    tekst = raw;
  } else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    if (raw.byteLength > MAX_BERICHT) return null;
    tekst = new TextDecoder().decode(raw);
  } else return null;

  let m;
  try {
    m = JSON.parse(tekst);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  const ids = bekend instanceof Set ? bekend : new Set(bekend ?? []);
  const { naar, soort } = m;
  if (typeof soort !== 'string' || !SOORTEN.includes(soort)) return null;
  if (typeof naar !== 'string' || !ids.has(naar) || naar === van) return null;
  let naarSid = null;
  if (m.naarSid != null) {
    if (typeof m.naarSid !== 'string' || !SID_PATROON.test(m.naarSid)) return null;
    naarSid = m.naarSid;
  }
  const data = valideerData(soort, m.data);
  if (data === undefined) return null;
  return { naar, soort, naarSid, data };
}

/** Gegevens per soort: een SDP-aanbod of -antwoord, een ICE-kandidaat, of niets. undefined = ongeldig. */
export function valideerData(soort, d) {
  if (soort === 'aanbod' || soort === 'antwoord') {
    const type = soort === 'aanbod' ? 'offer' : 'answer';
    if (!isObject(d) || d.type !== type || typeof d.sdp !== 'string' || d.sdp.length > MAX_SDP) return undefined;
    return { type, sdp: d.sdp };
  }
  if (soort === 'ice') {
    if (!isObject(d) || typeof d.candidate !== 'string' || d.candidate.length > 2000) return undefined;
    const sdpMid = tekstOfNull(d.sdpMid, 64);
    const usernameFragment = tekstOfNull(d.usernameFragment, 256);
    const idx = d.sdpMLineIndex;
    const sdpMLineIndex = idx == null ? null : Number.isInteger(idx) && idx >= 0 && idx < 1024 ? idx : undefined;
    if (sdpMid === undefined || usernameFragment === undefined || sdpMLineIndex === undefined) return undefined;
    return { candidate: d.candidate, sdpMid, sdpMLineIndex, usernameFragment };
  }
  // bellen, aanvaard, geweigerd, bezet, ophangen, elders: geen gegevens nodig.
  return null;
}

/** Het tabblad waarmee `s` in gesprek is, maar enkel als dat tabblad er nog is en ook naar `s` wijst. */
function partnerVan(lijst, s) {
  const g = s.gesprek;
  if (!g) return null;
  const p = lijst.find((x) => x.sid === g.sid && x.wie === g.wie);
  return p && p.gesprek?.sid === s.sid ? p : null;
}

const levering = (sid, van, soort, data = null) => ({ sid, bericht: { event: 'bericht', data: { van: van.wie, vanSid: van.sid, soort, data } } });

/**
 * Waar gaat een (gevalideerd) bericht van tabblad `vanSid` naartoe?
 * Geeft { leveringen: [{ sid, bericht }], wijzigingen: [{ sid, ...velden }] } terug; de aanroeper stuurt en bewaart.
 *
 * - "bellen" gaat naar alle tabbladen van de ontvanger.
 * - "aanvaard" gaat enkel naar het tabblad dat belt; de andere tabbladen van wie opneemt krijgen "elders".
 * - Daarna gaan de berichtjes enkel nog tussen die twee tabbladen.
 * - Een tabblad dat niet in het lopende gesprek zit, kan het niet afbreken (zijn berichtjes vallen weg).
 * - Een bericht met naarSid gaat enkel naar dat tabblad.
 */
export function routeer(lijst, vanSid, b) {
  const g = { leveringen: [], wijzigingen: [] };
  const ik = lijst.find((s) => s.sid === vanSid);
  if (!ik || b.naar === ik.wie) return g;
  const zijn = lijst.filter((s) => s.wie === b.naar);
  const door = (aan) => aan.forEach((s) => g.leveringen.push(levering(s.sid, ik, b.soort, b.data)));
  const zet = (sid, velden) => g.wijzigingen.push({ sid, ...velden });
  const nietOnline = () => {
    g.leveringen.push({ sid: ik.sid, bericht: { event: 'niet-online', data: { naar: b.naar, soort: b.soort, ...(b.naarSid ? { naarSid: b.naarSid } : {}) } } });
    return g;
  };
  if (!zijn.length) return nietOnline();

  const mijnPartner = partnerVan(lijst, ik);
  const metNaar = mijnPartner?.wie === b.naar ? mijnPartner : null;
  // Een ander tabblad van dezelfde persoon dat al in gesprek is met de ontvanger.
  const elders = metNaar ? null : lijst.find((s) => s.wie === ik.wie && s.sid !== ik.sid && partnerVan(lijst, s)?.wie === b.naar);

  if (b.soort === 'bellen') {
    if (elders) {
      g.leveringen.push(levering(ik.sid, partnerVan(lijst, elders), 'bezet'));
      return g;
    }
    // Wie opnieuw belt, is klaar met zijn vorige gesprek.
    if (mijnPartner) {
      zet(ik.sid, { gesprek: null });
      zet(mijnPartner.sid, { gesprek: null });
    }
    zet(ik.sid, { belt: b.naar });
    door(zijn);
    return g;
  }

  // Bv. "Nu niet" of "Ophangen" in een tweede venster terwijl het gesprek in het eerste loopt: negeren.
  if (elders) return g;

  if (metNaar) {
    const aan = b.naarSid && b.naarSid !== metNaar.sid ? zijn.filter((s) => s.sid === b.naarSid) : [metNaar];
    if (!aan.length) return nietOnline();
    door(aan);
    if (EINDE.has(b.soort)) {
      zet(ik.sid, { gesprek: null });
      zet(metNaar.sid, { gesprek: null });
    }
    return g;
  }

  const bellers = zijn.filter((s) => s.belt === ik.wie);
  const gekozen = b.naarSid ? bellers.filter((s) => s.sid === b.naarSid) : bellers;
  const anderen = lijst.filter((s) => s.wie === ik.wie && s.sid !== ik.sid);

  if (b.soort === 'aanvaard') {
    const beller = gekozen[0];
    // Er belt niemand (meer), bv. de beller heeft net ingehaakt: laat dit tabblad stoppen.
    if (!beller) {
      g.leveringen.push(levering(ik.sid, zijn[zijn.length - 1], 'ophangen'));
      return g;
    }
    door([beller]);
    zet(beller.sid, { belt: null, gesprek: { wie: ik.wie, sid: ik.sid } });
    zet(ik.sid, { gesprek: { wie: beller.wie, sid: beller.sid } });
    anderen.forEach((s) => g.leveringen.push(levering(s.sid, beller, 'elders')));
    return g;
  }

  if (b.soort === 'geweigerd' || b.soort === 'bezet') {
    if (!gekozen.length) return g;
    door(gekozen);
    gekozen.forEach((s) => zet(s.sid, { belt: null }));
    // De oproep is beantwoord: de andere tabbladen van de ontvanger stoppen met rinkelen.
    anderen.forEach((s) => g.leveringen.push(levering(s.sid, gekozen[0], 'elders')));
    return g;
  }

  if (b.soort === 'ophangen') {
    // De beller haakt in terwijl het nog rinkelt.
    if (ik.belt === b.naar) {
      door(zijn);
      zet(ik.sid, { belt: null });
    }
    return g;
  }

  // aanbod, antwoord, ice, elders buiten een gekend gesprek.
  if (b.naarSid) {
    const aan = zijn.filter((s) => s.sid === b.naarSid);
    if (!aan.length) return nietOnline();
    door(aan);
    return g;
  }
  door(zijn);
  return g;
}

/**
 * Een tabblad valt weg. Belde het nog, dan stopt het rinkelen bij de ontvanger.
 * Een lopend gesprek breken we niet af: beeld en geluid gaan rechtstreeks, en de verbinding kan meteen terugkomen.
 */
export function bijSluiten(anderen, dicht) {
  const g = { leveringen: [], wijzigingen: [] };
  if (dicht.belt) {
    const zelfdePersoonInGesprek = anderen.some((s) => s.wie === dicht.wie && partnerVan(anderen, s)?.wie === dicht.belt);
    if (!zelfdePersoonInGesprek) for (const s of anderen) if (s.wie === dicht.belt) g.leveringen.push(levering(s.sid, dicht, 'ophangen'));
  }
  for (const s of anderen) if (s.gesprek?.sid === dicht.sid) g.wijzigingen.push({ sid: s.sid, gesprek: null });
  return g;
}

/** Welke tabbladen van `wie` moeten dicht (oudste eerst), zodat er met het nieuwe erbij maximaal `max` zijn. */
export function teSluiten(lijst, wie, max = MAX_PER_PERSOON) {
  const mijn = lijst.filter((s) => s.wie === wie).sort((a, b) => (a.sinds ?? 0) - (b.sinds ?? 0));
  return mijn.slice(0, Math.max(0, mijn.length - (max - 1))).map((s) => s.sid);
}

/** Wie er in het HQ is: per persoon, online zodra er minstens één tabblad verbonden is. */
export function aanwezig(lijst) {
  return [...new Set(lijst.map((s) => s.wie))].sort();
}

/**
 * ICE-servers van Cloudflare (TURN) netjes maken voor de browser: enkel stun:, turn: en turns:,
 * niets van Google, en zonder poort 53 (die blokkeren browsers, en dan wacht de verbinding op een timeout).
 */
export function normaliseerIce(raw) {
  const lijst = Array.isArray(raw) ? raw : isObject(raw) ? [raw] : [];
  const uit = [];
  for (const s of lijst) {
    if (!isObject(s)) continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(
      (u) => typeof u === 'string' && /^(stun|turns?):/i.test(u) && !/google/i.test(u) && !/:53(\?|$)/.test(u),
    );
    if (!urls.length) continue;
    const server = { urls };
    if (typeof s.username === 'string') server.username = s.username;
    if (typeof s.credential === 'string') server.credential = s.credential;
    uit.push(server);
  }
  return uit;
}
