// Maten van het HQ-warehouse (meter) en het glas dat overal terugkomt.
// Eén grote hal: afdelingsruimtes onder een tussenverdieping die helemaal rond loopt, in het midden een open arena.
import * as THREE from 'three';

export const B = {
  /** Breedte (x) en diepte (z) van de hal, binnenkant. */
  W: 40,
  D: 28,
  /** Hoogte van de gevels en de nok bovenop. */
  H: 9.5,
  RISE: 3,
  /** Middelpunt van het gebouw (z). */
  Z: -20,
  /** Bovenkant van de tussenverdieping en de diepte ervan (rondom). */
  MZ: 3.8,
  MD: 5,
};

/** Hoogte van de ruimtes onder de tussenverdieping. */
export const ROOM_H = B.MZ - 0.35;

export const glassMat = new THREE.MeshStandardMaterial({
  color: '#9fbccb', transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.6, envMapIntensity: 1.8,
  depthWrite: false, side: THREE.DoubleSide,
});

export const steelMat = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.45, metalness: 0.7 });
