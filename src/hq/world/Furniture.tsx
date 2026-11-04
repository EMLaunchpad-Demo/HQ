// Meubels voor de verdiepingen. Eenvoudige vormen met afgeronde, vrolijke kleuren zoals in De Sims.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { leafTex, screenTex } from '../textures';

const M = {
  oak: new THREE.MeshStandardMaterial({ color: '#d8b48a', roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#1d2430', roughness: 0.4, metalness: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.35, metalness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 }),
  terracotta: new THREE.MeshStandardMaterial({ color: '#c46a45', roughness: 0.8 }),
};

/** Bureau; de persoon zit aan de +z-kant en kijkt naar -z (naar het scherm). */
export function Desk({ screen = '#13c7e6', wide = false, lite = false }: { screen?: string; wide?: boolean; lite?: boolean }) {
  const w = wide ? 2 : 1.5;
  const glow = useMemo(() => {
    const t = screenTex(screen);
    return new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.2 });
  }, [screen]);
  return (
    <group>
      <mesh position-y={0.74} material={M.oak} receiveShadow>
        <boxGeometry args={[w, 0.05, 0.8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.06), 0.37, 0]} material={M.white}>
          <boxGeometry args={[0.05, 0.72, 0.72]} />
        </mesh>
      ))}
      {/* Scherm */}
      <group position={[0, 0.77, -0.22]}>
        {!lite && (
          <>
            <mesh position-y={0.04} material={M.dark}>
              <boxGeometry args={[0.22, 0.02, 0.16]} />
            </mesh>
            <mesh position-y={0.16} material={M.dark}>
              <boxGeometry args={[0.04, 0.22, 0.03]} />
            </mesh>
          </>
        )}
        <mesh position={[0, 0.36, 0]} material={M.dark}>
          <boxGeometry args={[wide ? 0.95 : 0.7, 0.42, 0.035]} />
        </mesh>
        <mesh position={[0, 0.36, 0.019]} material={glow}>
          <planeGeometry args={[wide ? 0.9 : 0.65, 0.37]} />
        </mesh>
      </group>
      {/* Toetsenbord en mok */}
      {!lite && <mesh position={[0, 0.775, 0.1]} material={M.white}>
        <boxGeometry args={[0.42, 0.02, 0.14]} />
      </mesh>}
      {!lite && <mesh position={[w / 2 - 0.25, 0.81, 0.05]} material={M.terracotta}>
        <cylinderGeometry args={[0.04, 0.035, 0.09, 12]} />
      </mesh>}
      <Chair lite={lite} />
    </group>
  );
}

