// De regels van het kantoor: welke call-berichtjes mogen, en naar welk tabblad ze gaan.
// Zuivere functies zonder Cloudflare: het Durable Object (worker.js) en de lokale dev-server (server/hq.ts)
// gebruiken exact dezelfde regels, en scripts/hq-worker-test.mjs test ze zonder Cloudflare.
//
// Een verbinding (één WebSocket van één tabblad) is { wie, sid, sinds, vorige, belt, gesprek }:
//   wie      founder-id uit de login (nooit uit het bericht zelf)
//   sid      sessie-id van deze verbinding (crypto.randomUUID() in de Worker); elke herverbinding krijgt een nieuwe
//   sinds    tijdstip van verbinden (ms), om bij te veel tabbladen het oudste te sluiten
//   vorige   sid van de vorige verbinding van hetzelfde tabblad (na een herverbinding), anders null
//   belt     id van wie dit tabblad nu belt (rinkelt nog), anders null
//   gesprek  { wie, sid } van het tabblad waarmee dit tabblad in gesprek is, anders null.
//            Valt de ander even weg (wifi-wissel, slaapstand, een nieuwe versie van het kantoor), dan blijft dit staan:
//            een "wijzer" naar een sid die er niet meer is. Komt dat tabblad terug, dan koppelt bijVerbinden het gesprek
//            aan de nieuwe verbinding. Voor het doorsturen telt een gesprek enkel als beide tabbladen er zijn en naar
//            elkaar wijzen (partnerVan); een losse wijzer doet niets.

export const SOORTEN = ['bellen', 'aanvaard', 'aanbod', 'antwoord', 'ice', 'geweigerd', 'bezet', 'ophangen', 'elders'];
/** Grootste bericht dat we aanvaarden (een SDP-aanbod is een paar KB). */
export const MAX_BERICHT = 64 * 1024;
/** Hoeveel tabbladen of toestellen één persoon tegelijk mag hebben. */
export const MAX_PER_PERSOON = 3;
/** Close-code voor het oudste tabblad als er te veel zijn (de browser verbindt dan niet opnieuw). */
export const SLUIT_TE_VEEL = 4000;
/** Close-code als de login (Cloudflare Access) van die verbinding verlopen is (de browser kijkt dan /hq/ik na). */
export const SLUIT_VERLOPEN = 4001;
export const SID_PATROON = /^[A-Za-z0-9-]{8,64}$/;
const ID_PATROON = /^[a-z0-9-]{1,40}$/;

const MAX_SDP = 60_000;
/** Na deze berichtjes is het gesprek (of de oproep) voorbij. */
const EINDE = new Set(['ophangen', 'geweigerd', 'bezet']);

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const tekstOfNull = (x, max) => (x == null ? null : typeof x === 'string' && x.length <= max ? x : undefined);
const isSid = (x) => typeof x === 'string' && SID_PATROON.test(x);

export function nieuweVerbinding(wie, sid, sinds = Date.now(), vorige = null) {
  return { wie, sid, sinds, vorige: isSid(vorige) && vorige !== sid ? vorige : null, belt: null, gesprek: null };
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
/** Het kantoor meldt dat tabblad `oud` van `wie` nu verbinding `nieuw` heeft (na een herverbinding). */
const verhuisd = (sid, wie, oud, nieuw) => ({ sid, bericht: { event: 'verhuisd', data: { wie, oud, nieuw } } });

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
  if (!zijn.length) {
    // Inhaken terwijl de ander helemaal weg is: de oproep of de wijzer naar dat gesprek is voorbij.
    if (b.soort === 'ophangen' && (ik.belt === b.naar || ik.gesprek?.wie === b.naar)) zet(ik.sid, { belt: null, gesprek: null });
    return nietOnline();
  }

  // Een naarSid van een verbinding die intussen opnieuw verbonden is, geldt voor de opvolger (hetzelfde tabblad):
  // zo komt een bericht aan dat vertrok voor de ander "verhuisd" hoorde.
  const naarSidBestaat = !!b.naarSid && lijst.some((s) => s.sid === b.naarSid);
  const isDoel = (s) => s.sid === b.naarSid || (!!b.naarSid && !naarSidBestaat && s.vorige === b.naarSid);

  const mijnPartner = partnerVan(lijst, ik);
  const metNaar = mijnPartner?.wie === b.naar ? mijnPartner : null;
  // Een ander tabblad van dezelfde persoon dat al in gesprek is met de ontvanger.
  const elders = metNaar ? null : lijst.find((s) => s.wie === ik.wie && s.sid !== ik.sid && partnerVan(lijst, s)?.wie === b.naar);

  if (b.soort === 'bellen') {
    if (elders) {
      g.leveringen.push(levering(ik.sid, partnerVan(lijst, elders), 'bezet'));
      return g;
    }
    // Wie opnieuw belt, is klaar met zijn vorige gesprek (ook met een losse wijzer naar een tabblad dat weg is).
    if (mijnPartner) zet(mijnPartner.sid, { gesprek: null });
    zet(ik.sid, { belt: b.naar, gesprek: null });
    door(zijn);
    return g;
  }

  // Bv. "Nu niet" of "Ophangen" in een tweede venster terwijl het gesprek in het eerste loopt: negeren.
  if (elders) return g;

  if (metNaar) {
    const aan = b.naarSid && !isDoel(metNaar) ? zijn.filter(isDoel) : [metNaar];
    if (!aan.length) return nietOnline();
    door(aan);
    if (EINDE.has(b.soort) && aan.includes(metNaar)) {
      zet(ik.sid, { gesprek: null });
      zet(metNaar.sid, { gesprek: null });
    }
    return g;
  }

  const bellers = zijn.filter((s) => s.belt === ik.wie);
  const gekozen = b.naarSid ? bellers.filter(isDoel) : bellers;
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
      return g;
    }
    // De ontvanger haakt in voor het kantoor zijn "aanvaard" kreeg (bv. tijdens de vraag om camera en microfoon):
    // zoals "geweigerd", zodat de beller en de andere tabbladen niet blijven wachten.
    if (gekozen.length) {
      door(gekozen);
      gekozen.forEach((s) => zet(s.sid, { belt: null }));
      anderen.forEach((s) => g.leveringen.push(levering(s.sid, gekozen[0], 'elders')));
      return g;
    }
    // Een gesprek waarvan het andere tabblad weg is (losse wijzer): voorbij, het komt bij een herverbinding niet terug.
    if (ik.gesprek?.wie === b.naar) zet(ik.sid, { gesprek: null });
    return g;
  }

  // aanbod, antwoord, ice, elders buiten een gekend gesprek.
  if (b.naarSid) {
    const aan = zijn.filter(isDoel);
    if (!aan.length) return nietOnline();
    door(aan);
    return g;
  }
  door(zijn);
  return g;
}

