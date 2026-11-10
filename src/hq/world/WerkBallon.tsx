// Boven het hoofd van een agent die werkt: een ballon met zijn taak, wat hij nu doet en hoe ver hij staat.
// Van ver groeit hij mee, zodat je ook in het bovenaanzicht ziet wie waaraan werkt.
import { useRef } from 'react';
import * as THREE from 'three';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { FONT, FONT_MONO, FONT_REGULAR } from '../fonts';
import { livePct, type LiveWork } from '../model';
import { kort } from '../taakTekst';

const BG = new THREE.MeshBasicMaterial({ color: '#0b1526', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
const RAND_BEZIG = new THREE.MeshBasicMaterial({ color: '#2ff0a6', toneMapped: false, depthTest: false, transparent: true });
const RAND_KLAAR = new THREE.MeshBasicMaterial({ color: '#2f7bff', toneMapped: false, depthTest: false, transparent: true });
const BALK = new THREE.MeshBasicMaterial({ color: '#1e2a3a', depthTest: false, transparent: true });
const VOL = new THREE.MeshBasicMaterial({ color: '#2ff0a6', toneMapped: false, depthTest: false, transparent: true });
const pos = new THREE.Vector3();

/** Hoe lang "klaar" nog boven het hoofd blijft staan. */
export const KLAAR_MS = 3 * 60_000;

export function WerkBallon({ naam, w, y }: { naam: string; w: LiveWork; y: number }) {
  const groep = useRef<THREE.Group>(null);
  const stip = useRef<THREE.Mesh>(null);
  useFrame(({ camera, clock }) => {
    const g = groep.current;
    if (!g) return;
    g.getWorldPosition(pos);
    // Dichtbij op ware grootte, van ver groter (tot 9x), zodat hij leesbaar blijft.
    const s = Math.min(9, Math.max(1, camera.position.distanceTo(pos) / 6));
    g.scale.setScalar(s);
    // Altijd zichtbaar, ook door het dak en de muren (zoals een gedachteballon in een game).
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      o.renderOrder = 999;
      m.depthTest = false;
      m.depthWrite = false;
    });
    if (stip.current) stip.current.scale.setScalar(0.8 + Math.sin(clock.elapsedTime * 5) * 0.25);
  });
  const klaar = !!w.done;
  const pct = livePct(w);
  const kop = `${naam.toUpperCase()} · ${klaar ? 'KLAAR' : pct !== null ? `${pct}%` : 'BEZIG'}`;
  const taak = kort(w.task || 'Aan het werk', 36);
  const nu = klaar ? kort(w.done ?? '', 44) : w.doing ? `Nu: ${kort(w.doing, 40)}` : '';
  const B = 1.5;
  const H = nu ? 0.4 : 0.3;
  return (
    <group position-y={y} userData={{ noCollide: true, noMerge: true }}>
      <group ref={groep}>
        <Billboard>
          <RoundedBox args={[B + 0.03, H + 0.03, 0.005]} radius={0.05} position-z={-0.004} material={klaar ? RAND_KLAAR : RAND_BEZIG} />
          <RoundedBox args={[B, H, 0.006]} radius={0.045} material={BG} />
          {/* Staartje naar het hoofd */}
          <mesh position={[0, -H / 2 - 0.04, 0]} rotation-z={Math.PI / 4} material={klaar ? RAND_KLAAR : RAND_BEZIG}>
            <planeGeometry args={[0.07, 0.07]} />
          </mesh>
          {!klaar && (
            <mesh ref={stip} position={[-B / 2 + 0.07, H / 2 - 0.075, 0.006]} material={VOL}>
              <circleGeometry args={[0.022, 14]} />
            </mesh>
          )}
          <Text font={FONT_MONO} fontSize={0.052} letterSpacing={0.08} color={klaar ? '#7fb0ff' : '#2ff0a6'} anchorX="left" anchorY="middle" position={[-B / 2 + (klaar ? 0.06 : 0.12), H / 2 - 0.075, 0.008]}>
            {kop}
          </Text>
          <Text font={FONT} fontSize={0.072} color="#ffffff" anchorX="left" anchorY="middle" position={[-B / 2 + 0.06, H / 2 - 0.165, 0.008]}>
            {taak}
          </Text>
          {nu && (
            <Text font={FONT_REGULAR} fontSize={0.056} color="#aab8c2" anchorX="left" anchorY="middle" position={[-B / 2 + 0.06, H / 2 - 0.255, 0.008]}>
              {nu}
            </Text>
          )}
          {pct !== null && (
            <>
              <mesh position={[0, -H / 2 + 0.04, 0.007]} material={BALK}>
                <planeGeometry args={[B - 0.12, 0.022]} />
              </mesh>
              <mesh position={[-(B - 0.12) / 2 + ((B - 0.12) * pct) / 200, -H / 2 + 0.04, 0.008]} material={VOL}>
                <planeGeometry args={[Math.max(0.001, ((B - 0.12) * pct) / 100), 0.022]} />
              </mesh>
            </>
          )}
        </Billboard>
      </group>
    </group>
  );
}
