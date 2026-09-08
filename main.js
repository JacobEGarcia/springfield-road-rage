// main.js - SPRINGFIELD ROAD RAGE: game glue
import * as THREE from 'three';

// early test hook: deterministic world gen for reproducible capture runs
const _earlyParams = new URLSearchParams(location.search);
if (_earlyParams.has('seed')) {
  let _s = (Number(_earlyParams.get('seed')) || 42) >>> 0;
  Math.random = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
}
import { clamp, dist2D, rand, choice } from './util.js';
import { buildWorld, ParticleSystem, WORLD_BOUND, ROADS } from './world.js';
import { Player } from './player.js';
import { Car, spawnTraffic, updateTraffic, spawnCop } from './vehicles.js';
import { spawnPeds } from './npc.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { UI } from './ui.js';
import { audio } from './audio.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game-canvas').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4db8ff);
scene.fog = new THREE.Fog(0x87ceeb, 120, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

// lights
const sun = new THREE.DirectionalLight(0xfff3d0, 2.6);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.002;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xbfd9ff, 0.9));
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x6fbf3f, 0.5);
scene.add(hemi);

// cartoon sun disc + sky dome tint
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(18, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false })
);
sunDisc.position.set(180, 220, -350);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

// ---------- world ----------
const world = buildWorld(scene);
const particles = new ParticleSystem(scene, 700);
const ui = new UI();
ui.initMinimap(world.landmarks);

// ---------- entities ----------
const player = new Player(scene, world.spawn.x, world.spawn.z);
const playerHomeCar = new Car(scene, 'sedan', world.carSpawn.x, world.carSpawn.z, Math.PI / 2);
const parkedCars = [
  playerHomeCar,
  new Car(scene, 'wagon', -57, -100, 0),
  new Car(scene, 'sports', 66, 105, Math.PI),
  new Car(scene, 'truck', 105, -118, Math.PI / 2),
  new Car(scene, 'wagon', -108, 66, -Math.PI / 2),
];
const traffic = spawnTraffic(scene, 4);
const peds = spawnPeds(scene, 16);
let cops = [];
const missions = new MissionManager(scene, world, particles, ui);

// ---------- input ----------
const input = { w: 0, a: 0, s: 0, d: 0, shift: 0, space: 0, spacePressed: 0 };
let camYaw = 0, camPitch = 0.35, camMode = 0; // 0 far, 1 near
const keyMap = { KeyW: 'w', ArrowUp: 'w', KeyA: 'a', ArrowLeft: 'a', KeyS: 's', ArrowDown: 's', KeyD: 'd', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space' };
let paused = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'title') { startGame(); return; }
  if (e.code === 'KeyP') { paused = !paused; ui.toast(paused ? 'PAUSED' : 'GO!', 1); return; }
  if (e.code === 'KeyM') { const m = audio.toggleMute(); ui.toast(m ? 'MUTED' : 'SOUND ON', 1); return; }
  if (e.code === 'KeyR' && missions.active) { missions.restart(); return; }
  if (e.code === 'KeyC') { camMode = (camMode + 1) % 2; return; }
  if (e.code === 'KeyE') { tryInteract(); return; }
  if (e.code === 'KeyH' && driving) { audio.honk(); return; }
  if (keyMap[e.code] !== undefined) {
    if (e.code === 'Space' && !input.space) input.spacePressed = 1;
    input[keyMap[e.code]] = 1;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] !== undefined) input[keyMap[e.code]] = 0;
});
// mouse camera
let mouseDown = false;
window.addEventListener('mousedown', () => { mouseDown = true; if (state === 'title') startGame(); });
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (mouseDown && state === 'playing') {
    camYaw -= e.movementX * 0.005;
    camPitch = clamp(camPitch + e.movementY * 0.003, 0.08, 1.1);
  }
});
// touch: simple virtual stick (left half = move, right half = camera)
const touches = { move: null, cam: null };
window.addEventListener('touchstart', (e) => {
  if (state === 'title') { startGame(); return; }
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2 && !touches.move) touches.move = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
    else if (!touches.cam) touches.cam = { id: t.identifier, x: t.clientX, y: t.clientY };
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (touches.move && t.identifier === touches.move.id) { touches.move.x = t.clientX; touches.move.y = t.clientY; }
    if (touches.cam && t.identifier === touches.cam.id) {
      camYaw -= (t.clientX - touches.cam.x) * 0.008;
      touches.cam.x = t.clientX; touches.cam.y = t.clientY;
    }
  }
}, { passive: true });
window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (touches.move && t.identifier === touches.move.id) touches.move = null;
    if (touches.cam && t.identifier === touches.cam.id) touches.cam = null;
  }
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- game state ----------
let state = 'title';
let driving = null; // Car or null
let coins = 0, cansGot = 0, gagsGot = 0;
let heat = 0;
let bustedCooldown = 0;
let lastSpeed = 0;

