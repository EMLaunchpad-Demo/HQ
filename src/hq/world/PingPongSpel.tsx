// Pingpong aan de echte tafel in de arena. Muis links-rechts = batje; klikken = opslag. Alleen speel je tegen de computer.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { aiBatje, andere, kiesAiFout, klem, PP, Wedstrijd, type PuntInfo, type Vlucht, type Zij } from '../spel/pingpong';
import { ikBen, meldSpel, naamVan, spelUi, Tafel, tik } from '../spel/store';
import { hqStore } from '../model';
import { ui, useUi } from '../ui';
import { walkHoofd, walkPos } from '../walk';
import { stuurSpel } from '../wereld';
import { B } from './dims';

/** Plaats van de pingpongtafel in de wereld (zie Arena in Warehouse.tsx). */
export const PP_PLEK = { x: 7.5, z: B.Z - 5.2 };

// Half doorzichtig: je eigen batje staat vlak voor de camera en mag de bal niet verbergen.
const rood = new THREE.MeshStandardMaterial({ color: '#c0262d', side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });
const zwart = new THREE.MeshStandardMaterial({ color: '#1b2a44', side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });
const hout = new THREE.MeshStandardMaterial({ color: '#b88a5c', roughness: 0.55 });

export function PingPongSpel() {
  const spel = useUi((s) => s.spel);
  const camera = useThree((s) => s.camera);
  const bal = useRef<THREE.Mesh>(null);
  const schaduw = useRef<THREE.Mesh>(null);
  const batjes = useRef<(THREE.Group | null)[]>([]);
  const muis = useRef(0);
  const laatstBericht = useRef(0);
  const aiWacht = useRef(0);
  const batjeTijd = useRef(0);
  const speelt = useRef(false);

  const w = useRef<Wedstrijd>(null!);
  const tafel = useRef<Tafel>(null!);

  useEffect(() => {
    const toon = () => {
      const m = w.current;
      const t = tafel.current;
      if (t.mijn === null) return;
      const tegen = t.tegen;
      spelUi.set({ tegen, zij: t.mijn, score: [m.score[0], m.score[1]] });
    };
    const nieuw = (zeg = true) => {
      const m = w.current;
      m.score = [0, 0];
      m.opslag = 0;
      m.winnaar = null;
      m.vlucht = null;
      if (zeg && ikBen() && tafel.current.tegen) stuurSpel('pp', { t: 'n' });
      toon();
      hulp();
    };
    const hulp = () => {
      const m = w.current;
      const t = tafel.current;
      if (t.mijn === null) return;
      const naamWinnaar = m.winnaar === null ? '' : m.winnaar === t.mijn ? 'Jij wint' : `${naamVan(t.tegen)} wint`;
      spelUi.set({
        tekst: naamWinnaar || (m.opslag === t.mijn && !m.vlucht ? 'Jouw opslag: klik' : m.vlucht ? '' : `Opslag voor ${naamVan(t.tegen)}`),
        hulp: 'Muis links en rechts = batje · raak de bal met de rand om schuin te slaan · klik = opslag · Esc = stoppen',
      });
    };
    w.current = new Wedstrijd(
      (z) => {
        const t = tafel.current;
        return t.mijn !== null && (z === t.mijn || !t.tegen);
      },
      (f: Vlucht) => {
        tik(520);
        if (!tafel.current.tegen) w.current.aiFout = kiesAiFout(f.rally);
        else if (ikBen() && tafel.current.mijn === f.van) stuurSpel('pp', { t: 's', b: [f.bal.x, f.bal.y, f.bal.z, f.bal.vx, f.bal.vy, f.bal.vz], v: f.van, r: f.rally });
        hulp();
      },
      (p: PuntInfo) => {
        tik(200, 0.08, 0.12);
        const t = tafel.current;
        // Enkel wie besliste, stuurt het punt door.
        if (ikBen() && t.mijn !== null && !binnen.current) stuurSpel('pp', { t: 'p', s: p.score, o: p.opslag, w: p.winnaar });
        aiWacht.current = 1.3;
        toon();
        hulp();
      },
    );
    const binnen = { current: false };
    tafel.current = new Tafel(
      'pp',
      () => {
        // Iemand schuift aan of gaat weg: nieuwe wedstrijd.
        if (tafel.current.mijn !== null) nieuw(false);
      },
      (_van, d) => {
        laatstBericht.current = Date.now();
        spelUi.set({ ppActief: true });
        const m = w.current;
        if (d.t === 's' && Array.isArray(d.b) && d.b.length === 6 && d.b.every((x) => Number.isFinite(x))) {
          const b = d.b as number[];
          const van: Zij = d.v === 1 ? 1 : 0;
          m.ontvangSlag({ bal: { x: b[0], y: b[1], z: b[2], vx: b[3], vy: b[4], vz: b[5] }, van, naar: andere(van), stuit: 0, rally: Number(d.r) || 0 });
          tik(520);
          hulp();
        } else if (d.t === 'p' && Array.isArray(d.s)) {
          binnen.current = true;
          m.ontvangPunt({ score: [Number(d.s[0]) || 0, Number(d.s[1]) || 0], opslag: d.o === 1 ? 1 : 0, winnaar: d.w === 0 || d.w === 1 ? d.w : null, reden: '' });
          binnen.current = false;
        } else if (d.t === 'b' && (d.z === 0 || d.z === 1) && Number.isFinite(d.p)) {
          if (tafel.current.mijn !== d.z) m.batje[d.z] = d.p as number;
        } else if (d.t === 'n') {
          nieuw(false);
        }
      },
    );

    const klik = () => {
      if (ui.get().spel !== 'pingpong') return;
      const m = w.current;
      const t = tafel.current;
      if (t.mijn === null) return;
      if (m.winnaar !== null) return nieuw();
      if (m.opslag === t.mijn && !m.vlucht) {
        m.serveer(t.mijn, m.batje[t.mijn] * 0.7);
        hulp();
      }
    };
    const beweeg = (e: PointerEvent) => {
      if (ui.get().spel !== 'pingpong') return;
      const richting = tafel.current.mijn === 1 ? -1 : 1; // je kijkt vanaf de andere kant
      muis.current = klem(((e.clientX / window.innerWidth - 0.5) * 2 * 1.2) * richting, -1, 1);
    };
    window.addEventListener('pointerdown', klik);
    window.addEventListener('pointermove', beweeg);
    const af = meldSpel('pingpong', {
      start: async () => {
        spelUi.set({ tekst: 'Aanschuiven…', hulp: '' });
        const z = await tafel.current.neemPlaats();
        if (z === null) {
          spelUi.set({ tekst: '' });
          ui.set({ spel: null, walkHint: '' });
          ui.set({ walkMelding: 'Deze tafel is bezet. Je kan wel kijken.' });
          return;
        }
        speelt.current = true;
        spelUi.set({ ppActief: true });
        nieuw(false);
      },
      stop: () => {
        speelt.current = false;
        tafel.current.verlaat();
        w.current.vlucht = null;
        spelUi.set({ ppActief: false });
      },
    });
    return () => {
      af();
      window.removeEventListener('pointerdown', klik);
      window.removeEventListener('pointermove', beweeg);
      tafel.current.stop();
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const m = w.current;
    const t = tafel.current;
    if (!m || !t) return;
    const mijn = t.mijn;
    const ai = mijn !== null && !t.tegen ? andere(mijn) : null;

    // Is de tegenstander weg zonder iets te zeggen (pc dicht)? Dan komt zijn plaats vrij.
    if (t.tegen && !hqStore.get().online.includes(t.tegen)) t.laat(t.tegen);

    if (mijn !== null) {
      const oud = m.batje[mijn];
      m.batje[mijn] += (muis.current - oud) * (1 - Math.exp(-dt * 22));
      m.batjeV[mijn] = (m.batje[mijn] - oud) / Math.max(dt, 0.001);
      batjeTijd.current += dt;
      if (t.tegen && ikBen() && batjeTijd.current > 0.07) {
        batjeTijd.current = 0;
        stuurSpel('pp', { t: 'b', z: mijn, p: Math.round(m.batje[mijn] * 100) / 100 });
      }
      // Je mannetje staat achter de tafel en volgt het batje, zo zien anderen je spelen.
      const s = mijn === 0 ? -1 : 1;
      walkPos.set(PP_PLEK.x + s * (PP.PADDLE_X + 0.3), 0, PP_PLEK.z + m.batje[mijn]);
      walkHoofd.ry = mijn === 0 ? -Math.PI / 2 : Math.PI / 2;
      walkHoofd.snel = 0;
    }
    if (ai !== null) {
      aiBatje(m, ai, dt);
      if (!m.vlucht && m.opslag === ai && m.winnaar === null) {
        aiWacht.current -= dt;
        if (aiWacht.current <= 0) m.serveer(ai, (Math.random() - 0.5) * PP.W);
      }
    }
    if (m.vlucht) {
      const stuit = m.vlucht.stuit;
      for (let i = 0; i < 2; i++) m.stap(dt / 2, (z) => (z === ai ? (Math.random() - 0.5) * PP.W * 1.5 : null));
      if (m.vlucht && m.vlucht.stuit !== stuit) tik(880, 0.06, 0.03);
    }
    // Toeschouwers: niets meer gehoord, dan ligt alles weer op de tafel.
    if (mijn === null && spelUi.get().ppActief && Date.now() - laatstBericht.current > 6000) spelUi.set({ ppActief: false });

    const actief = mijn !== null || spelUi.get().ppActief;
    const f = m.vlucht;
    if (bal.current) {
      bal.current.visible = !!f;
      if (f) bal.current.position.set(f.bal.x, f.bal.y, f.bal.z);
    }
    if (schaduw.current) {
      const op = !!f && Math.abs(f.bal.x) < PP.L && Math.abs(f.bal.z) < PP.W;
      schaduw.current.visible = op;
      if (f && op) schaduw.current.position.set(f.bal.x, PP.TOP + 0.003, f.bal.z);
    }
    batjes.current.forEach((g, i) => {
      if (!g) return;
      g.visible = actief;
      const y = f ? klem(f.bal.y, PP.TOP + 0.06, 1.35) : PP.TOP + 0.2;
      g.position.set((i === 0 ? -1 : 1) * PP.PADDLE_X, y, m.batje[i]);
    });

    // Camera achter je eigen batje.
    if (spel === 'pingpong' && mijn !== null) {
      const s = mijn === 0 ? -1 : 1;
      const pos = new THREE.Vector3(PP_PLEK.x + s * (PP.PADDLE_X + 1.3), 1.95, PP_PLEK.z + m.batje[mijn] * 0.3);
      camera.position.lerp(pos, 1 - Math.exp(-dt * 8));
      camera.lookAt(PP_PLEK.x + s * 0.1, 0.8, PP_PLEK.z);
    }
  });

  return (
    <group position={[PP_PLEK.x, 0, PP_PLEK.z]} userData={{ noCollide: true, noMerge: true }}>
      <mesh ref={bal} visible={false}>
        <sphereGeometry args={[PP.R * 1.25, 14, 10]} />
        <meshStandardMaterial color="#ff9a2e" emissive="#ff7a10" emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={schaduw} visible={false} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.03, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {[0, 1].map((i) => (
        <group key={i} ref={(el) => (batjes.current[i] = el)} visible={false}>
          <mesh rotation-y={Math.PI / 2} material={i ? rood : zwart}>
            <circleGeometry args={[PP.BEREIK * 0.75, 24]} />
          </mesh>
          <mesh position-y={-PP.BEREIK * 0.95} material={hout}>
            <boxGeometry args={[0.015, 0.11, 0.03]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
