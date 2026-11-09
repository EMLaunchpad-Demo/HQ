// Vloeiend rondlopen op een laptop: al wat stilstaat, wordt tijdens de rondloopmodus per materiaal en per stuk
// van het perceel samengevoegd. Zo daalt het aantal tekenopdrachten met een veelvoud en blijft de scène zelf ongemoeid.
// Bij het verlaten komt alles exact terug. Wat beweegt of verandert (personages, deuren, schermen) blijft los: noMerge.
import * as THREE from 'three';

const CEL = 12;
const tmp = new THREE.Vector3();

export interface Batch {
  groep: THREE.Group;
  verborgen: THREE.Object3D[];
  voor: number;
  na: number;
}

/** Meubels krijgen elk hun eigen materiaal-object; wat er hetzelfde uitziet, mag toch samen getekend worden. */
function kenmerk(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial;
  return [m.type, m.side, s.color?.getHex(), s.emissive?.getHex(), s.emissiveIntensity, s.roughness, s.metalness, s.envMapIntensity, s.map?.uuid, s.emissiveMap?.uuid, s.bumpMap?.uuid, s.bumpScale, s.normalMap?.uuid, s.roughnessMap?.uuid, s.toneMapped].join('/');
}

export function voegSamen(scene: THREE.Object3D): Batch {
  scene.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; items: THREE.Mesh[] }>();
  let voor = 0;
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noMerge || o.userData.noCollide) return;
    const m = o as THREE.Mesh & { isInstancedMesh?: boolean; isTroikaText?: boolean };
    if (m.isTroikaText) return;
    if (m.isMesh && !m.isInstancedMesh && m.geometry && !Array.isArray(m.material)) {
      voor++;
      const g = m.geometry;
      const mat = m.material;
      if (g.attributes.position &&!g.attributes.color && !g.morphAttributes.position && !mat.transparent && mat.colorWrite !== false && m.matrixWorld.determinant() > 0) {
        if (!g.boundingSphere) g.computeBoundingSphere();
        const c = tmp.copy(g.boundingSphere!.center).applyMatrix4(m.matrixWorld);
        const r = g.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis();
        // Grote stukken (land, gevels) blijven los: die wegfilteren heeft geen zin en ze horen in geen enkel vak.
        if (r < 40 && m.children.length === 0) {
          const k = `${kenmerk(mat)}|${m.castShadow}|${m.receiveShadow}|${Math.floor(c.x / CEL)}|${Math.floor(c.z / CEL)}|${c.y > 3.6 ? 1 : 0}`;
          let b = buckets.get(k);
          if (!b) buckets.set(k, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, items: [] }));
          b.items.push(m);
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(scene);

  const groep = new THREE.Group();
  groep.name = 'rondlopen-samengevoegd';
  groep.userData.noCollide = true;
  const verborgen: THREE.Object3D[] = [];
  const normal = new THREE.Matrix3();
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    let verts = 0;
    let inds = 0;
    for (const m of b.items) {
      const g = m.geometry;
      verts += g.attributes.position.count;
      inds += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx = new Uint32Array(inds);
    let vo = 0;
    let io = 0;
    for (const m of b.items) {
      const g = m.geometry;
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const t = g.attributes.uv;
      normal.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        tmp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        pos[(vo + i) * 3] = tmp.x;
        pos[(vo + i) * 3 + 1] = tmp.y;
        pos[(vo + i) * 3 + 2] = tmp.z;
        if (n) {
          tmp.fromBufferAttribute(n, i).applyMatrix3(normal).normalize();
          nor[(vo + i) * 3] = tmp.x;
          nor[(vo + i) * 3 + 1] = tmp.y;
          nor[(vo + i) * 3 + 2] = tmp.z;
        }
        if (t) {
          uv[(vo + i) * 2] = t.getX(i);
          uv[(vo + i) * 2 + 1] = t.getY(i);
        }
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
      vo += p.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.userData.noCollide = true;
    mesh.userData.noMerge = true;
    groep.add(mesh);
    for (const m of b.items) {
      m.visible = false;
      verborgen.push(m);
    }
  }
  scene.add(groep);
  return { groep, verborgen, voor, na: voor - verborgen.length + groep.children.length };
}

export function maakLos(scene: THREE.Object3D, b: Batch) {
  scene.remove(b.groep);
  for (const c of b.groep.children) (c as THREE.Mesh).geometry.dispose();
  for (const o of b.verborgen) o.visible = true;
}