export function Chair({ color = '#2b3646', lite = false }: { color?: string; lite?: boolean }) {
  const seat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color]);
  return (
    <group position={[0, 0, 0.62]}>
      <mesh position-y={0.45} material={seat}>
        <cylinderGeometry args={[0.26, 0.26, 0.08, 20]} />
      </mesh>
      <mesh position={[0, 0.7, 0.27]} rotation-x={-0.12} material={seat}>
        <boxGeometry args={[0.44, 0.36, 0.06]} />
      </mesh>
      {!lite && (
        <>
          <mesh position-y={0.22} material={M.metal}>
            <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          </mesh>
          <mesh position-y={0.03} material={M.metal}>
            <cylinderGeometry args={[0.24, 0.24, 0.03, 5]} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function Plant({ scale = 1, tall = false }: { scale?: number; tall?: boolean }) {
  return (
    <group scale={scale}>
      <mesh position-y={0.25} material={M.pot}>
        <cylinderGeometry args={[0.24, 0.19, 0.5, 16]} />
      </mesh>
      {(tall ? [0.85, 1.25, 1.6] : [0.75, 0.95]).map((y, i) => (
        <mesh key={i} position={[i % 2 ? 0.08 : -0.06, y, 0]} scale={tall ? 0.42 - i * 0.06 : 0.38 - i * 0.08}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial map={leafTex([1, 1])} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function Sofa({ color = '#2f7bff', w = 2.2 }: { color?: string; w?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  return (
    <group>
      <RoundedBox args={[w, 0.42, 0.9]} radius={0.08} position-y={0.3} material={mat} />
      <RoundedBox args={[w, 0.6, 0.22]} radius={0.08} position={[0, 0.6, 0.36]} material={mat} />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.22, 0.5, 0.9]} radius={0.08} position={[s * (w / 2 - 0.11), 0.45, 0]} material={mat} />
      ))}
    </group>
  );
}

export function CoffeeTable() {
  return (
    <group>
      <mesh position-y={0.36} material={M.oak}>
        <cylinderGeometry args={[0.55, 0.55, 0.05, 28]} />
      </mesh>
      <mesh position-y={0.18} material={M.dark}>
        <cylinderGeometry args={[0.06, 0.12, 0.34, 10]} />
      </mesh>
    </group>
  );
}

export function Shelf({ w = 1.8 }: { w?: number }) {
  const books = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({ x: (i % 9) / 9, y: Math.floor(i / 9), h: 0.22 + ((i * 37) % 10) / 70, c: ['#2f7bff', '#13c7e6', '#2ff0a6', '#e9e4da', '#c46a45', '#1d2430'][i % 6] })),
    [],
  );
  return (
    <group>
      <mesh position-y={0.9} material={M.white}>
        <boxGeometry args={[w, 1.8, 0.36]} />
      </mesh>
      {books.map((b, i) => (
        <mesh key={i} position={[(b.x - 0.45) * (w - 0.2), 0.5 + b.y * 0.6 + b.h / 2, 0.2]}>
          <boxGeometry args={[0.13, b.h, 0.04]} />
          <meshStandardMaterial color={b.c} />
        </mesh>
      ))}
    </group>
  );
}

/** Lange vergadertafel met stoelen rondom. */
export function MeetingTable({ length = 4, seats = 8 }: { length?: number; seats?: number }) {
  const per = Math.ceil(seats / 2);
  return (
    <group>
      <RoundedBox args={[length, 0.06, 1.3]} radius={0.03} position-y={0.75} material={M.oak} receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (length / 2 - 0.4), 0.37, 0]} material={M.dark}>
          <boxGeometry args={[0.08, 0.72, 0.9]} />
        </mesh>
      ))}
      {Array.from({ length: per }, (_, i) => {
        const x = (i / Math.max(1, per - 1) - 0.5) * (length - 0.9);
        return [1, -1].map((s) => (
          <group key={`${i}${s}`} position={[x, 0, s * 0.15]} rotation-y={s > 0 ? 0 : Math.PI}>
            <Chair color="#e9e4da" />
          </group>
        ));
      })}
    </group>
  );
}