function startGame() {
  if (state !== 'title') return;
  state = 'playing';
  audio.init();
  ui.showHUD();
  ui.toast('SPRINGFIELD ROAD RAGE', 2.5);
  ui.subtitle('Find Marge at your house for the first mission (!)', 5);
}

function enterCar(car) {
  driving = car;
  camYaw = car.heading;
  car.driver = 'player';
  player.mesh.visible = false;
  audio.engineStart();
  ui.toast(car.mesh.userData.name.toUpperCase(), 1);
  ui.setSpeed(0, true);
}
function exitCar() {
  if (!driving) return;
  const c = driving;
  driving = null;
  c.driver = null;
  audio.engineStop();
  ui.setSpeed(0, false);
  // place player beside the car
  const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading));
  player.teleport(c.pos.x + side.x * 3, c.pos.z + side.z * 3);
  player.heading = c.heading;
  player.mesh.visible = true;
}

function tryInteract() {
  if (state !== 'playing' || paused) return;
  const p = driving ? driving.pos : player.pos;
  // 1. exit car
  if (driving) {
    if (driving.speed < 3) exitCar();
    return;
  }
  // 2. mission givers
  for (const g of world.givers) {
    if (dist2D(p.x, p.z, g.x, g.z) < 3.5) {
      if (missions.giverAvailable(g.name)) {
        missions.start(g.name);
      } else if (missions.completed.has(MISSION_DEFS.find(m => m.giver === g.name)?.id)) {
        audio.talk();
        ui.subtitle(`${g.name}: "You're doing great, sweetie!"`, 2.5);
      } else {
        audio.talk();
        ui.subtitle(`${g.name}: "Finish your current errand first!"`, 2.5);
      }
      return;
    }
  }
  // 3. gags
  for (const gag of world.gags) {
    if (dist2D(p.x, p.z, gag.x, gag.z) < gag.r) {
      gag.trigger(particles);
      audio.gag();
      if (!gag.done) {
        gag.done = true;
        gagsGot++;
        ui.setGags(gagsGot, world.gags.length);
        ui.toast('GAG!', 1.2);
        addCoins(5);
      }
      return;
    }
  }
  // 4. enter car
  let best = null, bestD = 4.5;
  for (const car of [...parkedCars, ...traffic]) {
    const d = dist2D(p.x, p.z, car.pos.x, car.pos.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (best) {
    // if it's a traffic car, remove from traffic pool
    const ti = traffic.indexOf(best);
    if (ti >= 0) { traffic.splice(ti, 1); parkedCars.push(best); }
    enterCar(best);
  }
}

function addCoins(n) {
  coins += n;
  ui.setCoins(coins);
}

// ---------- heat / cops ----------
function addHeat(n) {
  heat = clamp(heat + n, 0, 1);
  ui.setHeat(heat);
  if (heat >= 1 && cops.length === 0) {
    // spawn 2 cop cars on nearby roads
    const p = driving ? driving.pos : player.pos;
    for (let i = 0; i < 2; i++) {
      const nearRoad = ROADS.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
      const cop = spawnCop(scene, nearRoad, p.z + (i === 0 ? 40 : -40));
      cops.push(cop);
    }
    audio.sirenStart();
    ui.toast('WOO WOO! COPS!', 2);
  }
}
function busted() {
  audio.busted();
  audio.sirenStop();
  ui.wasted(true);
  addCoins(-Math.min(50, coins));
  heat = 0;
  ui.setHeat(0);
  for (const cop of cops) scene.remove(cop.mesh);
  cops = [];
  // reset player to home
  if (driving) exitCar();
  player.teleport(world.spawn.x, world.spawn.z);
  setTimeout(() => ui.wasted(false), 2500);
}

// ---------- collision helpers ----------
function smashProps(carX, carZ, speed) {
  for (const prop of world.props) {
    if (prop.alive && dist2D(carX, carZ, prop.x, prop.z) < 2.3) {
      prop.alive = false;
      prop.mesh.visible = false;
      particles.burst(prop.x, 1, prop.z, 14, 4, 4, 0.9, 0.7, 0.5, 0.3);
      audio.smash();
      addCoins(prop.coins);
      addHeat(0.09);
      // spawn a pickup coin arc
    }
  }
  missions.trySmashCrate(carX, carZ, particles);
}

// ---------- camera ----------
function updateCamera(dt, target, isCar) {
  const dist = (camMode === 0 ? 11 : 6.5) * (isCar ? 1.35 : 1);
  const h = camMode === 0 ? 5.5 : 3.4;
  const cx = target.x - Math.sin(camYaw) * dist * Math.cos(camPitch);
  const cz = target.z - Math.cos(camYaw) * dist * Math.cos(camPitch);
  const cy = (target.y || 0) + h + Math.sin(camPitch) * dist * 0.5;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 7));
  camera.lookAt(target.x, (target.y || 0) + 2, target.z);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let camInit = false;
let worldT = 0;
function loop() {
  requestAnimationFrame(loop);
  let dt = clock.getDelta();
  if (dt < 0.004) dt = 0.016; // headless/virtual-time freeze guard
  dt = Math.min(dt, 0.05);
  const t = clock.elapsedTime;
  if (state === 'title') {
    // slow orbit over town
    const a = t * 0.08;
    camera.position.set(Math.sin(a) * 130, 60, Math.cos(a) * 130);
    camera.lookAt(0, 0, 0);
    for (const fn of world.animated) fn(t, dt, particles);
    particles.update(dt);
    renderer.render(scene, camera);
    return;
  }
    if (paused) { renderer.render(scene, camera); return; }
  if (_script && !_simDone) { renderer.render(scene, camera); return; }
  worldT += dt;
  tickWorld(dt, worldT);
  renderer.render(scene, camera);
}

function tickWorld(dt, t) {
  // scripted input timeline (capture/testing only)
  if (_script) {
    const ks = {};
    for (const ev of _script) {
      if (ev.name === 'interact') {
        if (!ev.fired && t >= ev.start) { ev.fired = true; tryInteract(); }
      } else if (ev.name === 'cam') {
        camYaw = ev.start; camPitch = isNaN(ev.end) ? 0.35 : ev.end;
      } else if (keyMap['Key' + ev.name.toUpperCase()] !== undefined || ev.name === 'space' || ev.name === 'shift') {
        const k = ev.name === 'space' ? 'space' : ev.name === 'shift' ? 'shift' : keyMap['Key' + ev.name.toUpperCase()];
        ks[k] = ks[k] || (t >= ev.start && t < ev.end);
      }
    }
    for (const k in ks) input[k] = ks[k] ? 1 : 0;
  }
  // touch steering
  if (touches.move) {
    const dx = touches.move.x - touches.move.x0, dy = touches.move.y - touches.move.y0;
    input.w = dy < -20 ? 1 : 0; input.s = dy > 20 ? 1 : 0;
    input.a = dx < -20 ? 1 : 0; input.d = dx > 20 ? 1 : 0;
  }

  if (driving) {
    const throttle = (input.w ? 1 : 0) - (input.s ? 1 : 0);
    const steer = (input.a ? 1 : 0) - (input.d ? 1 : 0);
    const wasSpeed = driving.speed;
    driving.step(dt, {
      throttle, steer,
      handbrake: !!input.space, boost: !!input.shift,
    }, world.colliders, (impact, nx, nz) => {
      audio.crash(impact / 25);
      particles.burst(driving.pos.x + nx, 1, driving.pos.z + nz, 12, 4, 3, 0.8, 1, 0.8, 0.2);
      addHeat(impact > 14 ? 0.12 : 0.05);
      camShake = Math.min(0.6, impact / 40);
    });
    // drift smoke
    if (driving.skidding) {
      const back = driving.forward;
      particles.spawn(driving.pos.x - back.x * 2, 0.3, driving.pos.z - back.y * 2, rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), 0.7, 0.75, 0.75, 0.75);
    }
    smashProps(driving.pos.x, driving.pos.z, driving.speed);
    // hit peds (comic bonk, they get up)
    for (const ped of peds) {
      if (ped.state !== 'down' && driving.speed > 4 && dist2D(driving.pos.x, driving.pos.z, ped.pos.x, ped.pos.z) < 2.1) {
        ped.bonk(particles);
        audio.crash(0.25);
        addHeat(0.15);
      }
    }
    // engine audio + speedo
    audio.engineSet(clamp(driving.speed / driving.max, 0, 1), Math.abs(throttle));
    ui.setSpeed(driving.speed * 2.2, true);
    // coins/cans from car
    collectItems(driving.pos, 2.6);
    // cop chase
    for (const cop of cops) {
      cop.aiStep(dt, { x: driving.pos.x, z: driving.pos.z }, world.colliders, null, driving.max * 0.96);
      if (dist2D(cop.pos.x, cop.pos.z, driving.pos.x, driving.pos.z) < 4 && driving.speed < 2.5 && bustedCooldown <= 0) {
        bustedCooldown = 3;
        busted();
      }
    }
    // ease camera behind the car
    let dh = driving.heading - camYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    camYaw += dh * Math.min(1, dt * 2.5);
    updateCamera(dt, driving.pos, true);
    lastSpeed = driving.speed;
  } else {
    player.update(dt, input, camYaw, world.colliders);
    if (input.spacePressed) audio.jump();
    collectItems(player.pos, 1.8);
    updateCamera(dt, player.pos, false);
    // cops lose interest on foot
    if (heat >= 1) {
      // cops still hunt the player on foot, slower
      for (const cop of cops) {
        cop.aiStep(dt, { x: player.pos.x, z: player.pos.z }, world.colliders, null, 12);
        if (dist2D(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z) < 4.5 && bustedCooldown <= 0) {
          bustedCooldown = 3;
          busted();
        }
      }
    }
  }
  input.spacePressed = 0;

  // camera shake decay
  if (camShake > 0) {
    camera.position.x += rand(-camShake, camShake);
    camera.position.y += rand(-camShake, camShake) * 0.5;
    camShake = Math.max(0, camShake - dt * 1.4);
  }

  // heat decay
  if (heat > 0 && heat < 1) {
    heat = Math.max(0, heat - dt * 0.015);
    ui.setHeat(heat);
  }
  if (heat >= 1) {
    // maxed: stays until evaded (no crimes) -> decay slower
    heat = Math.max(0.85, heat - dt * 0.02);
    ui.setHeat(heat);
    if (heat <= 0.87 && cops.length > 0) {
      for (const cop of cops) scene.remove(cop.mesh);
      cops = [];
      audio.sirenStop();
      ui.toast('EVADED!', 2);
    }
  }
  if (bustedCooldown > 0) bustedCooldown -= dt;

  // traffic + peds
  for (const car of traffic) updateTraffic(car, dt, world.colliders);
  const carPos = driving ? driving.pos : null;
  for (const ped of peds) ped.update(dt, world.colliders, carPos, driving ? driving.speed : 0, particles);

  // missions
  missions.update(dt, {
    pos: driving ? driving.pos : player.pos,
    inCar: !!driving,
    carSpeed: driving ? driving.speed : 0,
  });

  // interact hint
  updateInteractHint();

  // world animations + particles
  for (const fn of world.animated) fn(t, dt, particles);
  particles.update(dt);

  // sun follows player for shadow coverage
  const focus = driving ? driving.pos : player.pos;
  sun.position.set(focus.x + 80, 120, focus.z + 40);
  sun.target.position.set(focus.x, 0, focus.z);

  // minimap
  const mmExtras = [];
  if (missions.active) {
    if (missions.active.cpPos) mmExtras.push({ x: missions.active.cpPos.x, z: missions.active.cpPos.z, color: '#7CFC00' });
    if (missions.active.dropPos) mmExtras.push({ x: missions.active.dropPos.x, z: missions.active.dropPos.z, color: '#44aaff' });
    if (missions.tailCar) mmExtras.push({ x: missions.tailCar.pos.x, z: missions.tailCar.pos.z, color: '#ff4444' });
    for (const d of missions.donutItems) if (!d.taken) mmExtras.push({ x: d.x, z: d.z, color: '#f78fc1', r: 3 });
    for (const c of missions.missionCrates) if (c.alive) mmExtras.push({ x: c.x, z: c.z, color: '#d43a2f', r: 3 });
  } else {
    const avail = missions.availableIndex();
    if (avail >= 0) {
      const g = world.givers.find(g => g.name === MISSION_DEFS[avail].giver);
      if (g) mmExtras.push({ x: g.x, z: g.z, color: '#ffd90f' });
    }
  }
  for (const cop of cops) mmExtras.push({ x: cop.pos.x, z: cop.pos.z, color: '#2255ff', r: 3 });
  ui.drawMinimap(focus, driving ? driving.heading : player.heading, mmExtras);
}

