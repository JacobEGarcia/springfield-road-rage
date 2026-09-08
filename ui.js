// ui.js - HUD, toasts, minimap
import { ROADS, BLOCKS, WORLD_BOUND } from './world.js';
import { clamp } from './util.js';

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      coins: document.getElementById('coin-count'),
      cans: document.getElementById('can-count'),
      gags: document.getElementById('gag-count'),
      heatWrap: document.getElementById('heat-wrap'),
      heatFill: document.getElementById('heat-fill'),
      missionPanel: document.getElementById('mission-panel'),
      mTitle: document.querySelector('#mission-panel .m-title'),
      mObj: document.querySelector('#mission-panel .m-obj'),
      mTimer: document.querySelector('#mission-panel .m-timer'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      toast: document.getElementById('toast'),
      subtitle: document.getElementById('subtitle'),
      interact: document.getElementById('interact-hint'),
      wasted: document.getElementById('wasted'),
      mcomplete: document.getElementById('mission-complete'),
      mcReward: document.getElementById('mc-reward'),
      title: document.getElementById('title-screen'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this._toastT = null;
    this._subT = null;
    this._mmBase = null;
  }
  showHUD() {
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }
  setCoins(v) { this.el.coins.textContent = v; }
  setCans(v, max) { this.el.cans.textContent = `${v} / ${max}`; }
  setGags(v, max) { this.el.gags.textContent = `${v} / ${max}`; }
  setHeat(v01) {
    this.el.heatFill.style.width = `${clamp(v01, 0, 1) * 100}%`;
    this.el.heatWrap.classList.toggle('maxed', v01 >= 1);
  }
  setSpeed(mph, visible) {
    this.el.speedo.classList.toggle('hidden', !visible);
    if (visible) this.el.speedo.innerHTML = `${Math.round(mph)}<span> MPH</span>`;
  }
  showMission(title, brief) {
    this.el.missionPanel.classList.remove('hidden');
    this.el.mTitle.textContent = title;
    this.el.mObj.textContent = brief;
    this.el.mTimer.textContent = '';
  }
  updateMissionObjective(t) {
    if (this._lastObj !== t) { this.el.mObj.textContent = t; this._lastObj = t; }
  }
  updateMissionTimer(sec) {
    this.el.mTimer.textContent = `${Math.max(0, sec).toFixed(1)}s`;
    this.el.mTimer.classList.toggle('low', sec < 15);
  }
  hideMission() {
    this.el.missionPanel.classList.add('hidden');
    this._lastObj = null;
  }
  toast(text, secs = 2) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = 1;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.el.toast.style.opacity = 0; }, secs * 1000);
  }
  subtitle(text, secs = 3) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.style.opacity = 1;
    clearTimeout(this._subT);
    this._subT = setTimeout(() => { this.el.subtitle.style.opacity = 0; }, secs * 1000);
  }
  interactHint(text) {
    if (text) { this.el.interact.textContent = text; this.el.interact.style.opacity = 1; }
    else this.el.interact.style.opacity = 0;
  }
  wasted(show) { this.el.wasted.classList.toggle('hidden', !show); }
  missionComplete(reward) {
    this.el.mcReward.textContent = `+${reward} coins`;
    this.el.mcomplete.classList.remove('hidden');
    setTimeout(() => this.el.mcomplete.classList.add('hidden'), 2600);
  }
  // ---- minimap ----
  initMinimap(landmarks) {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#79c24d'; ctx.fillRect(0, 0, 200, 200);
    const s = 200 / (WORLD_BOUND * 2);
    const tx = (x) => (x + WORLD_BOUND) * s;
    // blocks
    ctx.fillStyle = '#8fd45e';
    for (const bx of BLOCKS) for (const bz of BLOCKS) {
      ctx.fillRect(tx(bx - 26), tx(bz - 26), 52 * s, 52 * s);
    }
    // roads
    ctx.fillStyle = '#4a4a4a';
    for (const r of ROADS) {
      ctx.fillRect(tx(r - 7), 0, 14 * s, 200);
      ctx.fillRect(0, tx(r - 7), 200, 14 * s);
    }
    // landmarks
    for (const l of landmarks) {
      ctx.fillStyle = l.color;
      ctx.fillRect(tx(l.x) - 3, tx(l.z) - 3, 6, 6);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(tx(l.x) - 3, tx(l.z) - 3, 6, 6);
    }
    this._mmBase = c;
    this._mmS = s;
  }
  drawMinimap(player, heading, extras = []) {
    const ctx = this.mm;
    if (!this._mmBase) return;
    ctx.clearRect(0, 0, 200, 200);
    ctx.drawImage(this._mmBase, 0, 0);
    const s = this._mmS;
    const tx = (x) => (x + WORLD_BOUND) * s;
    for (const e of extras) {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(tx(e.x), tx(e.z), e.r || 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.stroke();
    }
    // player arrow
    ctx.save();
    ctx.translate(tx(player.x), tx(player.z));
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
