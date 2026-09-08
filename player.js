// player.js - on-foot character controller
import * as THREE from 'three';
import { resolveCircleAABB, clamp } from './util.js';
import { makeCharacter, animateCharacter } from './chars.js';

export class Player {
  constructor(scene, x, z) {
    this.mesh = makeCharacter({
      skin: 0xffd90f, shirt: 0xffffff, pants: 0x4a6fd4, hair: 'bald', scale: 1.05,
    });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.vy = 0;
    this.grounded = true;
    this.speed01 = 0;
    this.animT = 0;
    this.radius = 0.55;
  }
  update(dt, input, camYaw, colliders) {
    const run = input.shift ? 9 : 5;
    let mx = 0, mz = 0;
    if (input.w) mz -= 1;
    if (input.s) mz += 1;
    if (input.a) mx -= 1;
    if (input.d) mx += 1;
    const moving = (mx !== 0 || mz !== 0);
    if (moving) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      // camera-relative
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // camera-relative: screen-right = (-cos, 0, sin), screen-forward = (sin, 0, cos)
      const wx = -mx * cos - mz * sin;
      const wz = mx * sin - mz * cos;
      const targetHeading = Math.atan2(wx, wz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 12);
      this.vel.x = wx * run;
      this.vel.z = wz * run;
      this.speed01 = input.shift ? 1 : 0.55;
    } else {
      this.vel.x *= Math.pow(0.0001, dt);
      this.vel.z *= Math.pow(0.0001, dt);
      this.speed01 *= Math.pow(0.01, dt);
    }
    // gravity/jump
    if (input.spacePressed && this.grounded) {
      this.vy = 8.5;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 24 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // collide
    for (const c of colliders) {
      const res = resolveCircleAABB(this.pos.x, this.pos.z, this.radius, c);
      if (res) { this.pos.x = res[0]; this.pos.z = res[1]; }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.animT += dt * (0.6 + this.speed01);
    animateCharacter(this.mesh, this.animT, clamp(this.speed01, 0, 1), !this.grounded);
  }
  teleport(x, z) {
    this.pos.set(x, 0, z);
    this.mesh.position.copy(this.pos);
  }
}
