// Pool aan de echte tafel in de arena (8-ball). Muis = mikken; ingedrukt houden en naar achteren trekken = kracht; loslaten = stoten.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { aiStoot, hulplijn, naSchot, nieuweStand, nieuwSchot, stapPool, stilt, stoot, TAFEL, type PoolStand, type Schot } from '../spel/pool';
import { ikBen, meldSpel, naamVan, spelUi, Tafel, tik } from '../spel/store';
import { hqStore } from '../model';
import { ui, useUi } from '../ui';
import { walkHoofd, walkPos } from '../walk';
import { stuurSpel } from '../wereld';
import { B } from './dims';

/** Plaats van de pooltafel in de wereld (zie Arena in Warehouse.tsx). */
export const POOL_PLEK = { x: -7.5, z: B.Z - 5.2 };

const LAKEN = 0.895;
const KLEUR = ['#f5f3ee', '#f2c200', '#1d4ed8', '#c0262d', '#5b2a86', '#e86a14', '#0f7a3a', '#7a1f1f', '#111111', '#f2c200', '#1d4ed8', '#c0262d', '#5b2a86', '#e86a14', '#0f7a3a', '#7a1f1f'];

function balTextuur(id: number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = id >= 9 ? '#f5f3ee' : KLEUR[id];
  g.fillRect(0, 0, 128, 64);
  if (id >= 9) {
    g.fillStyle = KLEUR[id];
    g.fillRect(0, 16, 128, 32);
  }
  if (id > 0) {
    g.fillStyle = '#f5f3ee';
    g.beginPath();
    g.arc(32, 32, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111111';
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(id), 32, 33);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function PoolSpel() {
  const spel = useUi((s) => s.spel);
  const camera = useThree((s) => s.camera);
  const stand = useRef<PoolStand>(nieuweStand());
  const schot = useRef<Schot>(nieuwSchot());
  /** Rolt er iets, en reken ik de uitkomst (ikzelf of de computer stootte)? */
  const rolt = useRef(false);
  const ikStootte = useRef(false);
  const accu = useRef(0);
  const hoek = useRef(0);
  const kracht = useRef(0);
  const trekt = useRef(false);
  const aiWacht = useRef(1.2);
  const ballen = useRef<(THREE.Mesh | null)[]>([]);
  const keu = useRef<THREE.Group>(null);
  const keuStok = useRef<THREE.Mesh>(null);
  const lijn = useRef<THREE.Mesh>(null);
  const tafel = useRef<Tafel>(null!);
  const kijkDoel = useRef(new THREE.Vector3(POOL_PLEK.x, 0.9, POOL_PLEK.z));
  const geo = useMemo(() => new THREE.SphereGeometry(TAFEL.R, 18, 12), []);
  const mats = useMemo(() => KLEUR.map((_, i) => new THREE.MeshPhysicalMaterial({ map: balTextuur(i), roughness: 0.15, clearcoat: 1 })), []);
  const as = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const namen = (): [string, string] => {
      const t = tafel.current;
      const naam = (z: 0 | 1) => (t.mijn === z ? 'Jij' : naamVan(t.zit[z] === 'ik' ? null : t.zit[z]));
      return [naam(0), naam(1)];
    };
    const toon = () => {
      const t = tafel.current;
      if (t.mijn === null) return;
      const s = stand.current;
      const g = s.groep[t.mijn];
      const over = (gr: string | null) => s.ballen.filter((b) => !b.weg && (gr === 'vol' ? b.id >= 1 && b.id <= 7 : gr === 'half' ? b.id >= 9 : false)).length;
      spelUi.set({
        tegen: t.tegen,
        zij: t.mijn,
        score: [over(s.groep[0]), over(s.groep[1])],
        tekst: s.winnaar !== null ? `${s.melding} · klik voor een nieuw spel` : rolt.current ? '' : s.beurt === t.mijn ? `Jouw stoot${g ? ` (${g === 'vol' ? 'volle' : 'halve'} ballen)` : ''}` : s.melding,
        hulp: 'Muis = mikken · ingedrukt houden en naar achteren trekken = kracht · loslaten = stoten · Esc = stoppen',
      });
    };
    const nieuw = (zeg = true) => {
      stand.current = nieuweStand();
      schot.current = nieuwSchot();
      rolt.current = false;
      ikStootte.current = false;
      hoek.current = 0;
      aiWacht.current = 1.2;
      if (zeg && ikBen() && tafel.current.tegen) stuurSpel('pool', { t: 'n' });
      toon();
    };
    const doeStoot = (a: number, k: number) => {
      stoot(stand.current, a, k);
      schot.current = nieuwSchot();
      rolt.current = true;
      ikStootte.current = true;
      tik(300, 0.14, 0.06);
      if (ikBen() && tafel.current.tegen) stuurSpel('pool', { t: 'st', a, k });
      toon();
    };
    (doeStootRef as { current: typeof doeStoot }).current = doeStoot;
    (toonRef as { current: () => void }).current = () => {
      const s = stand.current;
      naSchot(s, schot.current, namen());
      rolt.current = false;
      // Na de stoot wijst de keu naar de dichtste bal: minder zoeken.
      const w = s.ballen[0];
      const doel = s.ballen.filter((b) => b.id !== 0 && !b.weg).sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))[0];
      if (doel) hoek.current = Math.atan2(doel.z - w.z, doel.x - w.x);
      aiWacht.current = 1.4;
      if (ikStootte.current && ikBen() && tafel.current.tegen)
        stuurSpel('pool', { t: 'e', b: s.ballen.map((x) => [Math.round(x.x * 10000) / 10000, Math.round(x.z * 10000) / 10000, x.weg ? 1 : 0]), u: s.beurt, g: s.groep, w: s.winnaar, m: s.melding });
      ikStootte.current = false;
      toon();
    };
    tafel.current = new Tafel(
      'pool',
      () => {
        if (tafel.current.mijn !== null) nieuw(false);
      },
      (_van, d) => {
        const s = stand.current;
        if (d.t === 'st' && Number.isFinite(d.a) && Number.isFinite(d.k)) {
          stoot(s, d.a as number, d.k as number);
          schot.current = nieuwSchot();
          rolt.current = true;
          ikStootte.current = false;
          tik(300, 0.14, 0.06);
          toon();
        } else if (d.t === 'e' && Array.isArray(d.b) && d.b.length === s.ballen.length) {
          // De eindstand van wie stootte, is de waarheid.
          (d.b as number[][]).forEach((r, i) => Object.assign(s.ballen[i], { x: Number(r[0]) || 0, z: Number(r[1]) || 0, weg: r[2] === 1, vx: 0, vz: 0 }));
          s.beurt = d.u === 1 ? 1 : 0;
          if (Array.isArray(d.g)) s.groep = [d.g[0] === 'vol' || d.g[0] === 'half' ? d.g[0] : null, d.g[1] === 'vol' || d.g[1] === 'half' ? d.g[1] : null];
          s.winnaar = d.w === 0 || d.w === 1 ? d.w : null;
          s.melding = typeof d.m === 'string' ? d.m.slice(0, 80) : '';
          rolt.current = false;
          const w = s.ballen[0];
          const doel = s.ballen.filter((b) => b.id !== 0 && !b.weg).sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))[0];
          if (doel) hoek.current = Math.atan2(doel.z - w.z, doel.x - w.x);
          toon();
        } else if (d.t === 'n') {
          nieuw(false);
        }
      },
    );
    const magMikken = () => {
      const t = tafel.current;
      return ui.get().spel === 'pool' && t.mijn !== null && !rolt.current && stand.current.winnaar === null && stand.current.beurt === t.mijn;
    };
    const beweeg = (e: PointerEvent) => {
      if (!magMikken()) return;
      if (trekt.current) kracht.current = Math.max(0, Math.min(1, kracht.current + e.movementY * 0.004));
      else hoek.current += e.movementX * 0.0022;
    };
    const neer = () => {
      if (ui.get().spel !== 'pool') return;
      if (stand.current.winnaar !== null) return nieuw();
      if (magMikken()) {
        trekt.current = true;
        kracht.current = 0;
      }
    };
    const los = () => {
      if (!trekt.current) return;
      trekt.current = false;
      if (magMikken() && kracht.current > 0.03) doeStoot(hoek.current, kracht.current);
      kracht.current = 0;
    };
    window.addEventListener('pointermove', beweeg);
    window.addEventListener('pointerdown', neer);
    window.addEventListener('pointerup', los);
    const af = meldSpel('pool', {
      start: async () => {
        spelUi.set({ tekst: 'Aanschuiven…', hulp: '' });
        const z = await tafel.current.neemPlaats();
        if (z === null) {
          spelUi.set({ tekst: '' });
          ui.set({ spel: null, walkHint: '', walkMelding: 'Deze tafel is bezet. Je kan wel kijken.' });
          return;
        }
        // Wie alleen is, begint vers; schuif je aan bij iemand, dan begint het spel opnieuw voor jullie twee.
        nieuw(false);
        walkPos.set(POOL_PLEK.x + (z === 0 ? -1.75 : 1.75), 0, POOL_PLEK.z);
        walkHoofd.ry = z === 0 ? -Math.PI / 2 : Math.PI / 2;
        walkHoofd.snel = 0;
      },
      stop: () => {
        tafel.current.verlaat();
        trekt.current = false;
      },
    });
    return () => {
      af();
      window.removeEventListener('pointermove', beweeg);
      window.removeEventListener('pointerdown', neer);
      window.removeEventListener('pointerup', los);
      tafel.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const doeStootRef = useRef<(a: number, k: number) => void>(() => {});
  const toonRef = useRef<() => void>(() => {});

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = stand.current;
    const t = tafel.current;
    if (!t) return;
    if (t.tegen && !hqStore.get().online.includes(t.tegen)) t.laat(t.tegen);

    // De computer stoot als hij aan de beurt is.
    if (t.mijn !== null && !t.tegen && !rolt.current && s.winnaar === null && s.beurt !== t.mijn) {
      aiWacht.current -= dt;
      if (aiWacht.current <= 0) {
        const k = aiStoot(s);
        doeStootRef.current(k.hoek, k.kracht);
      }
    }

    if (rolt.current) {
      accu.current += dt;
      const voor = schot.current.gepot.length;
      let n = 0;
      while (accu.current >= TAFEL.DT && n++ < 60) {
        stapPool(s, schot.current);
        accu.current -= TAFEL.DT;
      }
      if (schot.current.gepot.length > voor) tik(160, 0.16, 0.12);
      if (stilt(s)) {
        accu.current = 0;
        // Wie stootte beslist; de ander wacht op de eindstand.
        if (ikStootte.current) toonRef.current();
      }
    }

    s.ballen.forEach((b, i) => {
      const m = ballen.current[i];
      if (!m) return;
      m.visible = !b.weg;
      if (b.weg) return;
      const dx = b.x - m.position.x;
      const dz = b.z - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        as.set(dz / d, 0, -dx / d);
        m.rotateOnWorldAxis(as, d / TAFEL.R);
      }
      m.position.set(b.x, LAKEN + TAFEL.R, b.z);
    });

    const mijnBeurt = t.mijn !== null && !rolt.current && s.beurt === t.mijn && s.winnaar === null;
    const wit = s.ballen[0];
    if (keu.current) {
      keu.current.visible = spel === 'pool' && mijnBeurt;
      keu.current.position.set(wit.x, LAKEN + TAFEL.R, wit.z);
      keu.current.rotation.y = -hoek.current;
    }
    if (keuStok.current) keuStok.current.position.x = -(0.78 + kracht.current * 0.32);
    if (lijn.current) {
      const l = hulplijn(s, hoek.current);
      lijn.current.scale.x = Math.max(0.001, l);
      lijn.current.position.x = l / 2;
    }

    if (spel === 'pool' && t.mijn !== null) {
      const cos = Math.cos(hoek.current);
      const sin = Math.sin(hoek.current);
      let pos: THREE.Vector3;
      let doel: THREE.Vector3;
      if (mijnBeurt) {
        pos = new THREE.Vector3(POOL_PLEK.x + wit.x - cos * 0.95, LAKEN + 0.42, POOL_PLEK.z + wit.z - sin * 0.95);
        doel = new THREE.Vector3(POOL_PLEK.x + wit.x + cos * 0.55, LAKEN, POOL_PLEK.z + wit.z + sin * 0.55);
      } else {
        // Rollen of wachten: van bovenaf, zodat je alles ziet.
        pos = new THREE.Vector3(POOL_PLEK.x, 3.1, POOL_PLEK.z + 1.25);
        doel = new THREE.Vector3(POOL_PLEK.x, LAKEN, POOL_PLEK.z);
      }
      const k = 1 - Math.exp(-dt * 7);
      camera.position.lerp(pos, k);
      kijkDoel.current.lerp(doel, k);
      camera.lookAt(kijkDoel.current);
    }
  });

  return (
    <group position={[POOL_PLEK.x, 0, POOL_PLEK.z]} userData={{ noCollide: true, noMerge: true }}>
      {KLEUR.map((_, i) => (
        <mesh key={i} ref={(el) => (ballen.current[i] = el)} geometry={geo} material={mats[i]} castShadow position={[stand.current.ballen[i].x, LAKEN + TAFEL.R, stand.current.ballen[i].z]} />
      ))}
      {/* De pockets */}
      {[-1, 0, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} rotation-x={-Math.PI / 2} position={[x * TAFEL.HX, LAKEN + 0.002, z * (TAFEL.HZ + (x === 0 ? 0.012 : 0))]}>
            <circleGeometry args={[x === 0 ? 0.065 : 0.075, 24]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
        )),
      )}
      <group ref={keu} visible={false}>
        <mesh ref={keuStok} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.013, 0.006, 1.45, 10]} />
          <meshStandardMaterial color="#b88a5c" roughness={0.5} />
        </mesh>
        <mesh ref={lijn} position-y={-0.02}>
          <boxGeometry args={[1, 0.002, 0.004]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
