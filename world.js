// world.js - procedural Springfield-style town (all original art)
import * as THREE from 'three';
import { toon, toonMesh, textPlane, rand, randInt, choice, aabb } from './util.js';
import { makeCharacter } from './chars.js';

export const ROADS = [-150, -90, -30, 30, 90, 150];
export const ROAD_W = 14;
export const BLOCKS = [-120, -60, 0, 60, 120];
export const WORLD_BOUND = 175;

// ---------- particles ----------
export class ParticleSystem {
  constructor(scene, max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = [];
    this.life = new Float32Array(max);
    this.alive = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) { this.vel.push(new THREE.Vector3()); this.life[i] = 0; this.pos[i * 3 + 1] = -999; }
  }
  spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.life[i] = life;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        this.vel[i].set(vx, vy, vz);
        this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
        return;
      }
    }
  }
  burst(x, y, z, n, spread, up, life, r, g, b) {
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z,
        (Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread,
        life * (0.5 + Math.random() * 0.5), r, g, b);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        this.vel[i].y -= 6 * dt;
        this.pos[i * 3] += this.vel[i].x * dt;
        this.pos[i * 3 + 1] += this.vel[i].y * dt;
        this.pos[i * 3 + 2] += this.vel[i].z * dt;
        if (this.pos[i * 3 + 1] < 0.1) { this.pos[i * 3 + 1] = 0.1; this.vel[i].y *= -0.3; this.vel[i].x *= 0.7; this.vel[i].z *= 0.7; }
        if (this.life[i] <= 0) this.pos[i * 3 + 1] = -999;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------- building helpers ----------
function house(scene, colliders, x, z, opts = {}) {
  const g = new THREE.Group();
  const w = opts.w || rand(9, 13), d = opts.d || rand(8, 12), h = opts.h || rand(4.5, 6.5);
  const wallColor = opts.color || choice([0xf7a8b8, 0xa8d8f7, 0xfff3a0, 0xc8f7a8, 0xf7d0a8, 0xe0b0ff, 0xffb8e6]);
  const roofColor = opts.roof || choice([0x8b5a2b, 0xa0522d, 0x6b4226, 0x994444]);
  // walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(wallColor));
  walls.position.y = h / 2;
  g.add(walls);
  // roof: 4-seg cone pyramid
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.55, 4), toon(roofColor));
  roof.position.y = h + h * 0.27; roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  g.add(roof);
  // door
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), toon(0x7a4a21));
  door.position.set(0, 1.1, d / 2 + 0.02);
  g.add(door);
  // windows
  const winMat = toon(0xbfe8ff, { emissive: 0x88bbdd, emissiveIntensity: 0.35 });
  for (let i = -1; i <= 1; i += 2) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), winMat);
    win.position.set(i * w * 0.28, h * 0.62, d / 2 + 0.02);
    g.add(win);
    const win2 = win.clone(); win2.position.z = -d / 2 - 0.02; win2.rotation.y = Math.PI;
    g.add(win2);
  }
  // chimney
  if (Math.random() < 0.7) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), toon(0x999999));
    ch.position.set(w * 0.3, h + 1, 0);
    g.add(ch);
  }
  g.position.set(x, 0, z);
  g.rotation.y = opts.rotY || 0;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  const rot = Math.abs(Math.sin(opts.rotY || 0)) > 0.5;
  colliders.push(aabb(x, z, (rot ? d : w) / 2 + 0.2, (rot ? w : d) / 2 + 0.2));
  return g;
}

