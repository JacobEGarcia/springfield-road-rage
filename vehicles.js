// vehicles.js - cartoon car factory, arcade physics, traffic AI, cop AI
import * as THREE from 'three';
import { toon, outline, resolveCircleAABB, clamp, rand, choice } from './util.js';
import { ROADS } from './world.js';

export function makeCarModel(type = 'sedan') {
  const g = new THREE.Group();
  const styles = {
    sedan:  { body: 0xf78fb1, cabin: 0xf7c3d5, w: 2.2, l: 4.4, h: 0.9, name: 'Family Sedan' },
    wagon:  { body: 0x6b8ec9, cabin: 0x9db8e8, w: 2.2, l: 4.8, h: 1.0, name: 'Station Wagon' },
    sports: { body: 0xd43a2f, cabin: 0x882222, w: 2.0, l: 4.2, h: 0.75, name: 'Sports Car' },
    cop:    { body: 0xf0f0f0, cabin: 0x222222, w: 2.2, l: 4.6, h: 0.95, name: 'Police Cruiser' },
    truck:  { body: 0xe8a83c, cabin: 0xc98a2c, w: 2.4, l: 5.2, h: 1.3, name: 'Pickup Truck' },
  };
  const s = styles[type] || styles.sedan;
  // body
  const bodyGeo = new THREE.BoxGeometry(s.w, s.h, s.l);
  const body = new THREE.Mesh(bodyGeo, toon(s.body));
  body.position.y = 0.75;
  g.add(body);
  const bodyO = outline(bodyGeo, 1.04); bodyO.position.y = 0.75;
  g.add(bodyO);
  // cabin
  const cabGeo = new THREE.BoxGeometry(s.w * 0.82, s.h * 0.85, s.l * 0.45);
  const cab = new THREE.Mesh(cabGeo, toon(s.cabin));
  cab.position.set(0, 0.75 + s.h * 0.8, type === 'truck' ? -s.l * 0.18 : s.l * 0.02);
  g.add(cab);
  const cabO = outline(cabGeo, 1.04); cabO.position.copy(cab.position);
  g.add(cabO);
  // windows strip
  const winGeo = new THREE.BoxGeometry(s.w * 0.84, s.h * 0.45, s.l * 0.4);
  const win = new THREE.Mesh(winGeo, toon(0xbfe8ff, { emissive: 0x557799, emissiveIntensity: 0.4 }));
  win.position.copy(cab.position); win.position.y += s.h * 0.1;
  g.add(win);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = toon(0x1a1a1a);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.37, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = toon(0xcccccc);
  const wheels = [];
  const wx = s.w / 2 + 0.05, wz = s.l / 2 - 0.8;
  for (const [px, pz, front] of [[-wx, wz, 1], [wx, wz, 1], [-wx, -wz, 0], [wx, -wz, 0]]) {
    const wg = new THREE.Group();
    const wm = new THREE.Mesh(wheelGeo, wheelMat);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wg.add(wm); wg.add(hub);
    wg.position.set(px, 0.42, pz);
    g.add(wg);
    wheels.push({ group: wg, mesh: wm, hub, front: !!front });
  }
  // headlights / taillights
  const hlGeo = new THREE.SphereGeometry(0.16, 6, 6);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, toon(0xfff2b0, { emissive: 0xaa8833 }));
    hl.position.set(sx * s.w * 0.32, 0.75, s.l / 2 + 0.01);
    g.add(hl);
    const tl = new THREE.Mesh(hlGeo, toon(0xd43a2f, { emissive: 0x550000 }));
    tl.position.set(sx * s.w * 0.32, 0.75, -s.l / 2 - 0.01);
    tl.scale.setScalar(0.8);
    g.add(tl);
  }
  // cop extras
  if (type === 'cop') {
    const barG = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.35), toon(0xff2222, { emissive: 0x880000 }));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.35), toon(0x2255ff, { emissive: 0x000088 }));
    r.position.x = -0.3; b.position.x = 0.3;
    barG.add(r); barG.add(b);
    barG.position.set(0, 0.75 + s.h * 0.85 + 0.62, 0);
    g.add(barG);
    g.userData.lightbar = { r, b };
  }
  g.userData.wheels = wheels;
  g.userData.type = type;
  g.userData.name = s.name;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Car {
  constructor(scene, type, x, z, heading = 0) {
    this.type = type;
    this.mesh = makeCarModel(type);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vel = new THREE.Vector2(0, 0); // world-space xz velocity
    this.radius = 1.6;
    this.driver = null;   // 'player' | 'traffic' | 'cop'
    this.health = 100;
    this.wheelSpin = 0;
    this.steerVis = 0;
    this.skidding = false;
    // tuning per type
    const tune = {
      sedan:  { accel: 16, max: 26, grip: 6,  turn: 1.9 },
      wagon:  { accel: 14, max: 24, grip: 5.5, turn: 1.7 },
      sports: { accel: 22, max: 34, grip: 7,  turn: 2.3 },
      cop:    { accel: 19, max: 31, grip: 6.5, turn: 2.1 },
      truck:  { accel: 13, max: 23, grip: 5,  turn: 1.6 },
    };
    Object.assign(this, tune[type] || tune.sedan);
  }
  get speed() { return this.vel.length(); }
  get forward() { return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)); }
  // input: {throttle:-1..1, steer:-1..1, handbrake, boost}
  step(dt, input, colliders, onCrash) {
    const fwd = this.forward;
    // split velocity into forward/lateral
    let vF = this.vel.x * fwd.x + this.vel.y * fwd.y;
    let vL = -this.vel.x * fwd.y + this.vel.y * fwd.x;
    // throttle
    const boost = input.boost ? 1.5 : 1;
    if (input.throttle > 0) vF += this.accel * boost * input.throttle * dt;
    else if (input.throttle < 0) {
      if (vF > 1) vF += this.accel * 1.6 * input.throttle * dt; // brake
      else vF += this.accel * 0.55 * input.throttle * dt;        // reverse
    }
    // drag + rolling resistance
    vF *= Math.pow(0.35, dt * 0.22);
    if (Math.abs(input.throttle) < 0.01) vF *= Math.pow(0.2, dt * 0.5);
    vF = clamp(vF, -this.max * 0.35, this.max * (input.boost ? 1.18 : 1));
    // lateral grip
    const grip = input.handbrake ? this.grip * 0.18 : this.grip;
    vL *= Math.pow(0.001, dt * grip / 6);
    // steering
    const speedFactor = clamp(Math.abs(vF) / 8, 0, 1) * (vF >= 0 ? 1 : -1);
    this.heading += input.steer * this.turn * speedFactor * dt * (input.handbrake ? 1.5 : 1);
    this.steerVis += (input.steer * 0.5 - this.steerVis) * Math.min(1, dt * 10);
    this.skidding = Math.abs(vL) > 4 || (input.handbrake && Math.abs(vF) > 6);
    // recompose
    const nf = this.forward;
    this.vel.set(nf.x * vF - nf.y * vL, nf.y * vF + nf.x * vL);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    // world collisions
    let crashed = false;
    for (const c of colliders) {
      const res = resolveCircleAABB(this.pos.x, this.pos.z, this.radius, c);
      if (res) {
        const impact = this.speed;
        this.pos.x = res[0]; this.pos.z = res[1];
        // kill velocity into the wall
        const nx = res[2], nz = res[3];
        const dot = this.vel.x * nx + this.vel.y * nz;
        if (dot < 0) {
          this.vel.x -= dot * nx * 1.6;
          this.vel.y -= dot * nz * 1.6;
        }
        if (impact > 6 && onCrash) onCrash(impact, nx, nz);
        crashed = true;
      }
    }
    // visuals
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += vF * dt * 2.2;
    for (const w of this.mesh.userData.wheels) {
      w.mesh.rotation.x = this.wheelSpin;
      w.hub.rotation.x = this.wheelSpin;
      if (w.front) w.group.rotation.y = this.steerVis;
    }
    if (this.mesh.userData.lightbar) {
      const t = performance.now() / 150;
      this.mesh.userData.lightbar.r.visible = Math.sin(t) > 0;
      this.mesh.userData.lightbar.b.visible = Math.sin(t) <= 0;
    }
    return crashed;
  }
  // simple AI: steer toward target point
  aiStep(dt, target, colliders, onCrash, maxSpeed = null) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 2, -1, 1);
    let throttle = dist > 3 ? 1 : 0.2;
    if (Math.abs(dh) > 1.8) throttle = -0.4; // back up if facing away
    const oldMax = this.max;
    if (maxSpeed) this.max = maxSpeed;
    const crashed = this.step(dt, { throttle, steer, handbrake: false, boost: false }, colliders, onCrash);
    this.max = oldMax;
    return { dist, crashed };
  }
}