export function Rug({ w, d, color }: { w: number; d: number; color: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.012} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** Keukenhoek: werkblad met bovenkasten, koffiemachine en barkrukken. */
export function Kitchenette({ accent = '#13c7e6' }: { accent?: string }) {
  const acc = useMemo(() => new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 }), [accent]);
  return (
    <group>
      <mesh position={[0, 0.45, 0]} material={M.white} receiveShadow>
        <boxGeometry args={[3.6, 0.9, 0.65]} />
      </mesh>
      <mesh position={[0, 0.92, 0]} material={M.oak}>
        <boxGeometry args={[3.7, 0.05, 0.7]} />
      </mesh>
      <mesh position={[0, 2.05, -0.12]} material={M.white}>
        <boxGeometry args={[3.6, 0.7, 0.4]} />
      </mesh>
      <mesh position={[0, 1.55, -0.3]} material={acc}>
        <boxGeometry args={[3.6, 0.3, 0.02]} />
      </mesh>
      <mesh position={[-1.1, 1.13, -0.05]} material={M.dark}>
        <boxGeometry args={[0.36, 0.38, 0.36]} />
      </mesh>
      <mesh position={[0.9, 1.06, 0]} material={M.metal}>
        <cylinderGeometry args={[0.22, 0.2, 0.22, 20]} />
      </mesh>
      {/* Eiland met krukken */}
      <group position={[0, 0, 1.7]}>
        <mesh position-y={0.52} material={acc}>
          <boxGeometry args={[2.4, 1.04, 0.6]} />
        </mesh>
        <mesh position-y={1.06} material={M.oak}>
          <boxGeometry args={[2.6, 0.05, 0.8]} />
        </mesh>
        {[-0.8, 0, 0.8].map((x) => (
          <group key={x} position={[x, 0, 0.75]}>
            <mesh position-y={0.72} material={M.dark}>
              <cylinderGeometry args={[0.19, 0.19, 0.06, 16]} />
            </mesh>
            <mesh position-y={0.36} material={M.metal}>
              <cylinderGeometry args={[0.025, 0.025, 0.7, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Glazen belcabine voor een gesprek in stilte. */
export function Booth({ color = '#2f7bff' }: { color?: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color]);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bfe3f2', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }), []);
  return (
    <group>
      <mesh position-y={2.3} material={mat}>
        <boxGeometry args={[1.7, 0.12, 1.7]} />
      </mesh>
      <mesh position={[0, 1.15, -0.8]} material={mat}>
        <boxGeometry args={[1.7, 2.3, 0.08]} />
      </mesh>
      {[-0.82, 0.82].map((x) => (
        <mesh key={x} position={[x, 1.15, 0]} rotation-y={Math.PI / 2} material={glass}>
          <planeGeometry args={[1.6, 2.3]} />
        </mesh>
      ))}
      <mesh position={[0, 1.15, 0.82]} material={glass}>
        <planeGeometry args={[1.6, 2.3]} />
      </mesh>
      <mesh position={[0, 0.72, -0.5]} material={M.oak}>
        <boxGeometry args={[1.2, 0.04, 0.5]} />
      </mesh>
      <group position={[0, 0, -0.9]}>
        <Chair color="#e9e4da" />
      </group>
    </group>
  );
}

/** Lage plantenbak met groen, langs het glas. */
export function Planter({ w = 2.4, lite = false }: { w?: number; lite?: boolean }) {
  return (
    <group>
      <mesh position-y={0.3} material={M.dark}>
        <boxGeometry args={[w, 0.6, 0.55]} />
      </mesh>
      {lite && (
        <mesh position-y={0.78} scale={[w / 2 - 0.1, 0.28, 0.3]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial map={leafTex([2, 1])} roughness={1} />
        </mesh>
      )}
      {!lite && Array.from({ length: Math.round(w / 0.45) }, (_, i) => (
        <mesh key={i} position={[(i / Math.max(1, Math.round(w / 0.45) - 1) - 0.5) * (w - 0.4), 0.75 + (i % 2) * 0.08, 0]} scale={0.32 + (i % 3) * 0.05}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial map={leafTex([1, 1], i % 2 ? 'groen' : 'donker')} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Ronde sta-tafel voor een korte stand-up. */
export function StandingTable() {
  return (
    <group>
      <mesh position-y={1.05} material={M.oak}>
        <cylinderGeometry args={[0.7, 0.7, 0.05, 28]} />
      </mesh>
      <mesh position-y={0.52} material={M.dark}>
        <cylinderGeometry args={[0.06, 0.06, 1.04, 10]} />
      </mesh>
      <mesh position-y={0.02} material={M.dark}>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 20]} />
      </mesh>
    </group>
  );
}

export function WaterCooler() {
  return (
    <group>
      <mesh position-y={0.5} material={M.white}>
        <boxGeometry args={[0.36, 1, 0.36]} />
      </mesh>
      <mesh position-y={1.18}>
        <cylinderGeometry args={[0.15, 0.15, 0.38, 16]} />
        <meshStandardMaterial color="#9fd8ff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