let camShake = 0;

function collectItems(pos, radius) {
  for (const c of world.coins) {
    if (!c.taken && dist2D(pos.x, pos.z, c.x, c.z) < radius) {
      c.taken = true;
      c.mesh.visible = false;
      audio.coin();
      addCoins(1);
      particles.burst(c.x, 1, c.z, 6, 2, 2, 0.5, 1, 0.85, 0.1);
    }
  }
  for (const c of world.cans) {
    if (!c.taken && dist2D(pos.x, pos.z, c.x, c.z) < radius) {
      c.taken = true;
      c.mesh.visible = false;
      audio.can();
      cansGot++;
      ui.setCans(cansGot, world.cans.length);
      addCoins(10);
      ui.toast('BUZZ COLA!', 1);
      if (cansGot === world.cans.length) { ui.toast('ALL CANS! +100', 2.5); addCoins(100); }
    }
  }
  // spin remaining
  for (const c of world.coins) if (!c.taken) c.mesh.rotation.y += 0.05;
  for (const c of world.cans) if (!c.taken) { c.mesh.rotation.y += 0.04; c.mesh.position.y = 0.9 + Math.sin(clock.elapsedTime * 2 + c.x) * 0.15; }
}

function updateInteractHint() {
  const p = driving ? driving.pos : player.pos;
  if (driving) {
    ui.interactHint(driving.speed < 3 ? '[E] Exit car' : null);
    return;
  }
  for (const g of world.givers) {
    if (dist2D(p.x, p.z, g.x, g.z) < 3.5) {
      ui.interactHint(missions.giverAvailable(g.name) ? `[E] Talk to ${g.name} (MISSION!)` : `[E] Talk to ${g.name}`);
      return;
    }
  }
  for (const gag of world.gags) {
    if (!gag.done && dist2D(p.x, p.z, gag.x, gag.z) < gag.r) {
      ui.interactHint(`[E] ${gag.name}`);
      return;
    }
  }
  for (const car of [...parkedCars, ...traffic]) {
    if (dist2D(p.x, p.z, car.pos.x, car.pos.z) < 4.5) {
      ui.interactHint(`[E] Drive ${car.mesh.userData.name}`);
      return;
    }
  }
  ui.interactHint(null);
}


