// chars.js - procedural cartoon character factory (all original art)
import * as THREE from 'three';
import { toon, outline } from './util.js';

// styles: bald, tall-blue, spiky, lisa, cop, moe, apu, random
export function makeCharacter(opts = {}) {
  const {
    skin = 0xffd90f, shirt = 0xffffff, pants = 0x4a6fd4,
    hair = 'bald', hairColor = 0x222222, scale = 1,
  } = opts;
  const g = new THREE.Group();
  const OS = 1.06;

  // legs (pivot at hip)
  const legGeo = new THREE.CapsuleGeometry(0.16, 0.5, 3, 8);
  const legL = new THREE.Group(); const legR = new THREE.Group();
  [legL, legR].forEach((lg, i) => {
    const m = new THREE.Mesh(legGeo, toon(pants));
    m.position.y = -0.45;
    lg.add(m); lg.add(outline(legGeo, OS));
    lg.children[1].position.y = -0.45;
    lg.position.set(i === 0 ? -0.18 : 0.18, 0.95, 0);
    g.add(lg);
  });
  // shoes
  const shoeGeo = new THREE.SphereGeometry(0.18, 8, 6);
  [legL, legR].forEach(lg => {
    const s = new THREE.Mesh(shoeGeo, toon(0x333333));
    s.scale.set(1, 0.6, 1.4); s.position.set(0, -0.82, 0.06);
    lg.add(s);
  });

  // body (shirt) - slightly pear shaped
  const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.55, 4, 12);
  const body = new THREE.Mesh(bodyGeo, toon(shirt));
  body.position.y = 1.45; body.scale.set(1.15, 1, 1.0);
  g.add(body); 
  const bodyO = outline(bodyGeo, OS); bodyO.position.y = 1.45; bodyO.scale.set(1.15, 1, 1.0);
  g.add(bodyO);

  // arms (pivot at shoulder)
  const armGeo = new THREE.CapsuleGeometry(0.13, 0.5, 3, 8);
  const armL = new THREE.Group(); const armR = new THREE.Group();
  [armL, armR].forEach((ag, i) => {
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.18, 3, 8), toon(shirt));
    sleeve.position.y = -0.12;
    const m = new THREE.Mesh(armGeo, toon(skin));
    m.position.y = -0.42;
    ag.add(sleeve); ag.add(m);
    const mo = outline(armGeo, OS); mo.position.y = -0.42;
    ag.add(mo);
    ag.position.set(i === 0 ? -0.55 : 0.55, 1.85, 0);
    ag.rotation.z = (i === 0 ? 1 : -1) * 0.15;
    g.add(ag);
  });

  // head
  const headGeo = new THREE.SphereGeometry(0.42, 14, 12);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(headGeo, toon(skin));
  head.add(skull);
  const skullO = outline(headGeo, OS);
  head.add(skullO);
  // muzzle (homer-ish mouth area)
  if (opts.muzzle !== false) {
    const muzGeo = new THREE.SphereGeometry(0.24, 10, 8);
    const muz = new THREE.Mesh(muzGeo, toon(skin));
    muz.position.set(0, -0.16, 0.3); muz.scale.set(1.2, 0.8, 0.9);
    head.add(muz);
  }
  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.13, 8, 8);
  const pupGeo = new THREE.SphereGeometry(0.045, 6, 6);
  [-0.13, 0.13].forEach(x => {
    const e = new THREE.Mesh(eyeGeo, toon(0xffffff));
    e.position.set(x, 0.08, 0.34);
    const p = new THREE.Mesh(pupGeo, new THREE.MeshBasicMaterial({ color: 0x111111 }));
    p.position.set(x, 0.08, 0.45);
    head.add(e); head.add(p);
  });
  // hair styles
  if (hair === 'tall-blue') {
    const hGeo = new THREE.CapsuleGeometry(0.34, 0.9, 4, 10);
    const h = new THREE.Mesh(hGeo, toon(hairColor));
    h.position.y = 0.75;
    head.add(h); const ho = outline(hGeo, OS); ho.position.y = 0.75; head.add(ho);
  } else if (hair === 'spiky') {
    for (let i = 0; i < 7; i++) {
      const cGeo = new THREE.ConeGeometry(0.12, 0.3, 4);
      const c = new THREE.Mesh(cGeo, toon(hairColor === 0x222222 ? skin : hairColor));
      const a = (i / 7) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.34, 0.32, Math.sin(a) * 0.34);
      c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      head.add(c);
    }
  } else if (hair === 'lisa') {
    for (let i = 0; i < 8; i++) {
      const cGeo = new THREE.ConeGeometry(0.16, 0.42, 4);
      const c = new THREE.Mesh(cGeo, toon(skin));
      const a = (i / 8) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38);
      c.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      head.add(c);
    }
    // pearl necklace
    for (let i = 0; i < 6; i++) {
      const pGeo = new THREE.SphereGeometry(0.05, 6, 6);
      const p = new THREE.Mesh(pGeo, toon(0xffffff));
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.3, -0.35, Math.sin(a) * 0.3 + 0.05);
      head.add(p);
    }
  } else if (hair === 'cop') {
    const capGeo = new THREE.CylinderGeometry(0.4, 0.44, 0.18, 12);
    const cap = new THREE.Mesh(capGeo, toon(0x2b3a67));
    cap.position.y = 0.36;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), toon(0x111111));
    brim.position.set(0, 0.3, 0.4);
    head.add(cap); head.add(brim);
  } else if (hair === 'moe') {
    const pGeo = new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.4);
    const p = new THREE.Mesh(pGeo, toon(0x777777));
    p.position.y = 0.16;
    head.add(p);
  } else if (hair === 'apu') {
    const pGeo = new THREE.SphereGeometry(0.34, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.2);
    const p = new THREE.Mesh(pGeo, toon(0x1a1a1a));
    p.position.y = 0.13;
    head.add(p);
  } else if (hair === 'combover') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12, Math.PI), toon(0x5a5a5a));
    arc.position.y = 0.22; arc.rotation.x = -0.4;
    head.add(arc);
  }
  head.position.y = 2.35;
  g.add(head);

  g.scale.setScalar(scale);
  g.userData.parts = { legL, legR, armL, armR, head, body };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// walk/idle animation
export function animateCharacter(g, t, speed01, airborne = false) {
  const p = g.userData.parts;
  if (!p) return;
  const sw = Math.sin(t * 10) * 0.7 * speed01;
  if (airborne) {
    p.legL.rotation.x = 0.5; p.legR.rotation.x = -0.3;
    p.armL.rotation.z = 2.6; p.armR.rotation.z = -2.6;
  } else {
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
    p.armL.rotation.z = 0.15 + speed01 * 0.2;
    p.armR.rotation.z = -0.15 - speed01 * 0.2;
  }
  p.head.position.y = 2.35 + Math.abs(Math.sin(t * 10)) * 0.05 * speed01;
  p.body.position.y = 1.45 + Math.abs(Math.sin(t * 10)) * 0.03 * speed01;
}
