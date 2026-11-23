/* Watermelon Go - settings.js
 * ระบบตั้งค่า: เปลี่ยนพื้นหลัง / อัปโหลดรูปผลไม้ (sprite sheet) / ปรับความมนของกรอบ
 * ใช้งาน: <script src="settings.js"></script> แล้วเรียก WG.init()
 */
(function () {
  'use strict';

  // ===== ข้อกำหนดขนาดรูป =====
  const LIMITS = {
    bg:    { minW: 360, minH: 640, recW: 1080, recH: 1920, maxW: 2160, maxH: 3840, maxMB: 8 },
    sheet: { minCell: 64, recCell: 256, maxCell: 512, maxMB: 8 }
  };
  const DEF = { cols: 5, rows: 2, radius: 100, borderW: 0, borderColor: '#ffffff', frameRadius: 24 };

  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem('wg_settings') || '{}')); } catch (e) {}
  const saveS = () => { try { localStorage.setItem('wg_settings', JSON.stringify(S)); } catch (e) {} };

  // ===== IndexedDB (เก็บรูปที่อัปโหลด) =====
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('wg', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kvGet(k) {
    try {
      const db = await idb();
      return await new Promise(res => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function kvSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }
  async function kvDel(k) {
    try {
      const db = await idb();
      return await new Promise(res => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res;
      });
    } catch (e) {}
  }

  function loadImage(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('เปิดรูปไม่ได้')); };
      img.src = url;
    });
  }

  // ===== สถานะที่เกมเรียกใช้ =====
  const listeners = [];
  const WG = {
    paused: false,      // เกมหยุดชั่วคราวตอนเปิดหน้าตั้งค่า
    bgImage: null,      // Image พื้นหลัง (null = ใช้ของเดิม)
    sheetImage: null,   // Image ของ sprite sheet ต้นฉบับ
    fruits: [],         // canvas ผลไม้แต่ละช่อง (ตัดและมนมุมแล้ว) ใช้กับ drawImage ได้เลย
    settings: S,
    onChange(cb) { listeners.push(cb); },
    init
  };
  window.WG = WG;
  const fire = () => listeners.forEach(cb => { try { cb(WG); } catch (e) { console.error(e); } });

  // ===== วาดสี่เหลี่ยมมน =====
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildFruits() {
    WG.fruits = [];
    const img = WG.sheetImage;
    if (!img) return;
    const cw = Math.floor(img.width / S.cols), ch = Math.floor(img.height / S.rows);
    const rad = Math.min(cw, ch) / 2 * (S.radius / 100); // 0 = เหลี่ยม, 100 = วงกลม
    for (let r = 0; r < S.rows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const ctx = cv.getContext('2d');
        ctx.save();
        rr(ctx, 0, 0, cw, ch, rad);
        ctx.clip();
        ctx.drawImage(img, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
        ctx.restore();
        if (S.borderW > 0) {
          const b = S.borderW;
          ctx.lineWidth = b; ctx.strokeStyle = S.borderColor;
          rr(ctx, b / 2, b / 2, cw - b, ch - b, Math.max(0, rad - b / 2));
          ctx.stroke();
        }
        WG.fruits.push(cv);
      }
    }
  }

  // ===== ใช้พื้นหลัง / กรอบ =====
  let bgUrl = null;
  function applyBackground() {
    const b = document.body;
    if (WG.bgImage) {
      bgUrl = WG.bgImage.src;
      b.style.backgroundImage = 'url("' + bgUrl + '")';
      b.style.backgroundSize = 'cover';
      b.style.backgroundPosition = 'center';
      b.style.backgroundRepeat = 'no-repeat';
      b.style.backgroundAttachment = 'fixed';
    } else {
      b.style.backgroundImage = b.style.backgroundSize = b.style.backgroundPosition =
        b.style.backgroundRepeat = b.style.backgroundAttachment = '';
    }
  }
  let frameSel = null; // ใส่ selector ใน WG.init({frameSelector}) ถ้าต้องการให้ CSS มนกรอบ element
  function applyFrame() {
    if (!frameSel) return;
    document.documentElement.style.setProperty('--wg-frame-radius', S.frameRadius + 'px');
    let st = document.getElementById('wg-frame-style');
    if (!st) { st = document.createElement('style'); st.id = 'wg-frame-style'; document.head.appendChild(st); }
    st.textContent = frameSel + '{border-radius:var(--wg-frame-radius)!important;overflow:hidden}';
  }

  // ===== ตรวจรูป =====
  const mb = f => (f.size / 1048576).toFixed(1);
  async function checkBg(file) {
    const L = LIMITS.bg;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('ใช้ได้เฉพาะ PNG / JPG / WEBP');
    if (file.size > L.maxMB * 1048576) throw new Error('ไฟล์ใหญ่ไป (' + mb(file) + ' MB) สูงสุด ' + L.maxMB + ' MB');
    const img = await loadImage(file);
    if (img.width < L.minW || img.height < L.minH)
      throw new Error('รูปเล็กไป (' + img.width + '×' + img.height + ') ขั้นต่ำ ' + L.minW + '×' + L.minH);
    if (img.width > L.maxW || img.height > L.maxH)
      throw new Error('รูปใหญ่ไป (' + img.width + '×' + img.height + ') สูงสุด ' + L.maxW + '×' + L.maxH);
    return img;
  }
  async function checkSheet(file) {
    const L = LIMITS.sheet;
    if (!/^image\/(png|webp)$/.test(file.type)) throw new Error('รูปผลไม้ใช้ PNG หรือ WEBP (พื้นหลังโปร่งใส)');
    if (file.size > L.maxMB * 1048576) throw new Error('ไฟล์ใหญ่ไป (' + mb(file) + ' MB) สูงสุด ' + L.maxMB + ' MB');
    const img = await loadImage(file);
    const cw = img.width / S.cols, ch = img.height / S.rows;
    if (Math.min(cw, ch) < L.minCell) throw new Error('แต่ละช่องเล็กไป (' + Math.floor(cw) + '×' + Math.floor(ch) + ') ขั้นต่ำ ' + L.minCell + '×' + L.minCell);
    if (Math.max(cw, ch) > L.maxCell) throw new Error('แต่ละช่องใหญ่ไป (' + Math.floor(cw) + '×' + Math.floor(ch) + ') สูงสุด ' + L.maxCell + '×' + L.maxCell);
    return img;
  }

  // ===== UI =====
  const CSS = `
  #wg-gear{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99998;width:42px;height:42px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:22px;line-height:42px;padding:0;cursor:pointer}
  #wg-panel{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif}
  #wg-panel.open{display:flex}
  #wg-box{background:#fff;color:#222;width:100%;max-width:480px;max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;padding:16px 16px 28px}
  #wg-box{touch-action:pan-y;-webkit-user-select:auto;user-select:auto}
  #wg-box input{-webkit-user-select:auto;user-select:auto}
  #wg-box h2{margin:0 0 8px;font-size:18px;display:flex;justify-content:space-between;align-items:center}
  #wg-box h3{margin:18px 0 6px;font-size:15px}
  #wg-box .hint{font-size:12px;color:#666;line-height:1.5;background:#f4f4f4;border-radius:8px;padding:8px;margin:4px 0 8px}
  #wg-box label{display:flex;align-items:center;gap:8px;font-size:14px;margin:8px 0}
  #wg-box input[type=range]{flex:1}
  #wg-box input[type=number]{width:60px}
  #wg-box button.wg-b{padding:8px 12px;border:0;border-radius:10px;background:#2e9e4f;color:#fff;font-size:14px;margin:4px 6px 4px 0}
  #wg-box button.wg-r{background:#999}
  #wg-box .err{color:#c0392b;font-size:13px;min-height:18px}
  #wg-box .ok{color:#2e9e4f}
  #wg-prev{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #wg-prev canvas{width:56px;height:56px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 50%/12px 12px}
  `;

  function init(opts) {
    opts = opts || {};
    if (opts.frameSelector) frameSel = opts.frameSelector;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    const L = LIMITS;
    const gear = document.createElement('button');
    gear.id = 'wg-gear'; gear.textContent = '⚙️'; gear.setAttribute('aria-label', 'ตั้งค่า');
    const panel = document.createElement('div'); panel.id = 'wg-panel';
    panel.innerHTML = `
    <div id="wg-box">
      <h2>ตั้งค่า <button class="wg-b wg-r" id="wg-close">ปิด</button></h2>

      <h3>🖼️ พื้นหลัง</h3>
      <div class="hint">
        แนะนำ <b>${L.bg.recW}×${L.bg.recH}</b> px (แนวตั้ง 9:16)<br>
        ขั้นต่ำ ${L.bg.minW}×${L.bg.minH} · สูงสุด ${L.bg.maxW}×${L.bg.maxH} px<br>
        ไฟล์ PNG / JPG / WEBP ไม่เกิน ${L.bg.maxMB} MB
      </div>
      <input type="file" id="wg-bg" accept="image/png,image/jpeg,image/webp">
      <button class="wg-b wg-r" id="wg-bg-reset">ใช้พื้นหลังเดิม</button>
      <div class="err" id="wg-bg-msg"></div>

      <h3>🍉 รูปผลไม้ (รูปเดียวหลายช่อง)</h3>
      <div class="hint">
        รวมผลไม้ทุกชนิดไว้ในรูปเดียว เรียงเป็นตาราง ช่องขนาดเท่ากันทุกช่อง ใช้ PNG/WEBP พื้นหลังโปร่งใส<br>
        ช่องละ <b>${L.sheet.recCell}×${L.sheet.recCell}</b> px (ขั้นต่ำ ${L.sheet.minCell} · สูงสุด ${L.sheet.maxCell} px ต่อช่อง) · ไฟล์ไม่เกิน ${L.sheet.maxMB} MB<br>
        เช่น 4 คอลัมน์ × 2 แถว = รูปขนาด ${L.sheet.recCell * 4}×${L.sheet.recCell * 2} px (8 ชนิด) เรียงจากซ้ายไปขวา บนลงล่าง
      </div>
      <label>คอลัมน์ <input type="number" id="wg-cols" min="1" max="10"> แถว <input type="number" id="wg-rows" min="1" max="10"></label>
      <input type="file" id="wg-sheet" accept="image/png,image/webp">
      <button class="wg-b wg-r" id="wg-sheet-reset">ใช้รูปผลไม้เดิม</button>
      <div class="err" id="wg-sheet-msg"></div>
      <div id="wg-prev"></div>

      <h3>🔲 กรอบ</h3>
      <label>ความมนของผลไม้ <input type="range" id="wg-rad" min="0" max="100"> <span id="wg-rad-v"></span>%</label>
      <label>ความหนาขอบผลไม้ <input type="range" id="wg-bw" min="0" max="16"> <span id="wg-bw-v"></span>px</label>
      <label>สีขอบ <input type="color" id="wg-bc"></label>
      <label>ความมนของกรอบเกม <input type="range" id="wg-fr" min="0" max="64"> <span id="wg-fr-v"></span>px</label>
      <button class="wg-b wg-r" id="wg-frame-reset">รีเซ็ตกรอบ</button>
    </div>`;
    document.body.append(gear, panel);
    const $ = id => panel.querySelector('#' + id);

    gear.onclick = () => { panel.classList.add('open'); WG.paused = true; };
    const closeP = () => { panel.classList.remove('open'); WG.paused = false; };
    $('wg-close').onclick = closeP;
    panel.onclick = e => { if (e.target === panel) closeP(); };

    const syncUI = () => {
      $('wg-cols').value = S.cols; $('wg-rows').value = S.rows;
      $('wg-rad').value = S.radius; $('wg-rad-v').textContent = S.radius;
      $('wg-bw').value = S.borderW; $('wg-bw-v').textContent = S.borderW;
      $('wg-bc').value = S.borderColor;
      $('wg-fr').value = S.frameRadius; $('wg-fr-v').textContent = S.frameRadius;
    };
    const preview = () => {
      const p = $('wg-prev'); p.innerHTML = '';
      WG.fruits.forEach(cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); p.appendChild(c); });
    };
    const refresh = () => { buildFruits(); preview(); fire(); };

    // พื้นหลัง
    $('wg-bg').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const m = $('wg-bg-msg'); m.className = 'err';
      try {
        const img = await checkBg(f);
        await kvSet('bg', f);
        WG.bgImage = img; applyBackground(); fire();
        m.className = 'err ok'; m.textContent = 'เปลี่ยนพื้นหลังแล้ว (' + img.width + '×' + img.height + ')';
      } catch (err) { m.textContent = '⚠️ ' + err.message; }
      e.target.value = '';
    };
    $('wg-bg-reset').onclick = async () => { await kvDel('bg'); WG.bgImage = null; applyBackground(); fire(); $('wg-bg-msg').textContent = ''; };

    // ผลไม้
    $('wg-sheet').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const m = $('wg-sheet-msg'); m.className = 'err';
      try {
        const img = await checkSheet(f);
        await kvSet('sheet', f);
        WG.sheetImage = img; refresh();
        m.className = 'err ok'; m.textContent = 'โหลดแล้ว ' + WG.fruits.length + ' ช่อง';
      } catch (err) { m.textContent = '⚠️ ' + err.message; }
      e.target.value = '';
    };
    $('wg-sheet-reset').onclick = async () => { await kvDel('sheet'); WG.sheetImage = null; WG.fruits = []; preview(); fire(); $('wg-sheet-msg').textContent = ''; };
    const gridChange = () => {
      S.cols = Math.max(1, Math.min(10, +$('wg-cols').value || 1));
      S.rows = Math.max(1, Math.min(10, +$('wg-rows').value || 1));
      saveS(); refresh();
    };
    $('wg-cols').onchange = $('wg-rows').onchange = gridChange;

    // กรอบ
    const bind = (id, key, vid, after) => {
      $(id).oninput = () => {
        S[key] = id === 'wg-bc' ? $(id).value : +$(id).value;
        if (vid) $(vid).textContent = S[key];
        saveS(); after();
      };
    };
    bind('wg-rad', 'radius', 'wg-rad-v', refresh);
    bind('wg-bw', 'borderW', 'wg-bw-v', refresh);
    bind('wg-bc', 'borderColor', null, refresh);
    bind('wg-fr', 'frameRadius', 'wg-fr-v', () => { applyFrame(); fire(); });
    $('wg-frame-reset').onclick = () => {
      Object.assign(S, { radius: DEF.radius, borderW: DEF.borderW, borderColor: DEF.borderColor, frameRadius: DEF.frameRadius });
      saveS(); syncUI(); applyFrame(); refresh();
    };

    // โหลดของที่เคยเซฟไว้
    (async () => {
      syncUI(); applyFrame();
      const bg = await kvGet('bg');
      if (bg) { try { WG.bgImage = await loadImage(bg); applyBackground(); } catch (e) {} }
      const sh = await kvGet('sheet');
      if (sh) { try { WG.sheetImage = await loadImage(sh); buildFruits(); preview(); } catch (e) {} }
      fire();
    })();
  }
})();