// ---------- test hooks (URL params, harmless in normal play) ----------
const _params = new URLSearchParams(location.search);
if (_params.has('auto')) setTimeout(() => startGame(), 400);
if (_params.has('drive')) setTimeout(() => { if (state === 'playing' && !driving) enterCar(playerHomeCar); }, 900);
if (_params.has('fwd')) setTimeout(() => { input.w = 1; }, 1000);
if (_params.has('tp')) {
  const [tx, tz] = _params.get('tp').split(',').map(Number);
  setTimeout(() => { if (driving) { driving.pos.set(tx, 0, tz); } player.teleport(tx, tz); }, 1100);
}

let _script = null;
let _simDone = false;
if (_params.has('script')) {
  _script = [];
  for (const part of _params.get('script').split(',')) {
    const [name, span] = part.split('@');
    const [s, e] = span.split('-').map(Number);
    _script.push({ name, start: s, end: isNaN(e) ? s : e, fired: false });
  }
}
if (_params.has('mission')) {
  setTimeout(() => {
    const def = MISSION_DEFS.find(d => d.id === _params.get('mission'));
    if (def) missions.start(def.giver);
  }, 1200);
}
if (_params.has('sim')) {
  const secs = Number(_params.get('sim')) || 5;
  setTimeout(() => {
    worldT = 0;
    for (let i = 0; i < secs * 60; i++) { worldT += 1 / 60; tickWorld(1 / 60, worldT); }
    _simDone = true;
  }, 1300);
}
if (_params.has('dbg')) setInterval(() => console.log('DBG state=' + state + ' cam=' + camera.position.toArray().map(v=>v.toFixed(1)) + ' player=' + player.pos.toArray().map(v=>v.toFixed(1)) + ' driving=' + (driving ? driving.pos.toArray().map(v=>v.toFixed(1)) : 'no')), 1500);

loop();
