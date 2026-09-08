// util.js - shared helpers (toon materials, outlines, canvas text, rng)
import * as THREE from 'three';

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([80, 140, 200, 255]); // 4-step toon ramp
  _grad = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.flat ? 1 : 0);
  if (!opts.noCache && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.6,
  });
  if (!opts.noCache) matCache.set(key, m);
  return m;
}

// Inverted-hull ink outline. Returns a mesh to add as sibling/child.
export function outline(geometry, scale = 1.045, color = 0x111111) {
  const m = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  );
  m.scale.setScalar(scale);
  return m;
}

// Mesh with matching outline as a group
export function toonMesh(geometry, color, oScale = 1.045, opts = {}) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toon(color, opts));
  g.add(mesh);
  if (oScale) g.add(outline(geometry, oScale));
  g.mainMesh = mesh;
  return g;
}

// Canvas text texture -> plane mesh (always faces +Z, good for signs)
export function textPlane(text, opts = {}) {
  const {
    font = 'bold 64px "Comic Sans MS", cursive, sans-serif',
    fg = '#ffffff', bg = null, stroke = '#000000', strokeWidth = 8,
    w = 512, h = 128, worldW = 8, worldH = 2,
  } = opts;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, w / 2, h / 2); }
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, side: THREE.DoubleSide })
  );
  return mesh;
}

// Seeded-ish rng helpers
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// AABB collider helper
export function aabb(cx, cz, hx, hz, tag = 'building') {
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, tag };
}
export function pointInAABB(x, z, b, pad = 0) {
  return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
}
// Resolve a circle (x,z,r) against AABB; returns corrected [x,z] and hit flag
export function resolveCircleAABB(x, z, r, b) {
  const nx = clamp(x, b.minX, b.maxX);
  const nz = clamp(z, b.minZ, b.maxZ);
  const dx = x - nx, dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [nx + (dx / d) * r, nz + (dz / d) * r, (dx / d), (dz / d)];
  }
  // center inside: push out along smallest axis
  const pushL = x - b.minX + r, pushR = b.maxX - x + r;
  const pushB = z - b.minZ + r, pushF = b.maxZ - z + r;
  const m = Math.min(pushL, pushR, pushB, pushF);
  if (m === pushL) return [b.minX - r, z, -1, 0];
  if (m === pushR) return [b.maxX + r, z, 1, 0];
  if (m === pushB) return [x, b.minZ - r, 0, -1];
  return [x, b.maxZ + r, 0, 1];
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
