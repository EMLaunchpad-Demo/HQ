// Gedeelde bouwdelen van het HQ.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { glassMat, steelMat } from './dims';
import { ui } from '../ui';
import { walkPos } from '../walk';

/** Hoogte van een deuropening: boven de deur loopt het glas gewoon door. */
export const DOOR_H = 2.3;
const tmp = new THREE.Vector3();

/** Schuifdeur: staat dicht en schuift open zodra je in de rondloopmodus dichtbij komt. Botst nooit (noCollide). */
export function SlideDoor({ w, double = false }: { w: number; double?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const leaves = useRef<(THREE.Group | null)[]>([]);
  const open = useRef(0);
  const lw = double ? w / 2 : w;
  useFrame((_, dt) => {
    const r = root.current;
    if (!r) return;
    let goal = 0;
    if (ui.get().walk) {
      r.getWorldPosition(tmp);
      if (Math.hypot(tmp.x - walkPos.x, tmp.z - walkPos.z) < 2.8 && Math.abs(tmp.y - walkPos.y) < 2) goal = 1;
    }
    if (Math.abs(goal - open.current) < 0.001) return;
    open.current += (goal - open.current) * (1 - Math.exp(-dt * 7));
    if (double) {
      if (leaves.current[0]) leaves.current[0].position.x = -lw / 2 - open.current * lw * 0.92;
      if (leaves.current[1]) leaves.current[1].position.x = lw / 2 + open.current * lw * 0.92;
    } else if (leaves.current[0]) {
      leaves.current[0].position.x = open.current * lw * 0.92;
    }
  });
  return (
    <group ref={root} userData={{ noCollide: true }} position-z={0.03}>
      {(double ? [-lw / 2, lw / 2] : [0]).map((x, i) => (
        <group key={i} ref={(el) => (leaves.current[i] = el)} position-x={x}>
          <mesh position-y={DOOR_H / 2} material={glassMat}>
            <planeGeometry args={[lw - 0.04, DOOR_H - 0.04]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * (lw - 0.05)) / 2, DOOR_H / 2, 0]} material={steelMat}>
              <boxGeometry args={[0.05, DOOR_H, 0.05]} />
            </mesh>
          ))}
          <mesh position={[double ? (i ? -lw / 2 + 0.14 : lw / 2 - 0.14) : -lw / 2 + 0.14, 1.1, 0.05]} material={steelMat}>
            <boxGeometry args={[0.03, 0.5, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Glazen gevel met zwarte stalen kaders, zoals de kantoren op de referentiefoto.
 * Met `door` zit er een echte schuifdeur in de laatste travee (doorSide kiest de kant, doorX een vaste plaats), met `wide` een dubbele deur in het midden.
 */
export function GlassFront({ w, h, every = 2.5, door = true, doorSide = 1, doorX, wide = false, hidePane = false }: { w: number; h: number; every?: number; door?: boolean; doorSide?: 1 | -1; doorX?: number; wide?: boolean; hidePane?: boolean }) {
  const n = Math.max(1, Math.round(w / every));
  const bay = w / n;
  // Een opening kan enkel in een volledige muur (niet als de muren omlaag staan in Sims-modus).
  const hasDoor = (door || wide) && h > DOOR_H + 0.2;
  const dw = wide ? 3.2 : 1.2;
  const dx = wide ? 0 : doorX ?? doorSide * (w / 2 - bay / 2);
  const left = dx - dw / 2;
  const right = dx + dw / 2;
  const inDoor = (x: number) => hasDoor && x > left - 0.02 && x < right + 0.02;
  const rail = (y: number) =>
    hasDoor && y < DOOR_H
      ? [
          { x: (-w / 2 + left) / 2, len: left + w / 2 },
          { x: (w / 2 + right) / 2, len: w / 2 - right },
        ].filter((s) => s.len > 0.01)
      : [{ x: 0, len: w }];
  return (
    <group>
      {!hidePane &&
        (hasDoor ? (
          <>
            {left + w / 2 > 0.01 && (
              <mesh position={[(-w / 2 + left) / 2, h / 2, 0]} material={glassMat}>
                <planeGeometry args={[left + w / 2, h]} />
              </mesh>
            )}
            {w / 2 - right > 0.01 && (
              <mesh position={[(w / 2 + right) / 2, h / 2, 0]} material={glassMat}>
                <planeGeometry args={[w / 2 - right, h]} />
              </mesh>
            )}
            <mesh position={[dx, (DOOR_H + h) / 2, 0]} material={glassMat}>
              <planeGeometry args={[dw, h - DOOR_H]} />
            </mesh>
          </>
        ) : (
          <mesh position-y={h / 2} material={glassMat}>
            <planeGeometry args={[w, h]} />
          </mesh>
        ))}
      {Array.from({ length: n + 1 }, (_, i) => {
        const x = (i / n - 0.5) * w;
        // Een stijl die midden in de deur zou staan, begint pas boven de deur.
        return inDoor(x) ? (
          <mesh key={i} position={[x, (DOOR_H + h) / 2, 0]} material={steelMat}>
            <boxGeometry args={[0.07, h - DOOR_H, 0.08]} />
          </mesh>
        ) : (
          <mesh key={i} position={[x, h / 2, 0]} material={steelMat}>
            <boxGeometry args={[0.07, h, 0.08]} />
          </mesh>
        );
      })}
      {[0.04, h - 0.04, ...(h > 1.3 ? [1.05] : [])].flatMap((y) =>
        rail(y).map((s) => (
          <mesh key={`${y}${s.x}`} position={[s.x, y, 0]} material={steelMat}>
            <boxGeometry args={[s.len, 0.06, 0.08]} />
          </mesh>
        )),
      )}
      {hasDoor && (
        <group position-x={dx}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * dw) / 2, DOOR_H / 2, 0]} material={steelMat}>
              <boxGeometry args={[0.07, DOOR_H, 0.09]} />
            </mesh>
          ))}
          <mesh position-y={DOOR_H} material={steelMat}>
            <boxGeometry args={[dw + 0.07, 0.07, 0.09]} />
          </mesh>
          {!hidePane && <SlideDoor w={dw} double={wide} />}
        </group>
      )}
    </group>
  );
}
