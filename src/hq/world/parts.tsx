// Gedeelde bouwdelen van het HQ.
import { glassMat, steelMat } from './dims';

/** Glazen gevel met zwarte stalen kaders, zoals de kantoren op de referentiefoto. */
export function GlassFront({ w, h, every = 2.5, door = true, hidePane = false }: { w: number; h: number; every?: number; door?: boolean; hidePane?: boolean }) {
  const n = Math.max(1, Math.round(w / every));
  return (
    <group>
      {!hidePane && (
        <mesh position-y={h / 2} material={glassMat}>
          <planeGeometry args={[w, h]} />
        </mesh>
      )}
      {Array.from({ length: n + 1 }, (_, i) => (
        <mesh key={i} position={[(i / n - 0.5) * w, h / 2, 0]} material={steelMat}>
          <boxGeometry args={[0.07, h, 0.08]} />
        </mesh>
      ))}
      {[0.04, h - 0.04, ...(h > 1.3 ? [1.05] : [])].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={steelMat}>
          <boxGeometry args={[w, 0.06, 0.08]} />
        </mesh>
      ))}
      {door && (
        <mesh position={[w / 2 - 1.2, 1.1, 0.06]} material={steelMat}>
          <boxGeometry args={[0.03, 0.4, 0.06]} />
        </mesh>
      )}
    </group>
  );
}

