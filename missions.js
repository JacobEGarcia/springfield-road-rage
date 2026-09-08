// missions.js - mission system: collect, race, smash, deliver, tail, grand prix
import * as THREE from 'three';
import { toon, textPlane, dist2D, rand, choice } from './util.js';
import { Car } from './vehicles.js';
import { audio } from './audio.js';

export const MISSION_DEFS = [
  {
    id: 'donuts', giver: 'Marge', title: 'M1: DONUT DASH', type: 'collect',
    brief: 'Homer ate the last donut! Collect 6 donuts before the shops close.',
    time: 75, reward: 60,
  },
  {
    id: 'school', giver: 'Bart', title: 'M2: SCHOOL\'S OUT', type: 'race',
    brief: 'Race through every checkpoint before the school bell rings!',
    time: 100, reward: 90,
    checkpoints: [[30, 30], [90, 90], [150, 30], [90, -30], [30, -90], [-30, -30], [120, 52]],
  },
  {
    id: 'cola', giver: 'Apu', title: 'M3: COLA RUN', type: 'smash',
    brief: 'A truck dropped Buzz Cola crates all over! Smash 8 with your car.',
    time: 90, reward: 90, smashCount: 8,
  },
  {
    id: 'delivery', giver: 'Moe', title: 'M4: D\'OH! DELIVERY', type: 'deliver',
    brief: 'Deliver 3 "totally legal" packages. Park in the glowing zones.',
    time: 130, reward: 110,
    drops: [[-120, 48], [120, 44], [-60, -110]],
  },
  {
    id: 'tail', giver: 'Wiggum', title: 'M5: TAIL THE STRANGER', type: 'tail',
    brief: 'Follow that suspicious sedan. Not too close. Not too far.',
    time: 55, reward: 120,
  },
  {
    id: 'prix', giver: 'Lisa', title: 'M6: HOMER\'S GRAND PRIX', type: 'race',
    brief: 'The whole town is watching. Hit every checkpoint, fast!',
    time: 160, reward: 200,
    checkpoints: [[-30, 30], [-90, 90], [-150, 30], [-90, -30], [-150, -90], [-90, -150], [-30, -90], [30, -150], [90, -90], [150, -30], [90, 30], [30, 90], [-114, 54]],
  },
];

function beamMarker(color = 0xffd90f, r = 2.5, h = 14) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = h / 2;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.25, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  g.userData.beam = beam; g.userData.ring = ring;
  return g;
}