function flatBuilding(scene, colliders, x, z, w, d, h, color, signText, signColors = {}) {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  walls.position.y = h / 2;
  g.add(walls);
  const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.5, d + 1), toon(0x555555));
  roofSlab.position.y = h + 0.25;
  g.add(roofSlab);
  const winMat = toon(0xbfe8ff, { emissive: 0x99ccee, emissiveIntensity: 0.4 });
  const nWin = Math.floor(w / 3.2);
  for (let i = 0; i < nWin; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), winMat);
    win.position.set(-w / 2 + 2 + i * 3.2, h * 0.6, d / 2 + 0.02);
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), toon(0x333333));
  door.position.set(0, 1.2, d / 2 + 0.02);
  g.add(door);
  if (signText) {
    const sign = textPlane(signText, {
      fg: signColors.fg || '#ffffff', bg: signColors.bg || '#cc2222',
      worldW: Math.min(w * 0.9, 16), worldH: 2.2, stroke: signColors.stroke || '#000000',
    });
    sign.position.set(0, h + 1.8, d / 2 + 0.1);
    g.add(sign);
  }
  g.position.set(x, 0, z);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  colliders.push(aabb(x, z, w / 2 + 0.2, d / 2 + 0.2));
  return g;
}

function coolingTower(scene, colliders, x, z) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = 5.2 - Math.sin(t * Math.PI) * 1.6 + t * 1.4;
    pts.push(new THREE.Vector2(r, t * 16));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  const m = new THREE.Mesh(geo, toon(0xcfcfcf));
  m.position.set(x, 0, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.3, 6, 16), toon(0xbbbbbb));
  rim.position.set(x, 16, z); rim.rotation.x = Math.PI / 2;
  scene.add(rim);
  colliders.push(aabb(x, z, 5.5, 5.5));
  return { x, z, topY: 16 };
}

