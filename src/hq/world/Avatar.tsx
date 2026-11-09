// Mannetjes die rondlopen: dat van jezelf (je bestuurt het, zie Walker) en dat van wie er ook in het HQ loopt.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useCall } from '../call';
import { humans } from '../model';
import { ui, useUi } from '../ui';
import { walkHoofd, walkPos } from '../walk';
import { spelerVan, useSpelers } from '../wereld';
import { Character } from './Character';

const KLEUR = '#2f7bff';
const naam = (id: string) => humans.find((h) => h.id === id)?.name ?? id;

function hoekNaar(van: number, naar: number, k: number) {
  let d = naar - van;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return van + d * k;
}

/** Je eigen mannetje: staat waar je staat. Onzichtbaar in first person, aan een speltafel en als de camera te dichtbij komt. */
export function MijnAvatar() {
  const walk = useUi((s) => s.walk);
  const me = useCall((s) => s.me);
  const groep = useRef<THREE.Group>(null);
  const loop = useRef(0);
  useFrame((_, dt) => {
    const g = groep.current;
    if (!g) return;
    const s = ui.get();
    g.visible = s.walkView === 'derde' && !s.spel && walkHoofd.camAfstand > 0.75;
    g.position.copy(walkPos);
    g.rotation.y = walkHoofd.ry;
    loop.current += (walkHoofd.snel - loop.current) * (1 - Math.exp(-dt * 12));
  });
  if (!walk) return null;
  return (
    <group ref={groep} userData={{ noCollide: true, noMerge: true }}>
      <Character id={me ?? 'gast'} name={me ? naam(me) : 'Jij'} shirt={KLEUR} mood="rust" pose="staat" loop={loop} zonderDiamant />
    </group>
  );
}

function AndereSpeler({ id }: { id: string }) {
  const groep = useRef<THREE.Group>(null);
  const loop = useRef(0);
  useFrame((_, rawDt) => {
    const g = groep.current;
    const s = spelerVan(id);
    if (!g || !s) return;
    const dt = Math.min(rawDt, 0.1);
    // Tussen twee berichten vloeiend doorlopen; een grote sprong (naar een andere ruimte) meteen zetten.
    if (Math.hypot(s.x - g.position.x, s.z - g.position.z) > 6) g.position.set(s.x, s.y, s.z);
    else g.position.lerp(new THREE.Vector3(s.x, s.y, s.z), 1 - Math.exp(-dt * 10));
    g.rotation.y = hoekNaar(g.rotation.y, s.ry, 1 - Math.exp(-dt * 12));
    loop.current += (s.snel - loop.current) * (1 - Math.exp(-dt * 10));
  });
  return (
    <group ref={groep} userData={{ noCollide: true, noMerge: true }}>
      <Character id={id} name={naam(id)} shirt={KLEUR} mood="bezig" pose="staat" loop={loop} label zonderDiamant big />
    </group>
  );
}

/** Iedereen die nu rondloopt in het HQ, ook zichtbaar in het bovenaanzicht. */
export function Spelers() {
  const ids = useSpelers();
  return (
    <>
      {ids.map((id) => (
        <AndereSpeler key={id} id={id} />
      ))}
    </>
  );
}