export class MissionManager {
  constructor(scene, world, particles, ui) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.ui = ui;
    this.active = null;      // runtime state
    this.completed = new Set();
    this.tempObjects = [];   // meshes to clean up
    this.missionCrates = [];
    this.donutItems = [];
    this.tailCar = null;
    this.animT = 0;
  }
  availableIndex() {
    for (let i = 0; i < MISSION_DEFS.length; i++) {
      if (!this.completed.has(MISSION_DEFS[i].id)) {
        return i; // only the next one in order is available
      }
    }
    return -1;
  }
  giverAvailable(giverName) {
    const idx = MISSION_DEFS.findIndex(m => m.giver === giverName);
    return idx === this.availableIndex() && !this.active;
  }
  start(giverName) {
    const idx = MISSION_DEFS.findIndex(m => m.giver === giverName);
    if (idx < 0 || this.active) return false;
    const def = MISSION_DEFS[idx];
    audio.missionStart();
    this.active = {
      def, idx, timeLeft: def.time, phase: 0,
      collected: 0, smashed: 0, delivered: 0, tailProgress: 0, tailLost: 0, tailClose: 0,
      cpIndex: 0,
    };
    this.ui.showMission(def.title, def.brief);
    this.ui.toast(def.title, 2);
    if (def.type === 'collect') this._spawnDonuts(6);
    if (def.type === 'race') this._spawnCheckpoint(def.checkpoints[0]);
    if (def.type === 'smash') this._spawnCrates(def.smashCount);
    if (def.type === 'deliver') this._spawnDrop(def.drops[0]);
    if (def.type === 'tail') this._spawnTailCar();
    return true;
  }
  _spawnDonuts(n) {
    const spots = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 40 + (i % 3) * 25;
      spots.push([Math.sin(a) * r, Math.cos(a) * r]);
    }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const dough = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.4, 8, 16), toon(0xe8a85c));
      const frost = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.45, 8, 16, Math.PI), toon(0xf78fc1, { emissive: 0x441122 }));
      g.add(dough); g.add(frost);
      g.position.set(x, 1.4, z);
      g.rotation.x = 0.4;
      this.scene.add(g);
      const mark = beamMarker(0xf78fc1, 1.6, 10);
      mark.position.set(x, 0, z);
      this.scene.add(mark);
      this.donutItems.push({ mesh: g, mark, x, z });
      this.tempObjects.push(g, mark);
    }
  }
  _spawnCheckpoint([x, z]) {
    const mark = beamMarker(0x7cfc00, 3.5, 18);
    mark.position.set(x, 0, z);
    this.scene.add(mark);
    this.tempObjects.push(mark);
    this.active.cpMark = mark;
    this.active.cpPos = { x, z };
  }
  _advanceCheckpoint() {
    audio.checkpoint();
    const def = this.active.def;
    this.scene.remove(this.active.cpMark);
    this.tempObjects = this.tempObjects.filter(o => o !== this.active.cpMark);
    this.active.cpIndex++;
    if (this.active.cpIndex >= def.checkpoints.length) { this._complete(); return; }
    this._spawnCheckpoint(def.checkpoints[this.active.cpIndex]);
  }
  _spawnCrates(n) {
    this.missionCrates = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 45 + (i % 4) * 30;
      const x = Math.sin(a) * r + rand(-8, 8), z = Math.cos(a) * r + rand(-8, 8);
      const m = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), toon(0xd43a2f));
      box.position.y = 0.8;
      const label = textPlane('COLA', { worldW: 1.3, worldH: 0.5, fg: '#fff', strokeWidth: 6 });
      label.position.set(0, 0.9, 0.82);
      m.add(box); m.add(label);
      m.position.set(x, 0, z);
      this.scene.add(m);
      const mark = beamMarker(0xd43a2f, 1.4, 8);
      mark.position.set(x, 0, z);
      this.scene.add(mark);
      this.missionCrates.push({ mesh: m, mark, x, z, alive: true });
      this.tempObjects.push(m, mark);
    }
  }
  _spawnDrop([x, z]) {
    const mark = beamMarker(0x44aaff, 4, 14);
    mark.position.set(x, 0, z);
    this.scene.add(mark);
    this.tempObjects.push(mark);
    this.active.dropMark = mark;
    this.active.dropPos = { x, z };
  }
  _spawnTailCar() {
    this.tailCar = new Car(this.scene, 'sedan', -87, -120, 0);
    this.tailCar.driver = 'tail';
    // rectangular loop on road lanes (roads at -90 and 90)
    this.tailCar.waypoints = [[-87, -87], [-87, 87], [87, 87], [87, -87]];
    this.tailCar.wpIndex = 0;
    const mark = beamMarker(0xff4444, 3, 16);
    this.scene.add(mark);
    this.tailMark = mark;
    this.tempObjects.push(mark);
  }
  _clearTemp() {
    for (const o of this.tempObjects) this.scene.remove(o);
    this.tempObjects = [];
    this.donutItems = [];
    this.missionCrates = [];
    if (this.tailCar) { this.scene.remove(this.tailCar.mesh); this.tailCar = null; }
    if (this.tailMark) { this.scene.remove(this.tailMark); this.tailMark = null; }
  }
  _complete() {
    const def = this.active.def;
    audio.missionWin();
    this.completed.add(def.id);
    this.ui.missionComplete(def.reward);
    this.ui.hideMission();
    this._clearTemp();
    this.active = null;
  }
  _fail(reason) {
    audio.missionFail();
    this.ui.toast('MISSION FAILED', 2.5);
    this.ui.subtitle(reason, 3);
    this.ui.hideMission();
    this._clearTemp();
    this.active = null;
  }
  restart() {
    if (!this.active) return;
    const giver = this.active.def.giver;
    this._clearTemp();
    this.active = null;
    this.ui.hideMission();
    this.start(giver);
  }
  // ctx: {pos, inCar, carSpeed, onReward}
  update(dt, ctx) {
    this.animT += dt;
    // pulse all markers
    for (const o of this.tempObjects) {
      if (o.userData.beam) {
        const s = 1 + Math.sin(this.animT * 4) * 0.08;
        o.userData.ring.scale.setScalar(s);
      }
    }
    for (const d of this.donutItems) d.mesh.rotation.y += dt * 2;
    if (!this.active) return;
    const A = this.active;
    A.timeLeft -= dt;
    this.ui.updateMissionTimer(A.timeLeft);
    if (A.timeLeft <= 0) { this._fail('Out of time!'); return; }
    const px = ctx.pos.x, pz = ctx.pos.z;

    if (A.def.type === 'collect') {
      for (const d of this.donutItems) {
        if (!d.taken && dist2D(px, pz, d.x, d.z) < 3) {
          d.taken = true;
          this.scene.remove(d.mesh); this.scene.remove(d.mark);
          this.particles.burst(d.x, 1.5, d.z, 10, 3, 3, 0.8, 1, 0.55, 0.75);
          audio.can();
          A.collected++;
          this.ui.updateMissionObjective(`Donuts: ${A.collected} / 6`);
          if (A.collected >= 6) { this._complete(); return; }
        }
      }
      if (A.collected === 0) this.ui.updateMissionObjective('Donuts: 0 / 6');
    }
    if (A.def.type === 'race') {
      const d = dist2D(px, pz, A.cpPos.x, A.cpPos.z);
      if (d < 5.5) {
        this.particles.burst(A.cpPos.x, 2, A.cpPos.z, 14, 4, 4, 0.7, 0.5, 1, 0);
        this._advanceCheckpoint();
        if (!this.active) return;
      }
      this.ui.updateMissionObjective(`Checkpoint ${A.cpIndex + 1} / ${A.def.checkpoints.length}`);
    }
    if (A.def.type === 'smash') {
      if (!ctx.inCar) this.ui.updateMissionObjective(`Crates smashed: ${A.smashed} / 8 (need a car!)`);
      else this.ui.updateMissionObjective(`Crates smashed: ${A.smashed} / 8`);
    }
    if (A.def.type === 'deliver') {
      const d = dist2D(px, pz, A.dropPos.x, A.dropPos.z);
      if (d < 5 && ctx.inCar && ctx.carSpeed < 2) {
        audio.checkpoint();
        this.particles.burst(A.dropPos.x, 2, A.dropPos.z, 14, 4, 4, 0.7, 0.3, 0.6, 1);
        this.scene.remove(A.dropMark);
        this.tempObjects = this.tempObjects.filter(o => o !== A.dropMark);
        A.delivered++;
        if (A.delivered >= 3) { this._complete(); return; }
        this._spawnDrop(A.def.drops[A.delivered]);
        this.ui.updateMissionObjective(`Packages: ${A.delivered} / 3`);
      } else {
        this.ui.updateMissionObjective(`Packages: ${A.delivered} / 3 - park in the blue zone`);
      }
    }
    if (A.def.type === 'tail') {
      const car = this.tailCar;
      // tail car AI
      const wp = car.waypoints[car.wpIndex];
      const res = car.aiStep(dt, { x: wp[0], z: wp[1] }, this.world.colliders, null, 14);
      if (res.dist < 6) car.wpIndex = (car.wpIndex + 1) % car.waypoints.length;
      this.tailMark.position.set(car.pos.x, 0, car.pos.z);
      // distance check to player
      const d = dist2D(px, pz, car.pos.x, car.pos.z);
      if (d > 8 && d < 45) {
        A.tailProgress += dt;
        A.tailLost = Math.max(0, A.tailLost - dt * 2);
        A.tailClose = Math.max(0, A.tailClose - dt * 2);
      } else if (d <= 8) {
        A.tailClose += dt;
        if (A.tailClose > 3) { this._fail('Too close! You spooked him.'); return; }
      } else {
        A.tailLost += dt;
        if (A.tailLost > 5) { this._fail('You lost him!'); return; }
      }
      const pct = Math.min(100, Math.floor((A.tailProgress / 30) * 100));
      this.ui.updateMissionObjective(`Tailing: ${pct}% ${d <= 8 ? 'TOO CLOSE!' : d >= 45 ? 'TOO FAR!' : ''}`);
      if (A.tailProgress >= 30) { this._complete(); return; }
    }
  }
  // called from main when player car overlaps a mission crate
  trySmashCrate(x, z, particles) {
    if (!this.active || this.active.def.type !== 'smash') return false;
    for (const c of this.missionCrates) {
      if (c.alive && dist2D(x, z, c.x, c.z) < 2.6) {
        c.alive = false;
        this.scene.remove(c.mesh); this.scene.remove(c.mark);
        particles.burst(c.x, 1, c.z, 16, 5, 4, 0.9, 0.85, 0.2, 0.2);
        audio.smash();
        this.active.smashed++;
        this.ui.updateMissionObjective(`Crates smashed: ${this.active.smashed} / 8`);
        if (this.active.smashed >= 8) this._complete();
        return true;
      }
    }
    return false;
  }
}
