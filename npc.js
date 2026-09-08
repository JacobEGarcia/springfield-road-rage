// npc.js - wandering pedestrians that flee and get comically bonked
import * as THREE from 'three';
import { rand, choice, clamp, resolveCircleAABB, dist2D } from './util.js';
import { makeCharacter, animateCharacter } from './chars.js';
import { BLOCKS } from './world.js';

const SKINS = [0xffd90f, 0xffd90f, 0xffd90f, 0x8a5a2b, 0xf0c8a0, 0x7cbf5a];
const SHIRTS = [0xd43a2f, 0x2b6fd4, 0x7cbf5a, 0xe8a83c, 0x9b59b6, 0xffffff, 0x2ba8a0];

export class Ped {
  constructor(scene, x, z) {
    this.mesh = makeCharacter({
      skin: choice(SKINS), shirt: choice(SHIRTS), pants: choice(SHIRTS),
      hair: choice(['bald', 'combover', 'spiky', 'apu']), scale: rand(0.85, 1.05),
    });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = rand(0, Math.PI * 2);
    this.target = this._pickTarget();
    this.speed = rand(1.4, 2.4);
    this.state = 'walk'; // walk | flee | down
    this.downT = 0;
    this.animT = rand(0, 10);
  }
  _pickTarget() {
    const b = choice(BLOCKS);
    return { x: b + rand(-20, 20), z: b + rand(-20, 20) };
  }
  bonk(particles) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downT = 4;
    particles.burst(this.pos.x, 2, this.pos.z, 8, 3, 3, 0.8, 1, 0.85, 0.1);
  }
  update(dt, colliders, playerCarPos, playerCarSpeed, particles) {
    if (this.state === 'down') {
      this.downT -= dt;
      this.mesh.rotation.z = Math.PI / 2;
      this.mesh.position.y = 0.3;
      if (this.downT <= 0) {
        this.state = 'walk';
        this.mesh.rotation.z = 0;
        this.mesh.position.y = 0;
        this.target = this._pickTarget();
      }
      return;
    }
    // flee fast cars
    if (playerCarPos && playerCarSpeed > 6) {
      const d = dist2D(this.pos.x, this.pos.z, playerCarPos.x, playerCarPos.z);
      if (d < 9) {
        this.state = 'flee';
        const away = Math.atan2(this.pos.x - playerCarPos.x, this.pos.z - playerCarPos.z);
        this.target = { x: this.pos.x + Math.sin(away) * 20, z: this.pos.z + Math.cos(away) * 20 };
      }
    }
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      this.target = this._pickTarget();
      this.state = 'walk';
      return;
    }
    const th = Math.atan2(dx, dz);
    let dh = th - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, dt * 6);
    const sp = this.state === 'flee' ? this.speed * 3.2 : this.speed;
    this.pos.x += Math.sin(this.heading) * sp * dt;
    this.pos.z += Math.cos(this.heading) * sp * dt;
    for (const c of colliders) {
      const res = resolveCircleAABB(this.pos.x, this.pos.z, 0.5, c);
      if (res) { this.pos.x = res[0]; this.pos.z = res[1]; this.target = this._pickTarget(); }
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.animT += dt * (this.state === 'flee' ? 2 : 1);
    animateCharacter(this.mesh, this.animT, this.state === 'flee' ? 1 : 0.4);
  }
}

export function spawnPeds(scene, count = 16) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const b = choice(BLOCKS);
    peds.push(new Ped(scene, b + rand(-20, 20), b + rand(-20, 20)));
  }
  return peds;
}