// traffic: cars looping around blocks
export function spawnTraffic(scene, count = 4) {
  const cars = [];
  const types = ['sedan', 'wagon', 'truck', 'sports'];
  for (let i = 0; i < count; i++) {
    const road = choice(ROADS.slice(1, -1));
    const along = rand(-140, 140);
    const vertical = Math.random() < 0.5;
    const x = vertical ? road + 3 : along;
    const z = vertical ? along : road + 3;
    const car = new Car(scene, types[i % types.length], x, z, vertical ? 0 : Math.PI / 2);
    car.driver = 'traffic';
    car.wpIndex = 0;
    car.loop = makeLoop(choice([-120, -60, 0, 60, 120]), choice([-120, -60, 0, 60, 120]));
    cars.push(car);
  }
  return cars;
}
function makeLoop(bx, bz) {
  // waypoints around a block, offset to right lane
  const o = 26; // block half + road lane
  return [
    { x: bx - o + 3, z: bz - o + 3 },
    { x: bx + o - 3, z: bz - o + 3 },
    { x: bx + o - 3, z: bz + o - 3 },
    { x: bx - o + 3, z: bz + o - 3 },
  ];
}
export function updateTraffic(car, dt, colliders) {
  const wp = car.loop[car.wpIndex];
  const res = car.aiStep(dt, wp, colliders, null, 10);
  if (res.dist < 6) car.wpIndex = (car.wpIndex + 1) % car.loop.length;
}

// cops chase the player's car
export function spawnCop(scene, x, z) {
  const car = new Car(scene, 'cop', x, z, 0);
  car.driver = 'cop';
  return car;
}
