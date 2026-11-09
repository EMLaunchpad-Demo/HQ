// De rondloopmodus (first person): waar je staat en de botsingen, los van de 3D-scène.
// De botsingen worden één keer automatisch uit het gebouw gelezen, zodat nieuw meubilair vanzelf meedoet.
import * as THREE from 'three';

/** Waar je voeten staan (wereldcoördinaten). Deuren en het label van de ruimte lezen dit. */
export const walkPos = new THREE.Vector3(0, 0, 0);

export const BODY_R = 0.26;
export const STEP = 0.3;
export const HEAD = 1.82;

export interface Blok {
  /** Middelpunt in het grondvlak, halve maten en de draaiing rond de verticale as. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  bottom: number;
  top: number;
}

const CEL = 4;
const key = (cx: number, cz: number) => (cx + 512) * 4096 + (cz + 512);

export class Botsingen {
  grid = new Map<number, Blok[]>();
  aantal = 0;

  add(b: Blok) {
    const r = Math.hypot(b.hx, b.hz) + BODY_R + 0.1;
    for (let cx = Math.floor((b.x - r) / CEL); cx <= Math.floor((b.x + r) / CEL); cx++)
      for (let cz = Math.floor((b.z - r) / CEL); cz <= Math.floor((b.z + r) / CEL); cz++) {
        const k = key(cx, cz);
        const l = this.grid.get(k);
        if (l) l.push(b);
        else this.grid.set(k, [b]);
      }
    this.aantal++;
  }

  near(x: number, z: number): Blok[] {
    return this.grid.get(key(Math.floor(x / CEL), Math.floor(z / CEL))) ?? [];
  }

  /** De hoogste vloer onder je voeten (trap, tapijt, tussenverdieping): alles waar je op kan stappen. */
  floorAt(x: number, z: number, feet: number): number {
    let best = 0;
    for (const b of this.near(x, z)) {
      if (b.top > feet + STEP || b.top <= best) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) <= b.hx + 0.04 && Math.abs(lz) <= b.hz + 0.04) best = b.top;
    }
    return best;
  }

  /** Duwt je lichaam uit alles waar je tegenaan loopt, zodat je langs muren schuift in plaats van vast te lopen. */
  push(p: { x: number; z: number }, feet: number) {
    for (let it = 0; it < 3; it++) {
      let hit = false;
      for (const b of this.near(p.x, p.z)) {
        if (b.top <= feet + STEP || b.bottom >= feet + HEAD) continue;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const lx = dx * b.cos - dz * b.sin;
        const lz = dx * b.sin + dz * b.cos;
        const cx = Math.max(-b.hx, Math.min(b.hx, lx));
        const cz = Math.max(-b.hz, Math.min(b.hz, lz));
        let nx = lx - cx;
        let nz = lz - cz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= BODY_R * BODY_R) continue;
        const d = Math.sqrt(d2);
        let move: number;
        if (d < 1e-4) {
          // Middelpunt zit in het blok: langs de kortste weg eruit.
          const ex = b.hx - Math.abs(lx);
          const ez = b.hz - Math.abs(lz);
          if (ex < ez) {
            nx = Math.sign(lx) || 1;
            nz = 0;
            move = ex + BODY_R;
          } else {
            nx = 0;
            nz = Math.sign(lz) || 1;
            move = ez + BODY_R;
          }
        } else {
          nx /= d;
          nz /= d;
          move = BODY_R - d;
        }
        p.x += (nx * b.cos + nz * b.sin) * move;
        p.z += (-nx * b.sin + nz * b.cos) * move;
        hit = true;
      }
      if (!hit) break;
    }
  }
}

const mV = new THREE.Vector3();
const mQ = new THREE.Quaternion();
const mS = new THREE.Vector3();
const mM = new THREE.Matrix4();
const mC = new THREE.Vector3();
const AX = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const RANGE = 95;

/** Eén blok uit een lokale box en zijn wereldmatrix. Schuin gekantelde stukken (dak, trapbomen) tellen niet mee. */
function blokVan(box: THREE.Box3, world: THREE.Matrix4): Blok | null {
  box.getCenter(mC).applyMatrix4(world);
  if (Math.abs(mC.x) > RANGE || Math.abs(mC.z) > RANGE) return null;
  world.decompose(mV, mQ, mS);
  mM.makeRotationFromQuaternion(mQ);
  AX[0].setFromMatrixColumn(mM, 0);
  AX[1].setFromMatrixColumn(mM, 1);
  AX[2].setFromMatrixColumn(mM, 2);
  const half = [((box.max.x - box.min.x) / 2) * Math.abs(mS.x), ((box.max.y - box.min.y) / 2) * Math.abs(mS.y), ((box.max.z - box.min.z) / 2) * Math.abs(mS.z)];
  // Welke lokale as staat verticaal? De andere twee liggen dan in het grondvlak.
  const ups = AX.map((a) => Math.abs(a.y));
  const up = ups.indexOf(Math.max(...ups));
  if (ups[up] < 0.985) return null;
  const [ia, ib] = up === 0 ? [1, 2] : up === 1 ? [0, 2] : [0, 1];
  const a = AX[ia];
  const hx = half[ia];
  const hz = half[ib];
  if (Math.max(hx, hz) > 60) return null; // land, straat en lucht
  if (Math.max(hx, hz) < 0.03) return null; // kabels en kleine spullen
  const len = Math.hypot(a.x, a.z) || 1;
  return { x: mC.x, z: mC.z, hx, hz, cos: a.x / len, sin: -a.z / len, bottom: mC.y - half[up], top: mC.y + half[up] };
}

export function bouwBotsingen(scene: THREE.Object3D, extra: Blok[] = []): Botsingen {
  const col = new Botsingen();
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noCollide) return;
    const u = o as THREE.InstancedMesh & { isMesh?: boolean; isTroikaText?: boolean; isInstancedMesh?: boolean };
    if (u.isTroikaText) return;
    if (u.isMesh && u.geometry) {
      const m = Array.isArray(u.material) ? u.material[0] : u.material;
      if (m && m.colorWrite !== false && !(m.transparent && m.opacity === 0)) {
        if (!u.geometry.boundingBox) u.geometry.computeBoundingBox();
        const box = u.geometry.boundingBox;
        if (box && !box.isEmpty()) {
          if (u.isInstancedMesh) {
            for (let i = 0; i < u.count; i++) {
              inst.fromArray(u.instanceMatrix.array, i * 16);
              world.multiplyMatrices(u.matrixWorld, inst);
              const b = blokVan(box, world);
              if (b) col.add(b);
            }
          } else {
            const b = blokVan(box, u.matrixWorld);
            if (b) col.add(b);
          }
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(scene);
  for (const b of extra) col.add(b);
  return col;
}