// ---------- main build ----------
export function buildWorld(scene) {
  const colliders = [];
  const props = [];       // destructible {mesh,x,z,r,type,alive,coins}
  const coins = [];       // {mesh,x,y,z,taken}
  const cans = [];        // cola collectibles
  const gags = [];        // {x,z,r,name,mesh,animated,done,trigger()}
  const givers = [];      // mission npcs
  const animated = [];    // fn(t, dt)
  const landmarks = [];   // for minimap {x,z,color,label}

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_BOUND * 2 + 40, WORLD_BOUND * 2 + 40), toon(0x6fbf3f));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // block lawns (slightly raised, different green) + sidewalk frame
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), toon(0xbfbfbf));
    walk.rotation.x = -Math.PI / 2; walk.position.set(bx, 0.04, bz);
    walk.receiveShadow = true;
    scene.add(walk);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), toon(0x7ccf4a));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(bx, 0.09, bz);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  // roads with dashed center line (canvas texture)
  const roadTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3d3d3d'; ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#ffd90f'; ctx.fillRect(30, 10, 4, 48);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const r of ROADS) {
    const texV = roadTex.clone(); texV.needsUpdate = true; texV.repeat.set(1, 24);
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, WORLD_BOUND * 2), new THREE.MeshToonMaterial({ map: texV, gradientMap: null, color: 0xffffff }));
    rv.rotation.x = -Math.PI / 2; rv.position.set(r, 0.02, 0);
    rv.receiveShadow = true;
    scene.add(rv);
    const texH = roadTex.clone(); texH.needsUpdate = true; texH.repeat.set(24, 1); texH.rotation = 0;
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_BOUND * 2, ROAD_W), new THREE.MeshToonMaterial({ map: texH, color: 0xffffff }));
    rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.021, r);
    rh.receiveShadow = true;
    scene.add(rh);
  }
  // intersections (plain asphalt, kill dashes)
  for (const rx of ROADS) for (const rz of ROADS) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 0.4, ROAD_W + 0.4), toon(0x3d3d3d));
    p.rotation.x = -Math.PI / 2; p.position.set(rx, 0.03, rz);
    p.receiveShadow = true;
    scene.add(p);
  }

  // ----- player home: pink two-story + garage (742 Evergreen Terrace) -----
  const homeBlock = { x: 0, z: 0 };
  house(scene, colliders, -8, -6, { w: 12, d: 10, h: 7.5, color: 0xf7a8b8, roof: 0x8b5a2b });
  const garage = flatBuilding(scene, colliders, 8, -6, 9, 8, 4, 0xf7c8d8, null);
  const gDoor = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), toon(0x8b5a2b));
  gDoor.position.set(8, 1.5, -6 + 4.03);
  scene.add(gDoor);
  const homeSign = textPlane('742 EVERGREEN TERRACE', { fg: '#fff', bg: '#2b7a2b', worldW: 8, worldH: 1.1 });
  homeSign.position.set(0, 2.6, 8.5);
  scene.add(homeSign);
  landmarks.push({ x: 0, z: 0, color: '#f7a8b8' });
  // car in the driveway handled by vehicles.js spawn point

  // ----- power plant (-120,-120) -----
  const towers = [coolingTower(scene, colliders, -132, -126), coolingTower(scene, colliders, -112, -118)];
  flatBuilding(scene, colliders, -116, -134, 22, 10, 8, 0x8a8a9a, 'SPRINGFIELD NUCLEAR PLANT', { bg: '#ffd90f', fg: '#222', stroke: '#222' });
  landmarks.push({ x: -120, z: -120, color: '#ffff66' });
  animated.push((t, dt, particles) => {
    if (Math.random() < 0.25) {
      const tw = choice(towers);
      particles.spawn(tw.x + rand(-1, 1), tw.topY, tw.z + rand(-1, 1), rand(-0.4, 0.4), rand(1.5, 2.5), rand(-0.4, 0.4), 2.5, 0.85, 0.85, 0.9);
    }
  });

  // ----- Lard Lad Donuts (-60,-120) -----
  flatBuilding(scene, colliders, -60, -120, 16, 12, 6, 0x9a6b4f, 'LARD LAD DONUTS', { bg: '#e86fa8', fg: '#fff' });
  const donut = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.TorusGeometry(3, 1.3, 10, 20), toon(0xe8a85c));
  const frost = new THREE.Mesh(new THREE.TorusGeometry(3, 1.42, 10, 20, Math.PI), toon(0xf78fc1, { emissive: 0x551133, emissiveIntensity: 0.25 }));
  donut.add(dough); donut.add(frost);
  donut.position.set(-60, 10, -120);
  donut.rotation.x = Math.PI / 2.3;
  scene.add(donut);
  donut.traverse(o => { if (o.isMesh) o.castShadow = true; });
  animated.push((t) => { donut.rotation.z = t * 0.4; });
  landmarks.push({ x: -60, z: -120, color: '#f78fc1' });

  // ----- Kwiki-Mart (60,-120) -----
  flatBuilding(scene, colliders, 60, -120, 18, 12, 6, 0x2ba8a0, 'KWIKI-MART', { bg: '#ff7b00', fg: '#fff' });
  landmarks.push({ x: 60, z: -120, color: '#ff7b00' });

  // ----- school (120,60) -----
  flatBuilding(scene, colliders, 120, 60, 30, 12, 7, 0xd4765e, 'SPRINGFIELD ELEMENTARY', { bg: '#fff', fg: '#222', stroke: '#666' });
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10), toon(0xcccccc));
  flagPole.position.set(104, 5, 52);
  scene.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), toon(0xd43a2f, { noCache: true }));
  flag.position.set(105.3, 9, 52);
  scene.add(flag);
  animated.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.3; });
  landmarks.push({ x: 120, z: 60, color: '#d4765e' });

  // ----- church (-120,60) -----
  const church = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 18), toon(0xf5f0e6));
  nave.position.y = 3.5; church.add(nave);
  const steep = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 4), toon(0xf5f0e6));
  steep.position.set(0, 5, 9.5); church.add(steep);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 4), toon(0x777777));
  spire.position.set(0, 12.5, 9.5); spire.rotation.y = Math.PI / 4; church.add(spire);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), toon(0xffd90f, { emissive: 0x554400 }));
  crossV.position.set(0, 16.2, 9.5); church.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.3), toon(0xffd90f, { emissive: 0x554400 }));
  crossH.position.set(0, 16.2, 9.5); church.add(crossH);
  church.position.set(-120, 0, 60);
  church.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(church);
  colliders.push(aabb(-120, 60, 6.2, 9.2), aabb(-120, 69.5, 2.2, 2.2));
  landmarks.push({ x: -120, z: 60, color: '#f5f0e6' });

  // ----- Moe's Tavern (60,120) -----
  flatBuilding(scene, colliders, 60, 120, 14, 10, 5.5, 0x7a4a8a, "MOE'S TAVERN", { bg: '#3a2a4a', fg: '#ffd90f' });
  landmarks.push({ x: 60, z: 120, color: '#7a4a8a' });

  // ----- residential blocks -----
  const residential = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const isSpecial =
      (bx === 0 && bz === 0) || (bx === -120 && bz === -120) || (bx === -60 && bz === -120) ||
      (bx === 60 && bz === -120) || (bx === 120 && bz === 60) || (bx === -120 && bz === 60) ||
      (bx === 60 && bz === 120);
    if (!isSpecial) residential.push([bx, bz]);
  }
  for (const [bx, bz] of residential) {
    const n = randInt(2, 3);
    const spots = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[i];
      const rotY = choice([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      house(scene, colliders, bx + ox, bz + oz, { rotY });
    }
    // one tree on the block
    tree(scene, bx + 14, bz + 14, rand(0.8, 1.3));
    colliders.push(aabb(bx + 14, bz + 14, 0.5, 0.5, 'tree'));
  }

  // ----- trees along roads -----
  function tree(scene, x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 2.4 * s), toon(0x7a4a21));
    trunk.position.y = 1.2 * s;
    const fol = new THREE.Mesh(new THREE.SphereGeometry(2.2 * s, 10, 8), toon(0x3f9b2f));
    fol.position.y = 3.6 * s; fol.scale.y = 1.15;
    const fol2 = new THREE.Mesh(new THREE.SphereGeometry(1.5 * s, 8, 6), toon(0x4cb13a));
    fol2.position.set(1 * s, 4.6 * s, 0.4 * s);
    g.add(trunk, fol, fol2);
    g.position.set(x, 0, z);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return g;
  }
  for (let i = 0; i < 14; i++) {
    const onX = Math.random() < 0.5;
    const along = rand(-160, 160);
    const road = choice(ROADS) + (ROAD_W / 2 + 2.5) * (Math.random() < 0.5 ? 1 : -1);
    const x = onX ? road : along, z = onX ? along : road;
    tree(scene, x, z, rand(0.7, 1.1));
    colliders.push(aabb(x, z, 0.5, 0.5, 'tree'));
  }

  // ----- destructible props -----
  function addProp(mesh, x, z, r, type, coinVal) {
    mesh.position.set(x, 0, z);
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(mesh);
    props.push({ mesh, x, z, r, type, alive: true, coins: coinVal });
  }
  function crateMesh() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), toon(0xb5854a));
    m.position.y = 0.7; g.add(m);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1.5), toon(0x8a6234));
    band.position.y = 0.7; g.add(band);
    return g;
  }
  function mailboxMesh() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1), toon(0x666666));
    pole.position.y = 0.55;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), toon(0x3a6fd4));
    box.position.y = 1.25;
    g.add(pole, box);
    return g;
  }
  function hydrantMesh() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.9), toon(0xd43a2f));
    b.position.y = 0.45;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), toon(0xd43a2f));
    top.position.y = 0.95;
    g.add(b, top);
    return g;
  }
  function trashMesh() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.1, 10), toon(0x8a8a8a));
    b.position.y = 0.55;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10), toon(0xaaaaaa));
    lid.position.y = 1.15;
    g.add(b, lid);
    return g;
  }
  function benchMesh() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.7), toon(0x8a6234));
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 0.12), toon(0x8a6234));
    back.position.set(0, 0.95, -0.3);
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6), toon(0x444444));
    legA.position.set(-0.8, 0.27, 0);
    const legB = legA.clone(); legB.position.x = 0.8;
    g.add(seat, back, legA, legB);
    return g;
  }
  // scatter props
  const propSpots = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    propSpots.push([bx + rand(-18, 18), bz + rand(-18, 18), choice(['mailbox', 'hydrant', 'trash'])]);
  }
  propSpots.push([58, -110, 'crate'], [63, -110, 'crate'], [55, -108, 'crate'],
    [-57, -112, 'trash'], [117, 52, 'bench'], [123, 52, 'bench'],
    [-117, 52, 'bench'], [64, 114, 'trash'], [-5, 12, 'crate'], [5, 14, 'crate'],
    [90 + rand(-2, 2), 30 + rand(-2, 2), 'crate'], [-30, 90 + rand(-3, 3), 'hydrant']);
  const meshFor = { crate: crateMesh, mailbox: mailboxMesh, hydrant: hydrantMesh, trash: trashMesh, bench: benchMesh };
  const valFor = { crate: 3, mailbox: 2, hydrant: 4, trash: 2, bench: 3 };
  for (const [x, z, type] of propSpots) {
    addProp(meshFor[type](), x, z, type === 'bench' ? 1.2 : 0.9, type, valFor[type]);
  }

  // ----- coins -----
  const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 12);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = toon(0xffd90f, { emissive: 0x6b5400 });
  function addCoin(x, z) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x, 1, z);
    scene.add(m);
    coins.push({ mesh: m, x, y: 1, z, taken: false });
  }
  for (const r of ROADS) {
    for (let i = -140; i <= 140; i += 40) {
      if (Math.random() < 0.6) addCoin(r + rand(-3, 3), i + rand(-6, 6));
      if (Math.random() < 0.4) addCoin(i + rand(-6, 6), r + rand(-3, 3));
    }
  }
  for (const [bx, bz] of [[0, 0], [60, -120], [-60, -120], [-120, 60], [60, 120], [120, 60]]) {
    for (let i = 0; i < 5; i++) addCoin(bx + rand(-16, 16), bz + rand(-16, 16));
  }

  // ----- cola cans (12, hidden-ish) -----
  const canGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10);
  const canMat = toon(0xd43a2f, { emissive: 0x440000 });
  const canSpots = [
    [-14, 14], [14, -14], [66, -132], [50, -108], [-68, -128], [-48, -110],
    [-132, 48], [-108, 72], [48, 132], [72, 108], [108, 72], [132, 48],
  ];
  for (const [x, z] of canSpots) {
    const m = new THREE.Mesh(canGeo, canMat);
    m.position.set(x, 0.9, z);
    scene.add(m);
    cans.push({ mesh: m, x, z, taken: false });
  }

  // ----- gags -----
  // 1. tube man at Kwiki-Mart
  const tube = new THREE.Group();
  const tubeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 8, 6), toon(0xff4444));
  tubeBody.position.y = 3;
  tube.add(tubeBody);
  const tubeFace = textPlane('^_^', { worldW: 1.4, worldH: 0.8, fg: '#fff', strokeWidth: 6 });
  tubeFace.position.set(0, 4.6, 0.52);
  tube.add(tubeFace);
  tube.position.set(50, 0, -132);
  scene.add(tube);
  const tubeState = { active: false };
  animated.push((t) => {
    const amp = tubeState.active ? 0.55 : 0.12;
    tube.children[0].rotation.z = Math.sin(t * 4) * amp;
    tube.children[0].scale.y = 1 + Math.sin(t * 7) * 0.05;
  });
  gags.push({
    x: 50, z: -132, r: 4, name: 'Wacky Tube Man', done: false,
    trigger(particles) { tubeState.active = !tubeState.active; particles.burst(50, 6, -132, 12, 3, 3, 1, 1, 0.3, 0.3); },
  });
  // 2. BBQ grill behind home
  const grill = new THREE.Group();
  const gb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0x222222));
  gb.position.y = 1; gb.rotation.x = Math.PI;
  const gl1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), toon(0x666666)); gl1.position.set(0.3, 0.5, 0.3);
  const gl2 = gl1.clone(); gl2.position.set(-0.3, 0.5, 0.3);
  const gl3 = gl1.clone(); gl3.position.set(0, 0.5, -0.35);
  grill.add(gb, gl1, gl2, gl3);
  grill.position.set(6, 0, 14);
  scene.add(grill);
  const grillState = { on: false, t: 0 };
  animated.push((t, dt, particles) => {
    if (grillState.on) {
      grillState.t += dt;
      if (Math.random() < 0.6) particles.spawn(6 + rand(-0.3, 0.3), 1.3, 14 + rand(-0.3, 0.3), 0, rand(1.5, 3), 0, 0.6, 1, 0.5, 0.1);
      if (grillState.t > 6) grillState.on = false;
    }
  });
  gags.push({
    x: 6, z: 14, r: 3.5, name: 'Mmm... BBQ', done: false,
    trigger() { grillState.on = true; grillState.t = 0; },
  });
  // 3. dumpster behind Moe's
  const dump = new THREE.Group();
  const db = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.6), toon(0x2f6b2f));
  db.position.y = 0.8;
  const dlid = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1.6), toon(0x255425));
  dlid.position.y = 1.7;
  dump.add(db, dlid);
  dump.position.set(52, 0, 132);
  scene.add(dump);
  const dumpState = { t: -1 };
  animated.push((t, dt, particles) => {
    if (dumpState.t >= 0) {
      dumpState.t += dt;
      dlid.rotation.x = -Math.abs(Math.sin(dumpState.t * 6)) * 0.8;
      if (Math.random() < 0.3) particles.spawn(52 + rand(-1, 1), 2, 132 + rand(-0.5, 0.5), 0, 1.2, 0, 1, 0.4, 0.8, 0.3);
      if (dumpState.t > 4) { dumpState.t = -1; dlid.rotation.x = 0; }
    }
  });
  gags.push({
    x: 52, z: 132, r: 4, name: "Moe's Mystery Dumpster", done: false,
    trigger() { dumpState.t = 0; },
  });
  // 4. phone booth near school
  const booth = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 1.2), toon(0x2b4a8a, { noCache: true }));
  bb.position.y = 1.3;
  const broof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), toon(0x1a3060));
  broof.position.y = 2.7;
  booth.add(bb, broof);
  booth.position.set(108, 0, 72);
  scene.add(booth);
  colliders.push(aabb(108, 72, 0.7, 0.7));
  const boothState = { t: -1 };
  animated.push((t, dt) => {
    if (boothState.t >= 0) {
      boothState.t += dt;
      booth.rotation.y = Math.sin(boothState.t * 20) * 0.04;
      if (boothState.t > 3) { boothState.t = -1; booth.rotation.y = 0; }
    }
  });
  gags.push({
    x: 108, z: 72, r: 3.5, name: 'Prank Phone Call', done: false,
    trigger() { boothState.t = 0; },
  });
  // 5. deluxe hydrant near church
  const hyd = hydrantMesh();
  hyd.scale.setScalar(1.6);
  hyd.position.set(-108, 0, 48);
  scene.add(hyd);
  const hydState = { t: -1 };
  animated.push((t, dt, particles) => {
    if (hydState.t >= 0) {
      hydState.t += dt;
      for (let i = 0; i < 3; i++) particles.spawn(-108, 2, 48, rand(-2, 2), rand(4, 7), rand(-2, 2), 0.8, 0.4, 0.6, 1);
      if (hydState.t > 5) hydState.t = -1;
    }
  });
  gags.push({
    x: -108, z: 48, r: 4, name: 'Hydrant Geyser', done: false,
    trigger(particles) { hydState.t = 0; },
  });

  // ----- mission givers -----
  const giverDefs = [
    { x: 4, z: 6, name: 'Marge', hair: 'tall-blue', hairColor: 0x2b6fd4, skin: 0xffd90f, shirt: 0x7cbf5a, pants: 0x7cbf5a },
    { x: 112, z: 50, name: 'Bart', hair: 'spiky', skin: 0xffd90f, shirt: 0xd43a2f, pants: 0x2b6fd4 },
    { x: 54, z: -112, name: 'Apu', hair: 'apu', skin: 0x8a5a2b, shirt: 0x2ba84a, pants: 0x333333 },
    { x: 54, z: 114, name: 'Moe', hair: 'moe', skin: 0xc9b458, shirt: 0x4a6b8a, pants: 0x333333 },
    { x: -104, z: -112, name: 'Wiggum', hair: 'cop', skin: 0xffd90f, shirt: 0x2b3a67, pants: 0x2b3a67 },
    { x: -112, z: 54, name: 'Lisa', hair: 'lisa', skin: 0xffd90f, shirt: 0xe86a2f, pants: 0xe86a2f, scale: 0.8 },
  ];
  for (const def of giverDefs) {
    const c = makeCharacter(def);
    c.position.set(def.x, 0, def.z);
    c.rotation.y = rand(0, Math.PI * 2);
    scene.add(c);
    // "!" marker
    const mark = textPlane('!', { fg: '#ffd90f', stroke: '#000', worldW: 1.6, worldH: 2.4, font: 'bold 100px Arial' });
    mark.position.set(def.x, 4.2, def.z);
    scene.add(mark);
    animated.push((t) => { mark.position.y = 4.2 + Math.sin(t * 3) * 0.25; });
    givers.push({ char: c, mark, x: def.x, z: def.z, name: def.name });
  }

  // ----- clouds -----
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cg = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(3, 5.5), 8, 6), toon(0xffffff, { noCache: true }));
      s.position.set(j * 4 - 4, rand(-0.5, 0.5), rand(-1, 1));
      s.scale.y = 0.55;
      cg.add(s);
    }
    cg.position.set(rand(-180, 180), rand(45, 70), rand(-180, 180));
    scene.add(cg);
    clouds.push(cg);
  }
  animated.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 200) c.position.x = -200;
    }
  });

  // ----- street lamps (static) -----
  for (const r of ROADS) {
    for (let i = -120; i <= 120; i += 60) {
      const off = ROAD_W / 2 + 1;
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6), toon(0x555566));
      pole.position.y = 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.15), toon(0x555566));
      arm.position.set(0.7, 5.9, 0);
      const headL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.35), toon(0xffeeaa, { emissive: 0x998844 }));
      headL.position.set(1.4, 5.8, 0);
      lamp.add(pole, arm, headL);
      lamp.position.set(r + off, 0, i);
      scene.add(lamp);
      colliders.push(aabb(r + off, i, 0.25, 0.25, 'lamp'));
    }
  }

  // world edge walls (invisible)
  colliders.push(
    aabb(0, -WORLD_BOUND - 2, WORLD_BOUND + 4, 2, 'edge'),
    aabb(0, WORLD_BOUND + 2, WORLD_BOUND + 4, 2, 'edge'),
    aabb(-WORLD_BOUND - 2, 0, 2, WORLD_BOUND + 4, 'edge'),
    aabb(WORLD_BOUND + 2, 0, 2, WORLD_BOUND + 4, 'edge'),
  );

  const spawn = { x: 14, z: 6 };
  const carSpawn = { x: 8, z: 12 };

  return { colliders, props, coins, cans, gags, givers, animated, landmarks, spawn, carSpawn };
}