/**
 * Een verbinding valt weg. Belde het tabblad nog, dan stopt het rinkelen bij de ontvanger. Was het het laatste tabblad
 * van die persoon, dan kan niemand nog opnemen: wie hem belt, belt niet meer (zijn browser ziet hem ook weggaan).
 * Een lopend gesprek breken we niet af: beeld en geluid gaan rechtstreeks, en het tabblad komt meestal meteen terug.
 * Daarom blijft de wijzer van de ander staan, zodat bijVerbinden het gesprek aan de nieuwe verbinding kan koppelen.
 */
export function bijSluiten(anderen, dicht) {
  const g = { leveringen: [], wijzigingen: [] };
  if (dicht.belt) {
    const zelfdePersoonInGesprek = anderen.some((s) => s.wie === dicht.wie && partnerVan(anderen, s)?.wie === dicht.belt);
    if (!zelfdePersoonInGesprek) for (const s of anderen) if (s.wie === dicht.belt) g.leveringen.push(levering(s.sid, dicht, 'ophangen'));
  }
  if (!anderen.some((s) => s.wie === dicht.wie)) for (const s of anderen) if (s.belt === dicht.wie) g.wijzigingen.push({ sid: s.sid, belt: null });
  return g;
}

/**
 * Een nieuwe verbinding `sid` is net binnen (en staat al in `lijst`). Geeft { leveringen, wijzigingen, sluiten } terug:
 * eerst "welkom" { wie, sid, belt, oproepen } voor het nieuwe tabblad, en na een herverbinding het gesprek of de oproep terug.
 *
 * opties.vorige   sid van de vorige verbinding van dit tabblad (de browser onthoudt ze uit "welkom")
 * opties.peer     met wie het tabblad volgens de browser in gesprek is, en opties.peerSid: het tabblad van die persoon
 *
 * - De oude verbinding is er nog (half-open, bv. na slaapstand): oproep en gesprek gaan over naar de nieuwe,
 *   de oude gaat dicht (`sluiten`).
 * - De oude is al weg: wie nog naar dat tabblad wijst, wordt opnieuw gekoppeld als het tabblad zegt dat het nog in
 *   dat gesprek zit. Zit het er niet meer in (opgehangen terwijl de verbinding weg was), dan krijgt de ander "ophangen".
 * - Zegt het tabblad dat het in gesprek is met een tabblad dat (nog) niet terug is, bv. na een herstart van het kantoor
 *   waarbij beide kanten opnieuw verbinden, dan blijft dat als wijzer staan tot dat tabblad ook terug is.
 * Wie verhuist, meldt het kantoor met "verhuisd" { wie, oud, nieuw }: zo stuurt de ander naar de juiste verbinding.
 * Enkel binnen dezelfde persoon: `wie` komt uit de login, een tabblad kan nooit het gesprek van iemand anders overnemen.
 */
export function bijVerbinden(lijst, sid, opties = {}) {
  const g = { leveringen: [], wijzigingen: [], sluiten: [] };
  const nieuw = lijst.find((s) => s.sid === sid);
  if (!nieuw) return g;
  const zet = (s, velden) => g.wijzigingen.push({ sid: s, ...velden });
  const later = [];
  let belt = nieuw.belt;
  const vorige = isSid(opties.vorige) && opties.vorige !== sid ? opties.vorige : null;

  if (vorige) {
    zet(sid, { vorige });
    const oud = lijst.find((s) => s.sid === vorige && s.wie === nieuw.wie);
    if (oud) {
      // De oude verbinding hangt nog: oproep en gesprek (ook een wijzer naar een tabblad dat even weg is) gaan over.
      belt = oud.belt;
      zet(sid, { belt: oud.belt, gesprek: oud.gesprek });
      zet(oud.sid, { belt: null, gesprek: null });
      g.sluiten.push(oud.sid);
      for (const s of lijst) {
        if (s.sid === sid || s.sid === oud.sid) continue;
        const wijst = s.gesprek?.wie === nieuw.wie && s.gesprek.sid === vorige;
        if (wijst) zet(s.sid, { gesprek: { wie: nieuw.wie, sid } });
        // Wie in gesprek is met de oude verbinding of door ze gebeld wordt, stuurt voortaan naar de nieuwe.
        if (wijst || (oud.belt && s.wie === oud.belt)) later.push(verhuisd(s.sid, nieuw.wie, vorige, sid));
      }
    } else {
      const claim =
        typeof opties.peer === 'string' && ID_PATROON.test(opties.peer) && opties.peer !== nieuw.wie && isSid(opties.peerSid)
          ? { wie: opties.peer, sid: opties.peerSid }
          : null;
      // Het tabblad van de ander in dat gesprek: nog hetzelfde, of intussen zelf opnieuw verbonden.
      const p = claim ? lijst.find((s) => s.sid !== sid && s.wie === claim.wie && (s.sid === claim.sid || s.vorige === claim.sid)) : null;
      let gekoppeld = false;
      for (const s of lijst) {
        if (s.sid === sid || s.gesprek?.wie !== nieuw.wie || s.gesprek.sid !== vorige) continue;
        if (s === p && !gekoppeld) {
          zet(s.sid, { gesprek: { wie: nieuw.wie, sid } });
          zet(sid, { gesprek: { wie: s.wie, sid: s.sid } });
          later.push(verhuisd(s.sid, nieuw.wie, vorige, sid));
          if (s.sid !== claim.sid) later.push(verhuisd(sid, s.wie, claim.sid, s.sid));
          gekoppeld = true;
        } else {
          // Dit tabblad zit niet meer in dat gesprek: de ander stopt ook.
          zet(s.sid, { gesprek: null });
          later.push(levering(s.sid, { wie: nieuw.wie, sid: vorige }, 'ophangen'));
        }
      }
      if (claim && !gekoppeld) {
        // Het tabblad van de ander is er, maar zit niet (meer) in dit gesprek: opgehangen terwijl we weg waren.
        if (p) later.push(levering(sid, claim, 'ophangen'));
        // De ander is (nog) niet terug: als wijzer bewaren tot dat tabblad ook opnieuw verbindt.
        else zet(sid, { gesprek: claim });
      }
    }
  }

  const oproepen = [...new Set(lijst.filter((s) => s.sid !== sid && s.belt === nieuw.wie).map((s) => s.wie))].sort();
  g.leveringen.push({ sid, bericht: { event: 'welkom', data: { wie: nieuw.wie, sid, belt: belt ?? null, oproepen } } }, ...later);
  return g;
}

/** Welke tabbladen van `wie` moeten dicht (oudste eerst), zodat er met het nieuwe erbij maximaal `max` zijn. */
export function teSluiten(lijst, wie, max = MAX_PER_PERSOON) {
  const mijn = lijst.filter((s) => s.wie === wie).sort((a, b) => (a.sinds ?? 0) - (b.sinds ?? 0));
  return mijn.slice(0, Math.max(0, mijn.length - (max - 1))).map((s) => s.sid);
}

/** Grootste bericht over "samen in het HQ": posities en spelzetten zijn klein. */
export const MAX_WERELD = 4096;
const WERELD_SOORTEN = new Set(['pos', 'weg', 'pp', 'pool']);

/**
 * Een bericht over wie waar rondloopt of wat er aan een speltafel gebeurt. Het kantoor stuurt het enkel door naar de
 * anderen en bewaart niets. `van` komt altijd uit de login, nooit uit het bericht. Geeft { soort, d } of null.
 */
export function valideerWereld(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_WERELD || !raw.startsWith('{"wereld":')) return null;
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  const w = m?.wereld;
  if (!isObject(w) || !WERELD_SOORTEN.has(w.soort) || !isObject(w.d)) return null;
  return { soort: w.soort, d: w.d };
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
