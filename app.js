/* =====================================================================
   DGTLN POS — app utama (SPG kasir offline-first + dashboard admin/brand)
   ===================================================================== */
const CFG = window.DGTLN_CONFIG || {};
const APP = window.DGTLN_APP === 'admin' ? 'admin' : 'spg';   // index.html = SPG, admin.html = dashboard
const CONFIGURED = CFG.url && CFG.anonKey && !/ISI_/.test(CFG.url + CFG.anonKey);
let sb = null;
try { if (CONFIGURED && window.supabase) sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } }); } catch (e) { console.warn(e); }

/* ---------- konstanta & helper ---------- */
const CATS = ['Produk', 'Merch', 'Bundling'];
const COLORS = ['#FF4F6E', '#B79CFF', '#D7F26A', '#FF9F5A', '#7EE6F2', '#F6C6FF'];
const EMOS = ['🥤', '☕', '🧃', '🍫', '🍪', '📦', '👕', '🧢', '🎒', '🥛', '🏷️', '🎁'];
const AVA = ['🦊', '🐼', '🐯', '🐨', '🐰', '🦁', '🐸', '🐻', '🐱', '🐶', '🦄', '🐵'];
const TZS = [['Asia/Jakarta', 'WIB'], ['Asia/Makassar', 'WITA'], ['Asia/Jayapura', 'WIT']];
const rp = n => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
const rpk = n => n >= 1e6 ? 'Rp' + (n / 1e6).toFixed(1).replace('.', ',') + 'jt' : n >= 1e3 ? 'Rp' + Math.round(n / 1e3) + 'rb' : 'Rp' + Math.round(n || 0);
const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) });
const hm = t => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const dt = t => new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const price = p => p.price > 0 ? rp(p.price) : 'Gratis';
const ymd = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) };
const fmtD = s => new Date(s + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const range = e => e.start === e.end ? fmtD(e.start) : fmtD(e.start) + ' – ' + fmtD(e.end);
function evStatus(e) { const t = ymd(new Date()); if (!e.active) return 'Nonaktif'; if (t < e.start) return 'Akan datang'; if (t > e.end) return 'Selesai'; return 'Berlangsung' }
const stCls = s => s.split(' ')[0];
const skus = p => p.variants && p.variants.length ? p.variants.map(v => ({ sku: p.id + '|' + v, v })) : [{ sku: p.id, v: '' }];
const skuP = sku => sku.split('|')[0];
const spgCode = sp => (sp ? sp.name : 'SPG').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
const packs = t => t.items.reduce((a, i) => a + i.qty, 0);
const itemName = i => i.name + (i.v ? ' (' + i.v + ')' : '');

/* ---------- penyimpanan HP ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { toast('Memori HP penuh!'); return false } },
  del(k) { try { localStorage.removeItem(k) } catch (e) { } }
};

/* ---------- state ---------- */
let MODE = 'none';          // 'spg' | 'admin'
let ROLE = null;            // admin: 'admin' | 'client'
let view = 'start';
let S = emptyS();
let MEMBERS = LS.get('dg_members', []);
let SESS = LS.get('dg_sess', null);   // {token, member, events}
let CK = LS.get('dg_ck', null);       // {eventId, checkin}
let B = null;                          // bootstrap event aktif
let Q = LS.get('dg_q', { trx: [], calls: [] });
const NET = { busy: false, fail: false, sessErr: false, last: 0 };
let lg = { spg: null, pin: '', email: '', pass: '' };
let adminEv = 'all', aTab = 'rekap', stokEv = null;

function emptyS() { return { brand: 'Brand', target: 50, oldBrands: [], tz: 'Asia/Jakarta', products: [], events: [], spgs: [], trx: [], calls: [], users: [], session: null } }
const getEv = id => S.events.find(e => e.id === id);
const getSpg = id => S.spgs.find(s => s.id === id);
const getP = id => S.products.find(p => p.id === id);
const saveQ = () => LS.set('dg_q', Q);
const bootKey = id => 'dg_boot_' + id;

/* ---------- hitungan ---------- */
function sold(evId, sku) {
  let n = 0;
  if (MODE === 'spg') {
    n = (B && B.sold && B.sold[sku]) || 0;
    Q.trx.forEach(t => { if (t.eventId === evId) t.items.forEach(i => { if (i.sku === sku) n += i.qty }) });
    return n;
  }
  S.trx.forEach(t => { if (t.eventId === evId) t.items.forEach(i => { if (i.sku === sku) n += i.qty }) });
  return n;
}
function left(evId, sku) { const e = getEv(evId); return ((e && e.stock[sku]) || 0) - sold(evId, sku) }
const leftP = (evId, p) => skus(p).reduce((a, s) => a + left(evId, s.sku), 0);
function stats(f) {
  const calls = S.calls.filter(f), trx = S.trx.filter(f), sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const items = trx.flatMap(t => t.items);
  return {
    calls, trx, call: calls.length + trx.length, ec: trx.length,
    so: sum(items.filter(i => i.price > 0), i => i.qty), gim: sum(items.filter(i => !i.price), i => i.qty),
    omzet: sum(trx, t => t.total), tunai: sum(trx.filter(t => t.pay === 'Tunai'), t => t.total), qris: sum(trx.filter(t => t.pay === 'QRIS'), t => t.total),
    trial: calls.filter(c => c.trial).length + trx.filter(t => t.cust.trial).length
  };
}

/* ---------- UI helper ---------- */
function toast(m) { const el = document.getElementById('toast'); el.textContent = m; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600) }
const sheetOpen = () => document.getElementById('sheet').classList.contains('open');
function openSheet(h, top) { const s = document.getElementById('sin'), sh = document.getElementById('sheet'); if (top || !sh.classList.contains('open')) s.scrollTop = 0; s.innerHTML = h; sh.classList.add('open') }
function closeSheet() { document.getElementById('sheet').classList.remove('open') }
const chip = (label, on, act) => `<button class="chip ${on ? 'on' : ''}" onclick="${act}">${label}</button>`;
const thumb = (p, s) => `<div class="th" style="width:${s}px;height:${s}px;background:${p.c};font-size:${Math.round(s * .5)}px">${p.img ? `<img src="${p.img}" alt="">` : p.emo}</div>`;
const mascot = s => `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><path d="M50 6c26 0 44 16 44 42 0 28-18 46-44 46S6 76 6 48C6 22 24 6 50 6z" fill="#D7F26A" stroke="#20104F" stroke-width="4"/><ellipse cx="36" cy="46" rx="6" ry="8" fill="#20104F"/><ellipse cx="64" cy="46" rx="6" ry="8" fill="#20104F"/><circle cx="38" cy="43" r="2" fill="#fff"/><circle cx="66" cy="43" r="2" fill="#fff"/><path d="M38 64q12 11 24 0" fill="none" stroke="#20104F" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="60" r="6" fill="#FF4F6E" opacity=".7"/><circle cx="76" cy="60" r="6" fill="#FF4F6E" opacity=".7"/></svg>`;
function confirmSheet(title, msg, ok, fn) { openSheet(`<div class="shd"><h2>${title}</h2><button class="x" onclick="closeSheet()">✕</button></div><p class="mut">${msg}</p><div class="grid2 pb" style="margin-top:16px"><button class="btn block" onclick="closeSheet()">Batal</button><button class="btn block primary" onclick="${fn}">${ok}</button></div>`, true) }
function errMsg(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/PIN_SALAH/.test(m)) return 'PIN salah 🔒';
  if (/SESSION_INVALID/.test(m)) return 'Sesi habis — login ulang';
  if (/EVENT_DITOLAK/.test(m)) return 'Kamu ga terdaftar di event ini';
  if (/BUKAN_ADMIN/.test(m)) return 'Khusus admin';
  if (/duplicate key|unique/i.test(m)) return 'Data sudah ada (kode/email dobel)';
  if (/Invalid login credentials/i.test(m)) return 'Email atau password salah';
  if (/fetch|network|Failed|timeout/i.test(m)) return 'Ga ada koneksi internet';
  return 'Gagal: ' + m.slice(0, 80);
}
function render() {
  const a = document.getElementById('app');
  a.innerHTML = ({ start: vStart, setup: vSetup, spgLogin: vSpgLogin, spgEvents: vSpgEvents, spg: vSpg, adminLogin: vAdminLogin, loading: vLoading, noaccess: vNoAccess, admin: vAdmin }[view] || vStart)();
}
const vLoading = () => `<div style="text-align:center;padding-top:30vh">${mascot(70)}<p class="mut" style="margin-top:14px">Memuat data…</p></div>`;
function vSetup() { return `<div class="hero">${mascot(70)}<div><h1>DGTLN<br><span class="hl">POS</span></h1></div></div><div class="card" style="margin-top:20px"><b>⚙️ Belum terhubung ke database</b><p class="mut sm" style="margin-top:8px;line-height:1.6">Isi <b>url</b> dan <b>anonKey</b> Supabase di file <code>config.js</code>, lalu commit ulang di GitHub.</p></div>` }

/* =====================================================================
   START
   ===================================================================== */
function vStart() {
  return `<div class="hero">${mascot(76)}<div><h1>DGTLN<br><span class="hl">POS</span></h1><p class="mut sm" style="margin-top:6px">SPG event + kasir dalam satu app.<br>Jualan, catat call, langsung jadi rekap.</p></div></div>
  <h3 class="sec">Masuk sebagai</h3><div class="grid2">
    <button class="btn role" data-tone="pink" onclick="goSpgLogin()"><div class="big">🙋‍♀️</div>SPG / TL</button>
    <button class="btn role" data-tone="lav" onclick="view='adminLogin';render()"><div class="big">📊</div>Admin / Brand</button></div>
  <p class="note" style="margin-top:28px">💡 Di HP SPG: buka menu browser → <b>Tambahkan ke Layar Utama</b> biar bisa dipakai walau sinyal hilang.</p>`;
}

/* =====================================================================
   SPG — LOGIN, EVENT, CHECK-IN
   ===================================================================== */
async function goSpgLogin() {
  if (SESS) { view = 'spgEvents'; render(); refreshMyEvents(); return }
  view = 'spgLogin'; lg.spg = null; lg.pin = ''; render();
  if (!sb) return;
  const { data, error } = await sb.rpc('spg_members');
  if (!error && Array.isArray(data)) { MEMBERS = data; LS.set('dg_members', data); if (view === 'spgLogin') render() }
}
function vSpgLogin() {
  let h = `<div class="hero">${mascot(64)}<div><h1 style="font-size:30px">DGTLN<br><span class="hl">POS</span></h1><p class="mut sm" style="margin-top:4px">Kasir SPG event</p></div></div><h2 style="margin-top:22px">Halo! Siapa kamu? 👋</h2>`;
  h += MEMBERS.length ? `<div class="chips" style="margin-top:14px">${MEMBERS.map(m => chip(m.emoji + ' ' + esc(m.name), lg.spg === m.id, `lg.spg='${m.id}';render()`)).join('')}</div>`
    : `<p class="mut sm" style="margin-top:12px">${navigator.onLine ? 'Memuat daftar tim… (minta admin daftarkan kamu kalau nama belum ada)' : 'Butuh sinyal untuk login pertama kali.'}</p>`;
  if (lg.spg) h += `<h3 class="sec">PIN kamu</h3><input id="pin" type="tel" inputmode="numeric" maxlength="4" value="${esc(lg.pin)}" oninput="lg.pin=this.value.replace(/\\D/g,'').slice(0,4);this.value=lg.pin" placeholder="4 digit" style="letter-spacing:.5em;text-align:center;font-size:22px;font-family:Outfit,sans-serif">
    <div style="margin-top:14px"><button class="btn block primary" onclick="spgLogin()">Masuk →</button></div>`;
  h += `<p class="note" style="margin-top:28px">💡 Buka menu browser → <b>Tambahkan ke Layar Utama</b> biar app tetap jalan walau sinyal hilang.</p>`;
  return h;
}
async function spgLogin() {
  if (!/^\d{4}$/.test(lg.pin)) return toast('PIN 4 digit');
  if (!sb) return toast('Ga ada koneksi internet');
  const { data, error } = await sb.rpc('spg_login', { p_member: lg.spg, p_pin: lg.pin });
  if (error) return toast(errMsg(error));
  SESS = data; LS.set('dg_sess', SESS); NET.sessErr = false;
  view = 'spgEvents'; render(); toast('Halo ' + SESS.member.name + '! 👋'); syncNow();
}
async function refreshMyEvents() {
  if (!sb || !SESS || !navigator.onLine) return;
  const { data, error } = await sb.rpc('spg_events', { p_token: SESS.token });
  if (error) { if (/SESSION_INVALID/.test(error.message)) { NET.sessErr = true; render() } return }
  SESS.events = data; LS.set('dg_sess', SESS); if (view === 'spgEvents') render();
}
function myPending(memberId) { return Q.trx.filter(t => t.spgId === memberId).length + Q.calls.filter(c => c.spgId === memberId).length }
function vSpgEvents() {
  const m = SESS.member, evs = SESS.events || [], pend = myPending(m.id);
  let h = `<div class="top"><div class="ava">${m.emoji}</div><div style="flex:1;min-width:0"><b>Hai, ${esc(m.name)}!</b><div class="mut sm">${m.role}</div></div><button class="btn sm" onclick="spgLogoutAsk()">Ganti akun</button></div>`;
  if (NET.sessErr) h += `<div class="brief" style="border-color:var(--pink);background:rgba(255,79,110,.12);margin:0 0 12px">🔒 Sesi kamu berakhir (PIN direset admin). Tap <b>Ganti akun</b> lalu login ulang${pend ? ` — <b>${pend}</b> data kamu tetap aman di HP` : ''}.</div>`;
  else if (pend) h += `<div class="brief" style="margin:0 0 12px">⏳ ${pend} data kamu masih di HP, dikirim otomatis saat ada sinyal.</div>`;
  h += `<h3 class="sec" style="margin-top:6px">Event kamu hari ini <button class="btn sm" onclick="refreshMyEvents();toast('Memuat ulang…')">↻</button></h3>`;
  h += evs.length ? evs.map(e => `<div class="card evcard"><b>${esc(e.name)}</b><div class="sm mut" style="margin-top:3px">📍 ${esc(e.loc)}${e.city ? ', ' + esc(e.city) : ''}</div><div class="sm mut">📅 ${range(e)} · 🕘 ${e.open}–${e.close}</div><div style="margin-top:12px"><button class="btn block primary" onclick="checkin('${e.id}')">📍 Check-in & mulai jualan</button></div></div>`).join('')
    : `<div class="card" style="text-align:center;padding:22px"><div style="font-size:30px">😴</div><b>Belum ada event buat kamu hari ini</b><div class="sm mut" style="margin-top:4px">Minta admin assign kamu ke event yang lagi jalan.</div></div>`;
  return h;
}
function spgLogoutAsk() {
  const pend = myPending(SESS.member.id);
  confirmSheet('Ganti akun?', pend ? `Masih ada <b>${pend}</b> data kamu yang belum terkirim. Data tetap aman di HP & terkirim begitu kamu login lagi di HP ini.` : 'Kamu akan keluar dari akun ini.', 'Keluar', 'spgLogout()');
}
function spgLogout() { SESS = null; CK = null; B = null; LS.del('dg_sess'); LS.del('dg_ck'); MODE = 'none'; closeSheet(); goSpgLogin() }
async function checkin(eventId) {
  let boot = null;
  if (sb && navigator.onLine) {
    toast('Menyiapkan booth…');
    const { data, error } = await sb.rpc('spg_bootstrap', { p_token: SESS.token, p_event: eventId });
    if (error) { if (/SESSION_INVALID/.test(error.message)) { NET.sessErr = true; render() } else if (!/fetch|network/i.test(error.message)) return toast(errMsg(error)) }
    else { boot = data; LS.set(bootKey(eventId), boot) }
  }
  if (!boot) boot = LS.get(bootKey(eventId), null);
  if (!boot) return toast('Butuh sinyal buat check-in pertama di event ini');
  B = boot; CK = { eventId, checkin: Date.now() }; LS.set('dg_ck', CK);
  enterSpg(); toast('Check-in berhasil, semangat! 💪'); syncNow();
}
function enterSpg() {
  MODE = 'spg'; buildSpgState(); view = 'spg'; render();
}
function buildSpgState() {
  const me = SESS.member.id, ev = Object.assign({ active: true, areas: [], stock: {} }, B.event);
  ev.stock = ev.stock || {};
  const team = (B.team || []).slice(); if (!team.find(t => t.id === me)) team.push(SESS.member);
  S = {
    brand: B.settings.brand, target: B.settings.target || 50, oldBrands: B.settings.oldBrands || [],
    products: B.products || [], events: [ev], spgs: team,
    trx: [...(B.myTrx || []).map(t => ({ ...t, synced: true })), ...Q.trx.filter(t => t.eventId === ev.id && t.spgId === me)],
    calls: [...(B.myCalls || []).map(c => ({ ...c, synced: true })), ...Q.calls.filter(c => c.eventId === ev.id && c.spgId === me)],
    session: { role: 'spg', spgId: me, eventId: ev.id, checkin: CK.checkin }, users: []
  };
}
async function refreshBoot() {
  if (!sb || !navigator.onLine || !CK || !SESS) return;
  const { data, error } = await sb.rpc('spg_bootstrap', { p_token: SESS.token, p_event: CK.eventId });
  if (error) { if (/SESSION_INVALID/.test(error.message)) { NET.sessErr = true; if (view === 'spg') render() } return }
  B = data; LS.set(bootKey(CK.eventId), B); buildSpgState(); if (view === 'spg') render();
}

/* ---------- sinkronisasi ---------- */
const isOnline = () => navigator.onLine !== false && !NET.fail;
const pending = () => MODE === 'spg' && SESS ? myPending(SESS.member.id) : 0;
async function syncNow() {
  if (NET.busy) { NET.again = true; return }
  if (!sb || !SESS || NET.sessErr) return;
  if (navigator.onLine === false) { NET.fail = true; return updateNet() }
  const me = SESS.member.id, tq = Q.trx.filter(t => t.spgId === me), cq2 = Q.calls.filter(c => c.spgId === me);
  NET.busy = true; updateNet();
  try {
    const strip = o => { const r = { ...o }; delete r.synced; delete r.spgId; return r };
    const { data, error } = await sb.rpc('spg_sync', { p_token: SESS.token, p_event: CK ? CK.eventId : null, p_trx: tq.map(strip), p_calls: cq2.map(strip) });
    if (error) throw error;
    const tid = new Set(tq.map(t => t.id)), cid = new Set(cq2.map(c => c.id));
    Q.trx = Q.trx.filter(t => !tid.has(t.id)); Q.calls = Q.calls.filter(c => !cid.has(c.id)); saveQ();
    if (B && CK) {
      B.myTrx = (B.myTrx || []).concat(tq.filter(t => t.eventId === CK.eventId).map(strip).map(t => ({ ...t, spgId: me })));
      B.myCalls = (B.myCalls || []).concat(cq2.filter(c => c.eventId === CK.eventId).map(strip).map(c => ({ ...c, spgId: me })));
      if (data.sold) B.sold = data.sold;
      if (data.stock && Object.keys(data.stock).length) B.event.stock = data.stock;
      LS.set(bootKey(CK.eventId), B);
    }
    NET.fail = false; NET.last = Date.now();
    const n = tq.length + cq2.length; if (n) toast(`☁️ ${n} data terkirim ke server`);
  } catch (e) {
    if (/SESSION_INVALID/.test(String(e.message || e))) NET.sessErr = true; else NET.fail = true;
  } finally {
    NET.busy = false;
    if (MODE === 'spg' && B) buildSpgState();
    if (NET.again) { NET.again = false; if (!NET.fail && !NET.sessErr) setTimeout(syncNow, 50) }
    if ((view === 'spg' || view === 'spgEvents')) render();
  }
}
function updateNet() { const el = document.getElementById('netpill'); if (el) el.outerHTML = netPill() }
function netPill() {
  const n = pending(), on = isOnline();
  let label = NET.sessErr ? `Sesi berakhir · ${n} data aman di HP` : NET.busy ? (n ? `Mengirim ${n} data…` : 'Menyinkronkan…') : on ? (n ? `${n} data menunggu dikirim` : 'Online · semua data terkirim') : `Offline · ${n} data aman di HP`;
  return `<button id="netpill" class="net ${on && !NET.sessErr ? '' : 'off'}" onclick="netSheet()"><i></i>${label}<span>info ›</span></button>`;
}
function netSheet() {
  const on = isOnline(), n = pending();
  openSheet(`<div class="shd"><h2>${NET.sessErr ? '🔒 Sesi berakhir' : on ? '🟢 Online' : '📴 Offline'}</h2><button class="x" onclick="closeSheet()">✕</button></div>
  <p class="mut">${NET.sessErr ? 'PIN kamu direset admin. Check-out → Ganti akun → login ulang. Data tetap aman di HP.' : on ? (n ? `${n} data siap dikirim.` : 'Semua transaksi & call udah terkirim.') : `Sinyal hilang. <b style="color:var(--txt)">${n}</b> data tersimpan aman di HP dan nunggu sinyal.`}</p>
  <div class="card" style="margin-top:14px"><div class="pts">
    <div><b>💾</b><span>Setiap transaksi & call disimpan dulu di HP. Kasir tetap jalan walau sinyal hilang.</span></div>
    <div><b>☁️</b><span>Begitu ada sinyal, data terkirim sendiri. Ga ada yang dobel karena tiap data punya ID unik.</span></div>
    <div><b>🧾</b><span>Nomor struk pakai kode SPG, jadi ga bentrok antar HP walau semua offline.</span></div>
    <div><b>📱</b><span>Kalau HP offline, cek bukti bayar QRIS di layar HP konsumen.</span></div>
  </div></div>
  ${NET.last ? `<p class="note">Terakhir tersinkron: ${hm(NET.last)}</p>` : ''}
  <div class="sticky"><div class="grid2"><button class="btn block" onclick="closeSheet()">Tutup</button><button class="btn block primary" onclick="NET.fail=false;closeSheet();syncNow()">↻ Kirim sekarang</button></div></div>`, true);
}

/* =====================================================================
   SPG — LAYAR UTAMA, KASIR
   ===================================================================== */
function rowTrx(t, showSpg) {
  const it = t.items.map(i => i.qty + 'x ' + itemName(i)).join(', '), sp = getSpg(t.spgId);
  return `<div class="row" onclick="showStruk('${t.id}')"><div style="min-width:0"><b>${t.no}</b><div class="sm mut">${hm(t.t)}${showSpg ? ' · ' + esc(sp ? sp.name : '-') : ''} · ${esc(it)}</div></div><div class="r"><b>${rp(t.total)}</b><span class="tag ${t.pay}">${t.pay}</span>${t.synced === false ? '<span class="tag">⏳ belum sync</span>' : ''}</div></div>`;
}
function vSpg() {
  const { spgId, eventId, checkin } = S.session, sp = getSpg(spgId), ev = getEv(eventId);
  const st = stats(x => x.eventId === eventId && x.spgId === spgId);
  let h = `<div class="top"><div class="ava">${sp.emoji}</div><div style="flex:1;min-width:0;cursor:pointer" onclick="evInfo()"><b>Hai, ${esc(sp.name)}!</b><div class="mut sm">${esc(ev.name)} · masuk ${hm(checkin)} · <u>info event</u></div></div><button class="btn sm" onclick="closeShift()">Tutup shift</button></div>`;
  h += netPill();
  h += `<div class="card callc"><div class="lbl">Call hari ini</div><div class="num xl">${st.call}</div><div class="bar"><i style="width:${Math.min(100, st.call / S.target * 100)}%"></i></div><div class="sm"><b>${Math.max(0, S.target - st.call)}</b> lagi ke target ${S.target} call</div></div>`;
  h += `<div class="grid3"><div class="card mini" data-tone="lav"><div class="lbl">Effective</div><div class="num">${st.ec}</div></div><div class="card mini"><div class="lbl">Terjual</div><div class="num">${st.so}<small> item</small></div></div><div class="card mini" data-tone="pink"><div class="lbl">Omzet</div><div class="num md" style="margin-top:4px">${rpk(st.omzet)}</div></div></div>`;
  h += `<div class="grid2 act"><button class="btn bigbtn" onclick="openCall()"><span class="em">🙋</span>+1 Call<small>ditawari, ga beli</small></button><button class="btn bigbtn" data-tone="pink" onclick="openKasir()"><span class="em">🛒</span>Kasir<small>ada yang beli</small></button></div>`;
  h += `<h3 class="sec">Katalog & stok booth <span class="sm mut" style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:500">tap buat detail</span></h3><div class="stk">${S.products.filter(p => p.active).map(p => { const l = leftP(eventId, p); return `<div class="card stki ${l < 10 ? 'low' : ''}" onclick="showProd('${p.id}')">${thumb(p, 40)}<div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="sm mut">sisa <b>${l}</b> ${esc(p.unit)}</div></div></div>` }).join('') || '<p class="mut sm">Belum ada produk.</p>'}</div>`;
  const rec = st.trx.slice().sort((a, b) => b.t - a.t).slice(0, 5);
  h += `<h3 class="sec">Transaksi terakhir</h3>` + (rec.length ? `<div class="card list">${rec.map(t => rowTrx(t)).join('')}</div>` : `<p class="mut sm">Belum ada transaksi. Gas! 🚀</p>`);
  return h;
}
function evInfo() {
  const e = getEv(S.session.eventId), stg = evStatus(e);
  openSheet(`<div class="shd"><h2 style="min-width:0">${esc(e.name)}</h2><button class="x" onclick="closeSheet()">✕</button></div>
  <span class="tag ${stCls(stg)}">${stg}</span>
  <div class="card" style="padding:6px 14px;margin-top:12px">
  <div class="kv" style="border-top:0"><span>📍 Lokasi</span><b>${esc(e.loc)}${e.city ? ', ' + esc(e.city) : ''}</b></div><div class="kv"><span>📅 Tanggal</span><b>${range(e)}</b></div>
  <div class="kv"><span>🕘 Jam</span><b>${e.open} – ${e.close}</b></div>
  <div class="kv"><span>👯 Tim</span><b>${S.spgs.map(s => s.emoji + ' ' + esc(s.name)).join(', ')}</b></div></div>
  ${e.brief ? `<div class="brief"><b>📝 Brief</b><br>${esc(e.brief).replace(/\n/g, '<br>')}</div>` : ''}
  <div class="sticky"><button class="btn block" onclick="closeSheet()">Tutup</button></div>`, true);
}
function showProd(pid, fromKasir) {
  const p = getP(pid), ev = S.session && S.session.eventId;
  let h = `<div class="shd"><h2 style="min-width:0">${esc(p.name)}</h2><button class="x" onclick="${fromKasir ? 'rKasir()' : 'closeSheet()'}">${fromKasir ? '←' : '✕'}</button></div>`;
  h += `<div class="hero-img" style="background:${p.c}">${p.img ? `<img src="${p.img}" alt="">` : p.emo}</div>`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span class="tag ${p.cat}">${p.cat}</span>${p.age18 ? '<span class="tag">18+</span>' : ''}${p.maxPer ? `<span class="tag">maks ${p.maxPer}/konsumen</span>` : ''}</div>`;
  h += `<div class="num" style="margin-bottom:8px">${price(p)} <small class="mut">/ ${esc(p.unit)}</small></div>`;
  if (p.desc) h += `<p style="line-height:1.55;margin-bottom:12px">${esc(p.desc)}</p>`;
  if (ev) h += `<div class="card" style="padding:6px 14px">${skus(p).map((s, i) => `<div class="kv" ${i ? '' : 'style="border-top:0"'}><span>${s.v ? 'Varian ' + esc(s.v) : 'Stok booth'}</span><b>${left(ev, s.sku)} ${esc(p.unit)}</b></div>`).join('')}</div>`;
  h += `<div class="sticky"><button class="btn block ${fromKasir ? 'primary' : ''}" onclick="${fromKasir ? 'rKasir()' : 'closeSheet()'}">${fromKasir ? '← Kembali ke kasir' : 'Tutup'}</button></div>`;
  openSheet(h, true);
}
function openCall() {
  openSheet(`<div class="shd"><h2>🙋 Catat call</h2><button class="x" onclick="closeSheet()">✕</button></div>
  <p class="mut">Konsumen udah ditawari tapi belum beli. Sempet coba sample?</p>
  <div class="grid2 pb" style="margin-top:16px"><button class="btn bigbtn" data-tone="lime" onclick="addCall(true)"><span class="em">👍</span>Ya, trial</button><button class="btn bigbtn" onclick="addCall(false)"><span class="em">🙅</span>Ga trial</button></div>`, true);
}
function addCall(tr) {
  const c = { id: uuid(), t: Date.now(), eventId: S.session.eventId, spgId: S.session.spgId, trial: tr, synced: false };
  Q.calls.push(c); saveQ(); S.calls.push(c); closeSheet(); render(); toast('+1 call tercatat 👌'); syncNow();
}
let K;
const cartItems = () => Object.entries(K.cart).filter(([, q]) => q > 0);
const cartQty = () => cartItems().reduce((a, [, q]) => a + q, 0);
const cartTotal = () => cartItems().reduce((a, [sku, q]) => a + q * getP(skuP(sku)).price, 0);
const needAge = () => cartItems().some(([sku]) => getP(skuP(sku)).age18);
function areaOpts() { const ev = getEv(S.session.eventId); return ev.areas && ev.areas.length ? [...ev.areas, 'Luar kota'] : [] }
function openKasir() { K = { cart: {}, cat: 'Semua', age: '', old: '', kec: '', hp: '', trial: null, pay: 'Tunai', cash: '', qrOk: false }; document.getElementById('sin').scrollTop = 0; rKasir() }
function cq(sku, d) {
  const p = getP(skuP(sku)), q = K.cart[sku] || 0;
  if (d > 0) {
    const pq = cartItems().filter(([s]) => skuP(s) === p.id).reduce((a, [, x]) => a + x, 0);
    if (p.maxPer && pq >= p.maxPer) return toast(`${p.name}: maks ${p.maxPer} per konsumen ✋`);
    if (left(S.session.eventId, sku) <= q) return toast('Stok habis');
  }
  K.cart[sku] = Math.max(0, q + d); rKasir();
}
const stp = (sku, q) => `<div class="stp"><button onclick="cq('${sku}',-1)">−</button><b>${q}</b><button onclick="cq('${sku}',1)">+</button></div>`;
function prodCard(p) {
  const ev = S.session.eventId, ks = skus(p), one = !p.variants.length;
  let h = `<div class="card prod"><div class="ph"><div onclick="showProd('${p.id}',true)" style="cursor:pointer">${thumb(p, 46)}</div><div style="flex:1;min-width:0" onclick="showProd('${p.id}',true)"><b>${esc(p.name)}</b><div class="sm mut">${price(p)}${one ? ' · sisa ' + left(ev, ks[0].sku) : ''}${p.maxPer ? ' · maks ' + p.maxPer : ''}${p.age18 ? ' · 18+' : ''}</div></div>${one ? stp(ks[0].sku, K.cart[ks[0].sku] || 0) : ''}</div>`;
  if (!one) h += ks.map(s => `<div class="vr"><span><b>${esc(s.v)}</b><em>sisa ${left(ev, s.sku)}</em></span>${stp(s.sku, K.cart[s.sku] || 0)}</div>`).join('');
  return h + '</div>';
}
function upd() {
  const total = cartTotal(), el = document.getElementById('kemb'); if (!el) return;
  const c = +K.cash || 0, box = el.parentElement;
  if (!K.cash) { el.textContent = '—'; box.classList.remove('neg'); return }
  if (c < total) { el.textContent = 'Kurang ' + rp(total - c); box.classList.add('neg') } else { el.textContent = rp(c - total); box.classList.remove('neg') }
}
function rKasir() {
  const qty = cartQty(), total = cartTotal(), age18 = needAge(), ev = getEv(S.session.eventId), ao = areaOpts();
  const list = S.products.filter(p => p.active && (K.cat === 'Semua' || p.cat === K.cat));
  let h = `<div class="shd"><h2>🛒 Kasir</h2><button class="x" onclick="closeSheet()">✕</button></div>`;
  h += `<div class="step"><span>1</span>Pilih item</div><div class="chips scroll" style="margin-bottom:12px">${['Semua', ...CATS].map(c => chip(c, K.cat === c, `K.cat='${c}';rKasir()`)).join('')}</div>`;
  h += list.length ? list.map(prodCard).join('') : '<p class="mut sm">Belum ada item di kategori ini.</p>';
  h += `<div class="step"><span>2</span>Data konsumen</div><div class="card form">
    <label>Umur <b class="req">*</b>${age18 ? ' <span class="tag" style="margin-left:4px">ada item 18+</span>' : ''}</label><input type="number" inputmode="numeric" value="${esc(K.age)}" oninput="K.age=this.value" placeholder="${age18 ? 'min. 18 tahun' : 'umur konsumen'}">
    <label>Domisili${ev.city ? ' <span class="opt">(' + esc(ev.city) + ')</span>' : ''} <b class="req">*</b></label>${ao.length ? `<div class="chips">${ao.map((k, i) => chip(esc(k), K.kec === k, `K.kec=areaOpts()[${i}];rKasir()`)).join('')}</div>` : `<input type="text" value="${esc(K.kec)}" oninput="K.kec=this.value" placeholder="kecamatan / kota">`}
    ${S.oldBrands.length ? `<label>Brand sebelumnya <span class="opt">(opsional)</span></label><div class="chips">${S.oldBrands.map((k, i) => chip(esc(k), K.old === k, `K.old=K.old===S.oldBrands[${i}]?'':S.oldBrands[${i}];rKasir()`)).join('')}</div>` : ''}
    <label>Coba sample (trial)? <span class="opt">(opsional)</span></label><div class="seg"><button class="${K.trial === true ? 'on' : ''}" onclick="K.trial=K.trial===true?null:true;rKasir()">👍 Ya</button><button class="${K.trial === false ? 'on' : ''}" onclick="K.trial=K.trial===false?null:false;rKasir()">🙅 Tidak</button></div>
    <label>No. HP <span class="opt">(opsional)</span></label><input type="tel" inputmode="tel" value="${esc(K.hp)}" oninput="K.hp=this.value" placeholder="08xx">
  </div>`;
  if (total > 0) {
    h += `<div class="step"><span>3</span>Pembayaran</div><div class="seg" style="margin-bottom:12px"><button class="${K.pay === 'Tunai' ? 'on' : ''}" onclick="K.pay='Tunai';rKasir()">💵 Tunai</button><button class="${K.pay === 'QRIS' ? 'on' : ''}" onclick="K.pay='QRIS';rKasir()">📱 QRIS</button></div>`;
    if (K.pay === 'Tunai') {
      h += `<div class="card form"><label>Uang diterima</label><input type="number" inputmode="numeric" value="${esc(K.cash)}" oninput="K.cash=this.value;upd()" placeholder="kosong = uang pas">
      <div class="chips" style="margin-top:10px">${chip('Uang pas', false, `K.cash=String(cartTotal());rKasir()`)}${chip('50.000', false, `K.cash='50000';rKasir()`)}${chip('100.000', false, `K.cash='100000';rKasir()`)}</div>
      <div class="kemb"><span>Kembalian</span><b id="kemb">—</b></div></div>`;
    } else {
      h += `<div class="card qr"><div style="font-size:54px;margin:6px 0">📱</div><div class="sm mut">Minta konsumen scan QRIS booth, total</div><div class="num">${rp(total)}</div><label class="chk"><input type="checkbox" ${K.qrOk ? 'checked' : ''} onchange="K.qrOk=this.checked">Pembayaran sudah masuk</label></div>`;
    }
  } else if (qty > 0) h += `<p class="note" style="margin-top:14px">Isinya item gratis/gimmick aja — ga perlu bayar, tetap tercatat & stok berkurang.</p>`;
  h += `<div class="sticky"><div class="tot"><span class="mut">${qty} item</span><b>${rp(total)}</b></div><button class="btn block primary" onclick="saveKasir()">Simpan transaksi ✓</button></div>`;
  openSheet(h); upd();
}
function nextNo() {
  const ev = getEv(S.session.eventId), me = S.session.spgId;
  let mx = 0; S.trx.forEach(t => { if (t.eventId === ev.id && t.spgId === me) { const m = /-(\d+)$/.exec(t.no); if (m) mx = Math.max(mx, +m[1]) } });
  return ev.code + '-' + spgCode(getSpg(me)) + '-' + String(mx + 1).padStart(3, '0');
}
function saveKasir() {
  const total = cartTotal(), age = +K.age;
  if (!cartQty()) return toast('Pilih item dulu');
  if (!age) return toast('Umur konsumen wajib diisi');
  if (needAge() && age < 18) return toast('Ada item 18+ — konsumen di bawah 18 tidak boleh 🚫');
  if (!K.kec.trim()) return toast('Isi domisili konsumen');
  let cash = total, pay = total > 0 ? K.pay : 'Gratis';
  if (total > 0) {
    if (K.pay === 'Tunai') { if (K.cash) { cash = +K.cash; if (cash < total) return toast('Uang diterima kurang') } }
    else if (!K.qrOk) return toast('Centang dulu kalau QRIS sudah masuk');
  }
  const items = cartItems().map(([sku, q]) => { const p = getP(skuP(sku)); return { sku, pid: p.id, v: sku.split('|')[1] || '', name: p.name, qty: q, price: p.price } });
  const t = { id: uuid(), no: nextNo(), t: Date.now(), eventId: S.session.eventId, spgId: S.session.spgId, items, total, pay, cash, change: cash - total, cust: { age, old: K.old, kec: K.kec.trim(), hp: K.hp.trim(), trial: K.trial }, synced: false };
  Q.trx.push(t); if (!saveQ()) { Q.trx.pop(); return }
  S.trx.push(t); render(); showStruk(t.id, true); syncNow();
}
function showStruk(id, fresh) {
  const t = S.trx.find(x => x.id === id), ev = getEv(t.eventId), sp = getSpg(t.spgId), c = t.cust;
  openSheet(`<div class="shd"><h2>${fresh ? '✅ Tersimpan!' : '🧾 Struk'}</h2><button class="x" onclick="closeSheet()">✕</button></div>
  <div class="struk"><div class="c"><b>${esc(S.brand)} · ${esc(ev ? ev.name : '')}</b><br>${dt(t.t)}<br>No. ${t.no} · SPG ${esc(sp ? sp.name : '-')}</div><hr>
  ${t.items.map(i => `<div class="l"><span>${i.qty}x ${esc(itemName(i))}</span><span>${i.price ? rp(i.qty * i.price) : 'GRATIS'}</span></div>`).join('')}<hr>
  <div class="l b"><span>TOTAL</span><span>${rp(t.total)}</span></div><div class="l"><span>${t.pay}</span><span>${rp(t.cash)}</span></div>${t.pay === 'Tunai' ? `<div class="l"><span>Kembali</span><span>${rp(t.change)}</span></div>` : ''}<hr>
  <div class="c sm" style="opacity:.6;margin-bottom:6px">powered by DGTLN POS</div><div class="c sm">Konsumen: ${c.age} th · ${esc(c.kec)}${c.old ? ' · ex ' + esc(c.old) : ''}${c.trial != null ? ' · trial ' + (c.trial ? 'ya' : 'tidak') : ''}</div></div>
  <div class="sticky">${fresh ? `<div class="grid2"><button class="btn block" onclick="closeSheet()">Selesai</button><button class="btn block primary" onclick="openKasir()">+ Baru</button></div>` : `<button class="btn block" onclick="closeSheet()">Tutup</button>`}</div>`, true);
}
function closeShift() {
  const { spgId, eventId, checkin } = S.session, st = stats(x => x.eventId === eventId && x.spgId === spgId), n = pending();
  openSheet(`<div class="shd"><h2>🏁 Tutup shift</h2><button class="x" onclick="closeSheet()">✕</button></div>
  <p class="mut sm">${esc(getEv(eventId).name)} · ${hm(checkin)} – ${hm(Date.now())}</p>
  <div class="card" style="margin-top:12px"><table class="tbl">
  <tr><td>Call</td><td>${st.call}</td></tr><tr><td>Effective call</td><td>${st.ec}</td></tr><tr><td>Item terjual</td><td>${st.so}</td></tr><tr><td>Gimmick keluar</td><td>${st.gim}</td></tr><tr><td>Trial</td><td>${st.trial}</td></tr>
  <tr><td>QRIS (langsung masuk)</td><td>${rp(st.qris)}</td></tr><tr><td><b>Uang tunai disetor</b></td><td><b style="font-size:17px">${rp(st.tunai)}</b></td></tr></table></div>
  ${n ? `<div class="brief" style="border-color:var(--pink);background:rgba(255,79,110,.12)">⚠️ Masih ada <b>${n}</b> data di HP yang belum terkirim. Data tetap aman, tapi sebaiknya cari sinyal dulu sebelum check-out.</div>` : ''}
  <p class="note">Serahkan uang tunai ke TL, cocokkan dengan angka di atas.</p>
  <div class="sticky"><button class="btn block primary" onclick="checkout()">Check-out</button></div>`, true);
}
function checkout() { CK = null; LS.del('dg_ck'); MODE = 'none'; S = emptyS(); closeSheet(); view = 'spgEvents'; render(); refreshMyEvents() }

/* =====================================================================
   ADMIN / BRAND
   ===================================================================== */
function vAdminLogin() {
  return `<div class="hero">${mascot(64)}<div><h1 style="font-size:30px">DGTLN<br><span class="hl">POS</span></h1><p class="mut sm" style="margin-top:4px">Dashboard admin & brand</p></div></div><h2 style="margin-top:22px">Masuk dashboard</h2>
  <div class="card form" style="margin-top:16px"><label>Email</label><input type="text" inputmode="email" autocomplete="username" value="${esc(lg.email)}" oninput="lg.email=this.value.trim()" placeholder="nama@email.com">
  <label>Password</label><input type="password" autocomplete="current-password" oninput="lg.pass=this.value" onkeydown="if(event.key==='Enter')adminLogin()"></div>
  <div style="margin-top:14px"><button class="btn block primary" onclick="adminLogin()">Masuk →</button></div>`;
}
async function adminLogin() {
  if (!sb) return toast('Ga ada koneksi');
  if (!lg.email || !lg.pass) return toast('Isi email & password');
  const { error } = await sb.auth.signInWithPassword({ email: lg.email, password: lg.pass });
  if (error) return toast(errMsg(error));
  lg.pass = ''; await enterAdmin();
}
async function enterAdmin() {
  view = 'loading'; render();
  const { data, error } = await sb.rpc('my_role');
  if (error) { toast(errMsg(error)); view = 'adminLogin'; return render() }
  if (!data) { view = 'noaccess'; return render() }
  ROLE = data; MODE = 'admin';
  try { const ss = await sb.auth.getSession(); S.me = ss.data && ss.data.session ? ss.data.session.user.email : '' } catch (e) { }
  try { await loadAll(); view = 'admin'; aTab = ROLE === 'admin' ? aTab : 'rekap' } catch (e) { toast(errMsg(e)); view = 'adminLogin' }
  render();
}
function vNoAccess() { return `<div class="card" style="margin-top:30vh;text-align:center"><div style="font-size:34px">🔒</div><b>Email ini belum diberi akses</b><p class="mut sm" style="margin-top:6px">Minta admin menambahkan email kamu di Pengaturan → Akses dashboard.</p><div style="margin-top:14px"><button class="btn block" onclick="adminLogout()">Keluar</button></div></div>` }
async function adminLogout() { try { await sb.auth.signOut() } catch (e) { } ROLE = null; MODE = 'none'; S = emptyS(); closeSheet(); view = 'adminLogin'; render() }

async function fetchAll(table, cols, orders) {
  let out = [], from = 0;
  for (; ;) {
    let q = sb.from(table).select(cols); orders.forEach(o => q = q.order(o)); q = q.range(from, from + 999);
    const { data, error } = await q; if (error) throw error;
    out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000;
  }
  return out;
}
const MCOLS = 'id,name,emoji,role,hp,note,active,created_at';
const pFromDb = r => ({ id: r.id, name: r.name, cat: r.cat, price: r.price, unit: r.unit, variants: r.variants || [], desc: r.descr, maxPer: r.max_per, age18: r.age18, active: r.active, emo: r.emo, c: r.color, img: r.img });
const eFromDb = (r, stock) => ({ id: r.id, code: r.code, name: r.name, loc: r.loc, city: r.city, areas: r.areas || [], start: String(r.start_date).slice(0, 10), end: String(r.end_date).slice(0, 10), open: r.open_time, close: r.close_time, radius: r.radius, brief: r.brief, active: r.active, spgIds: r.spg_ids || [], stock });
const tFromDb = r => ({ id: r.id, no: r.no, t: Date.parse(r.t), eventId: r.event_id, spgId: r.member_id, items: r.items, total: r.total, pay: r.pay, cash: r.cash, change: r.change, cust: r.cust || {}, synced: true });
const cFromDb = r => ({ id: r.id, t: Date.parse(r.t), eventId: r.event_id, spgId: r.member_id, trial: r.trial, synced: true });
async function loadCore() {
  const [st, mem, prod, evs, stock] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1), fetchAll('members', MCOLS, ['created_at', 'id']), fetchAll('products', '*', ['created_at', 'id']),
    fetchAll('events', '*', ['start_date', 'id']), fetchAll('stock', '*', ['event_id', 'sku'])]);
  if (st.error) throw st.error;
  const s = (st.data && st.data[0]) || {};
  S.brand = s.brand || 'Brand'; S.target = s.target || 50; S.oldBrands = s.old_brands || []; S.tz = s.tz || 'Asia/Jakarta';
  S.spgs = mem; S.products = prod.map(pFromDb);
  const sm = {}; stock.forEach(r => { (sm[r.event_id] = sm[r.event_id] || {})[r.sku] = r.qty });
  S.events = evs.map(r => eFromDb(r, sm[r.id] || {}));
  if (ROLE === 'admin') { const u = await sb.from('app_users').select('*').order('created_at'); S.users = u.data || [] }
}
async function loadTx() {
  const [trx, calls] = await Promise.all([fetchAll('trx', '*', ['t', 'id']), fetchAll('calls', '*', ['t', 'id'])]);
  S.trx = trx.map(tFromDb); S.calls = calls.map(cFromDb); S.loadedAt = Date.now();
}
async function loadAll() { await loadCore(); await loadTx() }
async function refreshAdmin(silent) {
  try { await loadAll(); if (!silent) toast('Data diperbarui ✅') } catch (e) { if (!silent) toast(errMsg(e)) }
  if (view === 'admin' && !(silent && sheetOpen())) render();
}
async function dbDo(promise, okMsg) {
  const { error } = await promise;
  if (error) { toast(errMsg(error)); return false }
  if (okMsg) toast(okMsg); return true;
}

function vAdmin() {
  const isA = ROLE === 'admin';
  let h = `<div class="top"><div class="ava" data-tone="lav">📊</div><div style="flex:1;min-width:0"><b>${isA ? 'Admin' : 'Dashboard'}</b><div class="sm mut">${esc(S.brand)} · update ${S.loadedAt ? hm(S.loadedAt) : '-'}</div></div><button class="btn sm" onclick="refreshAdmin()">↻</button>${isA ? `<button class="btn sm" ${aTab === 'atur' ? 'data-tone="lime"' : ''} onclick="aTab='atur';render()">⚙️</button>` : ''}<button class="btn sm" onclick="adminLogout()">Keluar</button></div>`;
  if (isA) h += `<div class="tabs">${[['rekap', '📈', 'Rekap'], ['event', '📍', 'Event'], ['tim', '👯', 'Tim'], ['produk', '🏷️', 'Produk'], ['stok', '📦', 'Stok']].map(([k, ic, l]) => `<button class="${aTab === k ? 'on' : ''}" onclick="aTab='${k}';render()"><i>${ic}</i>${l}</button>`).join('')}</div>`;
  if (aTab === 'atur' && isA) h += `<h3 class="sec" style="margin-top:0">⚙️ Pengaturan</h3>`;
  const tab = isA ? aTab : 'rekap';
  return h + ({ rekap: tRekap, event: tEvent, tim: tTim, produk: tProduk, stok: tStok, atur: tAtur }[tab])();
}
function bars(obj, color) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 12); const m = Math.max(1, ...e.map(x => x[1]));
  return e.length ? e.map(([k, v]) => `<div class="hb"><div class="t"><span>${esc(k)}</span><span>${v}</span></div><div class="tr"><i style="width:${v / m * 100}%;background:${color}"></i></div></div>`).join('') : '<p class="mut sm">Belum ada data.</p>';
}
function tRekap() {
  const f = x => adminEv === 'all' || x.eventId === adminEv, st = stats(f), pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  let h = `<div class="chips scroll" style="margin-bottom:14px">${chip('Semua event', adminEv === 'all', "adminEv='all';render()")}${S.events.map(e => chip(esc(e.name), adminEv === e.id, `adminEv='${e.id}';render()`)).join('')}</div>`;
  h += `<div class="card callc"><div class="lbl">Total call</div><div class="num xl">${st.call}</div><div class="sm" style="margin-top:6px"><b>${st.ec}</b> effective call · konversi <b>${pct(st.ec, st.call)}%</b> · trial <b>${pct(st.trial, st.call)}%</b></div></div>`;
  h += `<div class="grid2" style="margin-top:12px">
    <div class="card mini" data-tone="lav"><div class="lbl">Item terjual</div><div class="num">${st.so}<small> · ${st.gim} gimmick</small></div></div>
    <div class="card mini" data-tone="pink"><div class="lbl">Omzet</div><div class="num md" style="margin-top:4px">${rp(st.omzet)}</div></div>
    <div class="card mini"><div class="lbl">💵 Tunai</div><div class="num md" style="margin-top:4px">${rp(st.tunai)}</div></div>
    <div class="card mini"><div class="lbl">📱 QRIS</div><div class="num md" style="margin-top:4px">${rp(st.qris)}</div></div></div>`;
  const rows = S.spgs.map(s => ({ s, x: stats(y => f(y) && y.spgId === s.id) })).filter(r => r.x.call > 0).sort((a, b) => b.x.call - a.x.call), med = ['🥇', '🥈', '🥉'];
  h += `<h3 class="sec">Per SPG</h3><div class="card">${rows.length ? `<table class="tbl"><tr><th>SPG</th><th>Call</th><th>EC</th><th>Item</th><th>Setor</th></tr>${rows.map((r, i) => `<tr><td>${med[i] || ''} ${r.s.emoji} ${esc(r.s.name)}</td><td>${r.x.call}</td><td>${r.x.ec}</td><td>${r.x.so}</td><td>${rpk(r.x.tunai)}</td></tr>`).join('')}</table>` : '<p class="mut sm">Belum ada aktivitas.</p>'}</div>`;
  const evs = adminEv === 'all' ? S.events : [getEv(adminEv)];
  CATS.forEach(cat => {
    const ps = S.products.filter(p => p.cat === cat); if (!ps.length) return;
    h += `<h3 class="sec">${cat}</h3><div class="card"><table class="tbl"><tr><th>Item</th><th>Keluar</th><th>Sisa</th><th>Omzet</th></tr>${ps.map(p => {
      const ks = skus(p), so = ks.reduce((a, s) => a + evs.reduce((x, e) => x + sold(e.id, s.sku), 0), 0), l = ks.reduce((a, s) => a + evs.reduce((x, e) => x + left(e.id, s.sku), 0), 0);
      const vd = p.variants.length ? '<small>' + ks.map(s => esc(s.v) + ' ' + evs.reduce((x, e) => x + sold(e.id, s.sku), 0)).join(' · ') + '</small>' : '';
      return `<tr><td>${esc(p.name)}${vd}</td><td>${so}</td><td style="${l < 10 ? 'color:#FF8FA3' : ''}">${l}</td><td>${p.price ? rpk(so * p.price) : '—'}</td></tr>`
    }).join('')}</table></div>`;
  });
  const kec = {}, old = {}; st.trx.forEach(t => { if (t.cust.kec) kec[t.cust.kec] = (kec[t.cust.kec] || 0) + 1; if (t.cust.old) old[t.cust.old] = (old[t.cust.old] || 0) + 1 });
  h += `<h3 class="sec">Pembeli per domisili</h3><div class="card">${bars(kec, 'var(--blue)')}</div>`;
  h += `<h3 class="sec">Brand sebelumnya</h3><div class="card">${bars(old, 'var(--pink)')}</div>`;
  const rec = st.trx.slice().sort((a, b) => b.t - a.t).slice(0, 15);
  h += `<h3 class="sec">Transaksi terbaru</h3>` + (rec.length ? `<div class="card list">${rec.map(t => rowTrx(t, true)).join('')}</div>` : '<p class="mut sm">Belum ada.</p>');
  h += `<div style="margin-top:20px"><button class="btn block primary" onclick="exportXlsx()">📊 Export Excel (.xlsx)</button></div><p class="note">7 sheet siap pakai: Ringkasan, Per Event, Transaksi, Konsumen, Per SPG, Produk & Stok, Log Call. Ikut filter event di atas.<br>Data dari HP SPG yang lagi offline masuk otomatis begitu mereka dapat sinyal.</p>`;
  return h;
}
/* ---------- event ---------- */
function tEvent() {
  let h = `<button class="btn block primary" onclick="editE()">＋ Buat event</button>`;
  ['Berlangsung', 'Akan datang', 'Selesai', 'Nonaktif'].forEach(g => {
    const es = S.events.filter(e => evStatus(e) === g).sort((a, b) => a.start < b.start ? -1 : 1); if (!es.length) return;
    h += `<h3 class="sec">${g} <span class="sm mut">${es.length} event</span></h3>` + es.map(evCard).join('');
  });
  if (!S.events.length) h += `<p class="note">Belum ada event. Buat event pertama kamu ☝️</p>`;
  return h;
}
function evCard(e) {
  const st = stats(x => x.eventId === e.id), stg = evStatus(e);
  return `<div class="card evcard"><div onclick="editE('${e.id}')" style="cursor:pointer"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="min-width:0"><b>${esc(e.name)}</b> <span class="sm mut">#${esc(e.code)}</span><div class="sm mut" style="margin-top:3px">📍 ${esc(e.loc)}${e.city ? ', ' + esc(e.city) : ''}</div><div class="sm mut">📅 ${range(e)} · 🕘 ${e.open}–${e.close}</div></div><span class="tag ${stCls(stg)}">${stg}</span></div>
  <div class="evm"><span>${e.spgIds.map(id => getSpg(id) ? getSpg(id).emoji : '').join(' ') || '<span class="sm mut">belum ada SPG</span>'}</span><span class="sm"><b>${st.call}</b> call · <b>${rpk(st.omzet)}</b></span></div></div>
  <div class="grid2" style="margin-top:10px"><button class="btn sm" onclick="editE('${e.id}')">✏️ Edit</button><button class="btn sm" onclick="stokEv='${e.id}';aTab='stok';render()">📦 Stok</button></div></div>`;
}
let EE;
const autoCode = n => n.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'EV';
function editE(id) {
  const e = id ? getEv(id) : null, t = ymd(new Date());
  EE = e ? { ...e, spgIds: [...e.spgIds], radius: String(e.radius), codeTouched: true, areasTxt: (e.areas || []).join('\n') }
    : { id: null, name: '', code: '', codeTouched: false, loc: '', city: '', areasTxt: '', start: t, end: t, open: '09:00', close: '21:00', radius: '100', spgIds: [], brief: '', active: true, copyFrom: '' };
  rEvent(true);
}
function togSpg(id) { const i = EE.spgIds.indexOf(id); i < 0 ? EE.spgIds.push(id) : EE.spgIds.splice(i, 1); rEvent() }
function rEvent(top) {
  const used = EE.id && (S.trx.some(t => t.eventId === EE.id) || S.calls.some(c => c.eventId === EE.id));
  let h = `<div class="shd"><h2>${EE.id ? 'Edit event' : 'Event baru'}</h2><button class="x" onclick="closeSheet()">✕</button></div><div class="card form">
  <label>Nama event <b class="req">*</b></label><input type="text" value="${esc(EE.name)}" oninput="EE.name=this.value;if(!EE.codeTouched){EE.code=autoCode(this.value);document.getElementById('ecode').value=EE.code}" placeholder="mis. Bandung Expo">
  <label>Kode event</label><input id="ecode" type="text" value="${esc(EE.code)}" oninput="EE.code=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);this.value=EE.code;EE.codeTouched=true" placeholder="otomatis dari nama"><div class="hint">Jadi awalan nomor transaksi, mis. BDX-RIN-001${used ? '. Ganti kode tidak mengubah nomor transaksi lama.' : ''}</div>
  <label>Lokasi / alamat <b class="req">*</b></label><input type="text" value="${esc(EE.loc)}" oninput="EE.loc=this.value" placeholder="mis. Trans Convention Centre">
  <label>Kota</label><input type="text" value="${esc(EE.city || '')}" oninput="EE.city=this.value" placeholder="mis. Bandung">
  <label>Pilihan domisili konsumen <span class="opt">(kecamatan/area)</span></label><textarea rows="4" oninput="EE.areasTxt=this.value" placeholder="Satu per baris, mis.&#10;Coblong&#10;Sukajadi&#10;Cicendo">${esc(EE.areasTxt)}</textarea><div class="hint">Jadi pilihan cepat di kasir (+ otomatis ada "Luar kota"). Kosongkan kalau mau SPG ketik manual.</div>
  <div class="grid2"><div><label>Mulai</label><input type="date" value="${EE.start}" onchange="EE.start=this.value;if(EE.end<EE.start){EE.end=EE.start;rEvent()}"></div><div><label>Selesai</label><input type="date" value="${EE.end}" onchange="EE.end=this.value"></div></div>
  <div class="grid2"><div><label>Jam buka</label><input type="time" value="${EE.open}" onchange="EE.open=this.value"></div><div><label>Jam tutup</label><input type="time" value="${EE.close}" onchange="EE.close=this.value"></div></div>
  <label>Tim yang bertugas <b class="req">*</b></label><div class="chips">${S.spgs.filter(s => s.active || EE.spgIds.includes(s.id)).map(s => chip(s.emoji + ' ' + esc(s.name) + (s.role === 'Team Leader' ? ' ⭐' : ''), EE.spgIds.includes(s.id), `togSpg('${s.id}')`)).join('') || '<span class="hint" style="margin:0">Daftarkan tim dulu di tab Tim.</span>'}</div><div class="hint">Cuma yang terpilih yang bisa check-in ke event ini.</div>
  <label>Brief buat SPG <span class="opt">(opsional)</span></label><textarea rows="3" oninput="EE.brief=this.value" placeholder="Fokus produk, promo, dress code, aturan booth…">${esc(EE.brief)}</textarea>
  ${!EE.id && S.events.length ? `<label>Salin alokasi stok dari <span class="opt">(opsional)</span></label><div class="chips">${chip('Mulai kosong', !EE.copyFrom, "EE.copyFrom='';rEvent()")}${S.events.map(e => chip(esc(e.name), EE.copyFrom === e.id, `EE.copyFrom='${e.id}';rEvent()`)).join('')}</div>` : ''}
  <div class="tglr"><span>Event aktif<small>Matikan buat batalin / arsipkan event</small></span><div class="tgl ${EE.active ? 'on' : ''}" onclick="EE.active=!EE.active;rEvent()"></div></div>
  </div>
  <div class="sticky">${EE.id && !used ? `<div class="grid2"><button class="btn block danger" onclick="confirmSheet('Hapus event?','Event ini belum ada transaksi, aman dihapus.','Hapus','delE()')">Hapus</button><button class="btn block primary" onclick="saveE()">Simpan</button></div>` : `<button class="btn block primary" onclick="saveE()">${EE.id ? 'Simpan perubahan' : 'Buat event'}</button>`}</div>`;
  openSheet(h, top);
}
async function saveE() {
  const name = EE.name.trim(), loc = EE.loc.trim();
  if (!name) return toast('Nama event wajib diisi');
  if (!loc) return toast('Lokasi wajib diisi');
  if (!EE.start || !EE.end) return toast('Isi tanggal mulai & selesai');
  if (EE.end < EE.start) return toast('Tanggal selesai ga boleh sebelum mulai');
  if (!EE.spgIds.length) return toast('Pilih minimal 1 anggota tim');
  const code = (EE.code || autoCode(name)).toUpperCase();
  if (S.events.some(e => e.id !== EE.id && e.code === code)) return toast(`Kode ${code} udah dipakai event lain`);
  const id = EE.id || uuid();
  const row = { id, code, name, loc, city: (EE.city || '').trim(), areas: [...new Set((EE.areasTxt || '').split('\n').map(x => x.trim()).filter(Boolean))], start_date: EE.start, end_date: EE.end, open_time: EE.open || '09:00', close_time: EE.close || '21:00', radius: Math.max(10, parseInt(EE.radius) || 100), brief: EE.brief.trim(), active: EE.active, spg_ids: EE.spgIds };
  if (!await dbDo(sb.from('events').upsert(row))) return;
  if (!EE.id && EE.copyFrom) { const src = getEv(EE.copyFrom); const rows = Object.entries(src.stock).map(([sku, qty]) => ({ event_id: id, sku, qty })); if (rows.length) await dbDo(sb.from('stock').upsert(rows, { onConflict: 'event_id,sku' })) }
  await loadCore(); closeSheet(); render(); toast(EE.id ? 'Event diperbarui ✅' : EE.copyFrom ? 'Event dibuat, stok tersalin ✅' : 'Event dibuat — isi stoknya di tab Stok 📦');
}
async function delE() {
  if (!await dbDo(sb.from('events').delete().eq('id', EE.id))) return;
  if (stokEv === EE.id) stokEv = null; if (adminEv === EE.id) adminEv = 'all';
  await loadCore(); closeSheet(); render(); toast('Event dihapus');
}
/* ---------- tim ---------- */
function tTim() {
  let h = `<button class="btn block primary" onclick="editM()">＋ Daftarkan anggota</button>`;
  [['Team Leader', m => m.active && m.role === 'Team Leader'], ['SPG', m => m.active && m.role === 'SPG'], ['Nonaktif', m => !m.active]].forEach(([g, fn]) => {
    const ms = S.spgs.filter(fn); if (!ms.length) return;
    h += `<h3 class="sec">${g} <span class="sm mut">${ms.length} orang</span></h3><div class="card list">${ms.map(mRow).join('')}</div>`;
  });
  return h + `<p class="note">Anggota login di HP pakai nama + PIN 4 digit.</p>`;
}
function mRow(m) {
  const st = stats(x => x.spgId === m.id), evn = S.events.filter(e => e.spgIds.includes(m.id) && ['Berlangsung', 'Akan datang'].includes(evStatus(e))).length;
  return `<div class="row" onclick="editM('${m.id}')"><div style="display:flex;gap:12px;align-items:center;min-width:0"><div class="ava" style="width:42px;height:42px;font-size:22px">${m.emoji}</div><div style="min-width:0"><b>${esc(m.name)}</b><div class="sm mut">${m.hp ? esc(m.hp) + ' · ' : ''}${evn} event aktif</div></div></div><div class="r"><b>${st.call}</b><span class="sm mut">call · ${rpk(st.omzet)}</span></div></div>`;
}
let ME;
function editM(id) {
  const m = id ? getSpg(id) : null;
  ME = m ? { ...m, pin: '', evIds: S.events.filter(e => e.spgIds.includes(m.id)).map(e => e.id) }
    : { id: null, name: '', emoji: AVA[S.spgs.length % AVA.length], role: 'SPG', hp: '', pin: String(Math.floor(1000 + Math.random() * 9000)), note: '', active: true, evIds: [] };
  rMember(true);
}
function togMEv(id) { const i = ME.evIds.indexOf(id); i < 0 ? ME.evIds.push(id) : ME.evIds.splice(i, 1); rMember() }
function rMember(top) {
  const used = ME.id && (S.trx.some(t => t.spgId === ME.id) || S.calls.some(c => c.spgId === ME.id));
  const evs = S.events.filter(e => ['Berlangsung', 'Akan datang'].includes(evStatus(e)) || ME.evIds.includes(e.id));
  let h = `<div class="shd"><h2>${ME.id ? 'Edit anggota' : 'Anggota baru'}</h2><button class="x" onclick="closeSheet()">✕</button></div><div class="card form">
  <label>Avatar</label><div class="chips">${AVA.map(a => `<button class="chip emo ${ME.emoji === a ? 'on' : ''}" onclick="ME.emoji='${a}';rMember()">${a}</button>`).join('')}</div>
  <label>Nama <b class="req">*</b></label><input type="text" value="${esc(ME.name)}" oninput="ME.name=this.value" placeholder="nama panggilan">
  <label>Peran</label><div class="seg"><button class="${ME.role === 'SPG' ? 'on' : ''}" onclick="ME.role='SPG';rMember()">🙋‍♀️ SPG</button><button class="${ME.role === 'Team Leader' ? 'on' : ''}" onclick="ME.role='Team Leader';rMember()">⭐ Team Leader</button></div>
  <label>No. HP / WA <span class="opt">(opsional)</span></label><input type="tel" inputmode="tel" value="${esc(ME.hp)}" oninput="ME.hp=this.value" placeholder="08xx">
  <label>${ME.id ? 'PIN baru <span class="opt">(kosongkan kalau ga diganti)</span>' : 'PIN login <b class="req">*</b>'}</label><input type="tel" inputmode="numeric" maxlength="4" value="${esc(ME.pin)}" oninput="ME.pin=this.value.replace(/\\D/g,'').slice(0,4);this.value=ME.pin" placeholder="${ME.id ? '••••' : '4 digit'}" style="letter-spacing:.4em;font-family:Outfit,sans-serif;font-size:20px"><div class="hint">${ME.id ? 'PIN lama tersimpan terenkripsi & ga bisa dilihat. Isi PIN baru kalau anggota lupa.' : 'Catat & kasih tau ke anggotanya — setelah disimpan PIN ga bisa dilihat lagi.'}</div>
  <label>Ditugaskan ke event</label>${evs.length ? `<div class="chips">${evs.map(e => chip(esc(e.name) + ' <span style="opacity:.6;font-weight:500">' + range(e) + '</span>', ME.evIds.includes(e.id), `togMEv('${e.id}')`)).join('')}</div>` : '<div class="hint" style="margin:0">Belum ada event aktif.</div>'}
  <label>Catatan <span class="opt">(opsional)</span></label><input type="text" value="${esc(ME.note)}" oninput="ME.note=this.value" placeholder="ukuran seragam, domisili, dll">
  <div class="tglr"><span>Aktif<small>Anggota nonaktif ga bisa login</small></span><div class="tgl ${ME.active ? 'on' : ''}" onclick="ME.active=!ME.active;rMember()"></div></div>
  </div>
  <div class="sticky">${ME.id && !used ? `<div class="grid2"><button class="btn block danger" onclick="confirmSheet('Hapus anggota?','Belum ada data jualan, aman dihapus.','Hapus','delM()')">Hapus</button><button class="btn block primary" onclick="saveM()">Simpan</button></div>` : `<button class="btn block primary" onclick="saveM()">${ME.id ? 'Simpan perubahan' : 'Daftarkan'}</button>`}</div>`;
  openSheet(h, top);
}
async function saveM() {
  const name = ME.name.trim();
  if (!name) return toast('Nama wajib diisi');
  if ((!ME.id || ME.pin) && !/^\d{4}$/.test(ME.pin)) return toast('PIN harus 4 digit angka');
  const id = ME.id || uuid();
  const row = { id, name, emoji: ME.emoji, role: ME.role, hp: (ME.hp || '').trim(), note: (ME.note || '').trim(), active: ME.active };
  if (!await dbDo(sb.from('members').upsert(row))) return;
  if (ME.pin) { const { error } = await sb.rpc('admin_set_pin', { p_member: id, p_pin: ME.pin }); if (error) return toast(errMsg(error)) }
  for (const e of S.events) {
    const has = e.spgIds.includes(id), want = ME.evIds.includes(e.id);
    if (has !== want) { const ids = want ? [...e.spgIds, id] : e.spgIds.filter(x => x !== id); await dbDo(sb.from('events').update({ spg_ids: ids }).eq('id', e.id)) }
  }
  await loadCore(); closeSheet(); render();
  toast(ME.id ? (ME.pin ? `Tersimpan — PIN baru ${ME.pin} 🔑` : 'Data anggota diperbarui ✅') : `${name} terdaftar — PIN ${ME.pin} 🎉`);
}
async function delM() {
  for (const e of S.events) if (e.spgIds.includes(ME.id)) await dbDo(sb.from('events').update({ spg_ids: e.spgIds.filter(x => x !== ME.id) }).eq('id', e.id));
  if (!await dbDo(sb.from('members').delete().eq('id', ME.id))) return;
  await loadCore(); closeSheet(); render(); toast('Anggota dihapus');
}
/* ---------- produk ---------- */
function tProduk() {
  let h = `<button class="btn block primary" onclick="editP()">＋ Tambah produk / merch</button>`;
  CATS.forEach(cat => {
    const ps = S.products.filter(p => p.cat === cat); if (!ps.length) return;
    h += `<h3 class="sec">${cat} <span class="sm mut">${ps.length} item</span></h3><div class="card list">${ps.map(p => `<div class="row" onclick="editP('${p.id}')"><div style="display:flex;gap:12px;align-items:center;min-width:0">${thumb(p, 44)}<div style="min-width:0"><b>${esc(p.name)}</b><div class="sm mut">${price(p)} / ${esc(p.unit)}${p.variants.length ? ' · ' + p.variants.length + ' varian' : ''}${p.maxPer ? ' · maks ' + p.maxPer : ''}${p.age18 ? ' · 18+' : ''}</div></div></div><div class="r">${p.active ? '<span class="sm mut">Edit ›</span>' : '<span class="tag off">nonaktif</span>'}</div></div>`).join('')}</div>`;
  });
  if (!S.products.length) h += `<p class="note">Belum ada produk. Tambahkan produk & merch pertama ☝️</p>`;
  return h + `<p class="note">Harga 0 = item gimmick/gratis. Tetap tercatat & potong stok.</p>`;
}
let PE;
function editP(pid) {
  const p = pid ? getP(pid) : null;
  PE = p ? { ...p, variants: p.variants.join(', '), price: String(p.price), maxPer: p.maxPer ? String(p.maxPer) : '' }
    : { id: null, name: '', cat: 'Produk', price: '', unit: 'pcs', variants: '', desc: '', maxPer: '', age18: false, active: true, emo: '📦', c: COLORS[S.products.length % COLORS.length], img: '' };
  rEdit(true);
}
function rEdit(top) {
  const used = PE.id && S.trx.some(t => t.items.some(i => i.pid === PE.id));
  let h = `<div class="shd"><h2>${PE.id ? 'Edit item' : 'Item baru'}</h2><button class="x" onclick="closeSheet()">✕</button></div><div class="card form">
  <label>Foto / ikon</label>
  <div style="display:flex;gap:14px;align-items:center">${thumb(PE, 76)}<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
    <label class="btn sm up">📷 ${PE.img ? 'Ganti foto' : 'Upload foto'}<input type="file" accept="image/*" hidden onchange="pickImg(this)"></label>
    ${PE.img ? `<button class="btn sm" onclick="PE.img='';rEdit()">Hapus foto</button>` : '<span class="hint" style="margin:0">atau pilih ikon & warna ↓</span>'}</div></div>
  ${PE.img ? '' : `<div class="chips" style="margin-top:12px">${EMOS.map(e => `<button class="chip emo ${PE.emo === e ? 'on' : ''}" onclick="PE.emo='${e}';rEdit()">${e}</button>`).join('')}</div>
  <div class="dots">${COLORS.map(c => `<div class="dot ${PE.c === c ? 'on' : ''}" style="background:${c}" onclick="PE.c='${c}';rEdit()"></div>`).join('')}</div>`}
  <label>Nama item <b class="req">*</b></label><input type="text" value="${esc(PE.name)}" oninput="PE.name=this.value" placeholder="mis. Kaos Edisi Event">
  <label>Kategori</label><div class="seg s3">${CATS.map(c => `<button class="${PE.cat === c ? 'on' : ''}" onclick="PE.cat='${c}';rEdit()">${c}</button>`).join('')}</div>
  <div class="grid2"><div><label>Harga (Rp)</label><input type="number" inputmode="numeric" value="${esc(PE.price)}" oninput="PE.price=this.value" placeholder="0"><div class="hint">0 = gratis / gimmick</div></div>
  <div><label>Satuan</label><input type="text" value="${esc(PE.unit)}" oninput="PE.unit=this.value" placeholder="pcs"><div class="hint">pcs, botol, paket…</div></div></div>
  <label>Varian <span class="opt">(opsional)</span></label><input type="text" value="${esc(PE.variants)}" oninput="PE.variants=this.value" placeholder="mis. S, M, L, XL  atau  Hitam, Putih"><div class="hint">Pisah pakai koma. Stok dihitung per varian.${used ? ' Jangan ganti nama varian yang sudah terjual.' : ''}</div>
  <label>Deskripsi / info buat SPG</label><textarea rows="3" oninput="PE.desc=this.value" placeholder="Bahan, rasa, ukuran, promo, poin jualan…">${esc(PE.desc)}</textarea>
  <label>Maks per konsumen <span class="opt">(opsional)</span></label><input type="number" inputmode="numeric" value="${esc(PE.maxPer)}" oninput="PE.maxPer=this.value" placeholder="kosong = bebas">
  <div class="tglr"><span>Wajib 18+<small>Kasir nolak kalau umur konsumen di bawah 18</small></span><div class="tgl ${PE.age18 ? 'on' : ''}" onclick="PE.age18=!PE.age18;rEdit()"></div></div>
  <div class="tglr"><span>Tampil di kasir<small>Matikan kalau item lagi ga dijual</small></span><div class="tgl ${PE.active ? 'on' : ''}" onclick="PE.active=!PE.active;rEdit()"></div></div>
  </div>
  <div class="sticky">${PE.id && !used ? `<div class="grid2"><button class="btn block danger" onclick="confirmSheet('Hapus item?','Item ini akan dihapus permanen.','Hapus','delP()')">Hapus</button><button class="btn block primary" onclick="saveP()">Simpan</button></div>` : `<button class="btn block primary" onclick="saveP()">Simpan item</button>`}</div>`;
  openSheet(h, top);
}
function pickImg(inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const s = 320, c = document.createElement('canvas'), k = Math.max(s / im.width, s / im.height); c.width = c.height = s; const g = c.getContext('2d'); const w = im.width * k, hh = im.height * k; g.drawImage(im, (s - w) / 2, (s - hh) / 2, w, hh); PE.img = c.toDataURL('image/jpeg', .72); rEdit() }; im.onerror = () => toast('Gambar ga kebaca'); im.src = r.result };
  r.readAsDataURL(f);
}
async function saveP() {
  const name = PE.name.trim(); if (!name) return toast('Nama item wajib diisi');
  const variants = [...new Set(PE.variants.split(',').map(s => s.trim().replace(/\|/g, '/')).filter(Boolean))];
  const row = { id: PE.id || uuid(), name, cat: PE.cat, price: Math.max(0, Math.round(+PE.price || 0)), unit: PE.unit.trim() || 'pcs', variants, descr: (PE.desc || '').trim(), max_per: Math.max(0, parseInt(PE.maxPer) || 0), age18: PE.age18, active: PE.active, emo: PE.emo, color: PE.c, img: PE.img || '' };
  if (!await dbDo(sb.from('products').upsert(row))) return;
  await loadCore(); closeSheet(); render(); toast(PE.id ? 'Item diperbarui ✅' : 'Item ditambahkan — jangan lupa isi stoknya 📦');
}
async function delP() {
  if (!await dbDo(sb.from('products').delete().eq('id', PE.id))) return;
  for (const e of S.events) for (const k of Object.keys(e.stock)) if (skuP(k) === PE.id) await sb.from('stock').delete().eq('event_id', e.id).eq('sku', k);
  await loadCore(); closeSheet(); render(); toast('Item dihapus');
}
/* ---------- stok ---------- */
function tStok() {
  if (!S.events.length) return `<p class="note">Buat event dulu di tab Event.</p>`;
  if (!stokEv || !getEv(stokEv)) stokEv = S.events[0].id;
  const ev = getEv(stokEv);
  let h = `<div class="chips scroll" style="margin-bottom:12px">${S.events.map(e => chip(esc(e.name), stokEv === e.id, `stokEv='${e.id}';render()`)).join('')}</div>`;
  h += `<p class="sm mut" style="margin-bottom:12px">Isi jumlah barang yang dibawa ke booth <b>${esc(ev.name)}</b>. Sisa otomatis berkurang tiap transaksi masuk.</p>`;
  CATS.forEach(cat => {
    const ps = S.products.filter(p => p.cat === cat); if (!ps.length) return;
    h += `<h3 class="sec">${cat}</h3><div class="card"><table class="tbl"><tr><th>Item</th><th>Dibawa</th><th>Keluar</th><th>Sisa</th></tr>${ps.flatMap(p => skus(p).map(s => `<tr><td>${esc(p.name)}${s.v ? `<small>Varian ${esc(s.v)}</small>` : ''}${p.active ? '' : '<small>nonaktif</small>'}</td><td><input type="number" inputmode="numeric" value="${ev.stock[s.sku] || 0}" onchange="setStock('${s.sku}',this.value)"></td><td>${sold(ev.id, s.sku)}</td><td style="${left(ev.id, s.sku) < 10 ? 'color:#FF8FA3' : ''}"><b>${left(ev.id, s.sku)}</b></td></tr>`)).join('')}</table></div>`;
  });
  if (!S.products.length) h += `<p class="note">Belum ada produk. Tambahkan di tab Produk.</p>`;
  return h;
}
async function setStock(sku, v) {
  const ev = getEv(stokEv), n = Math.max(0, parseInt(v) || 0), s = sold(ev.id, sku);
  if (n < s) { toast(`Ga bisa di bawah yang udah keluar (${s})`); return render() }
  if (!await dbDo(sb.from('stock').upsert({ event_id: ev.id, sku, qty: n }, { onConflict: 'event_id,sku' }), 'Stok disimpan')) return render();
  ev.stock[sku] = n; render();
}
/* ---------- pengaturan ---------- */
let NU = { email: '', role: 'client' };
function tAtur() {
  return `<div class="card form">
  <label>Nama brand <span class="opt">(muncul di struk)</span></label><input type="text" value="${esc(S.brand)}" onchange="saveSet({brand:this.value.trim()||'Brand'})">
  <label>Target call per SPG / hari</label><input type="number" inputmode="numeric" value="${S.target}" onchange="saveSet({target:Math.max(1,parseInt(this.value)||50)})">
  <label>Zona waktu</label><div class="seg s3">${TZS.map(([z, l]) => `<button class="${S.tz === z ? 'on' : ''}" onclick="saveSet({tz:'${z}'})">${l}</button>`).join('')}</div><div class="hint">Dipakai buat nentuin event "hari ini" di HP SPG.</div>
  <label>Pilihan "brand sebelumnya"</label><textarea rows="4" onchange="saveSet({old_brands:this.value.split('\\n').map(s=>s.trim()).filter(Boolean)})" placeholder="Satu per baris">${esc(S.oldBrands.join('\n'))}</textarea><div class="hint">Satu pilihan per baris. Kosongkan kalau ga perlu — field-nya hilang dari kasir.</div>
  </div>
  <h3 class="sec">🔑 Akses dashboard</h3>
  <div class="card list">${S.users.map(u => `<div class="row" style="cursor:default"><div style="min-width:0"><b style="word-break:break-all">${esc(u.email)}</b><div class="sm mut">${u.role === 'admin' ? 'Admin — bisa ubah semua' : 'Brand/client — lihat rekap & export'}</div></div><div class="r">${u.email.toLowerCase() === (S.me || '').toLowerCase() ? '<span class="tag">kamu</span>' : `<button class="btn sm danger" onclick="delUser('${esc(u.email)}')">Hapus</button>`}</div></div>`).join('')}</div>
  <div class="card form" style="margin-top:12px"><label>Tambah email</label><input type="text" inputmode="email" value="${esc(NU.email)}" oninput="NU.email=this.value.trim()" placeholder="email@brand.com">
  <label>Peran</label><div class="seg"><button class="${NU.role === 'client' ? 'on' : ''}" onclick="NU.role='client';render()">👀 Brand / client</button><button class="${NU.role === 'admin' ? 'on' : ''}" onclick="NU.role='admin';render()">🛠️ Admin</button></div>
  <div style="margin-top:14px"><button class="btn block primary" onclick="addUser()">Beri akses</button></div>
  <div class="hint" style="margin-top:10px">Setelah diberi akses, buat juga login-nya di Supabase → Authentication → Users → Add user (email sama + password).</div></div>`;
}
async function saveSet(patch) {
  if (!await dbDo(sb.from('settings').update(patch).eq('id', 1), 'Tersimpan ✅')) return;
  await loadCore(); render();
}
async function addUser() {
  const email = NU.email.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Email ga valid');
  if (!await dbDo(sb.from('app_users').insert({ email, role: NU.role }), 'Akses ditambahkan ✅')) return;
  NU = { email: '', role: 'client' }; await loadCore(); render();
}
async function delUser(email) {
  if (!await dbDo(sb.from('app_users').delete().eq('email', email), 'Akses dicabut')) return;
  await loadCore(); render();
}

/* =====================================================================
   EXPORT EXCEL
   ===================================================================== */
function loadExcel() { return window.ExcelJS ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('lib')); document.head.appendChild(sc) }) }
const xtm = t => { const d = new Date(t); return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400 };
const xday = t => { const d = new Date(t); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) };
const ageGrp = a => a < 18 ? '< 18' : a < 25 ? '18–24' : a < 35 ? '25–34' : a < 45 ? '35–44' : '45+';
const colL = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s };
async function buildWb() {
  const f = x => adminEv === 'all' || x.eventId === adminEv, evs = adminEv === 'all' ? S.events : [getEv(adminEv)], st = stats(f);
  const scope = adminEv === 'all' ? 'Semua event' : getEv(adminEv).name;
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGTLN POS'; wb.created = new Date();
  const RP = '"Rp"#,##0', PCT = '0%', DT = 'dd/mm/yyyy', TM = 'hh:mm', NUM = '#,##0';
  const INK = 'FF20104F', LIME = 'FFD7F26A', LAV = 'FFEDE6FF', ZEB = 'FFF7F4FF', GRID = { style: 'thin', color: { argb: 'FFDCD3F5' } };
  const BOX = { top: GRID, left: GRID, bottom: GRID, right: GRID };
  const evName = id => { const e = getEv(id); return e ? e.name : '-' }, spName = id => { const s = getSpg(id); return s ? s.name : '-' };
  function sheet(name, title, cols, rows, total) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: 'FF4421A6' } } });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.getCell('A1').value = title; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF2D1377' } };
    ws.getCell('A2').value = `${S.brand} · ${scope} · diekspor ${dt(Date.now())} · DGTLN POS`; ws.getCell('A2').font = { italic: true, size: 9.5, color: { argb: 'FF7A6FA0' } };
    const hr = ws.getRow(4); hr.height = 24;
    cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.h; cell.font = { bold: true, color: { argb: INK } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIME } }; cell.alignment = { vertical: 'middle', horizontal: c.fmt ? 'right' : 'left', wrapText: true, indent: c.fmt ? 0 : 1 }; cell.border = BOX; ws.getColumn(i + 1).width = c.w || 14 });
    rows.forEach((r, ri) => { const row = ws.getRow(5 + ri); r.forEach((v, i) => { const cell = row.getCell(i + 1), c = cols[i], w = v && v._f !== undefined; cell.value = w ? v._v : (v === '' || v == null ? null : v); const fm = w ? v._f : c.fmt; if (fm) cell.numFmt = fm; cell.border = BOX; cell.alignment = { vertical: 'middle', horizontal: fm ? 'right' : (c.al || 'left'), indent: fm ? 0 : 1 }; if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEB } } }) });
    const n = rows.length;
    if (n && name !== 'Ringkasan') ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: cols.length } };
    if (total && n) {
      const row = ws.getRow(5 + n); row.height = 22;
      total.forEach((v, i) => {
        const cell = row.getCell(i + 1), L = colL(i);
        if (v === 'sum') cell.value = { formula: `SUBTOTAL(9,${L}5:${L}${4 + n})` };
        else if (v && v.f) cell.value = { formula: v.f.replace(/#/g, 5 + n) };
        else cell.value = v || null;
        if (cols[i].fmt) cell.numFmt = cols[i].fmt;
        cell.font = { bold: true, color: { argb: INK } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LAV } }; cell.border = { top: { style: 'medium', color: { argb: INK } }, bottom: GRID, left: GRID, right: GRID }; cell.alignment = { vertical: 'middle', horizontal: cols[i].fmt ? 'right' : 'left', indent: cols[i].fmt ? 0 : 1 }
      });
    }
    return ws;
  }
  const trxSorted = st.trx.slice().sort((a, b) => a.t - b.t), pct = (a, b) => b ? a / b : 0;
  sheet('Ringkasan', 'Ringkasan Penjualan', [{ h: 'Metrik', w: 36 }, { h: 'Nilai', w: 22, fmt: NUM }], [
    ['Total call (semua yang ditawari)', st.call], ['Effective call (yang beli)', st.ec], ['Konversi (EC ÷ call)', { _v: pct(st.ec, st.call), _f: PCT }],
    ['Konsumen coba sample (trial)', st.trial], ['Trial rate', { _v: pct(st.trial, st.call), _f: PCT }],
    ['Item terjual (berbayar)', st.so], ['Gimmick / gratis keluar', st.gim], ['Jumlah transaksi', st.trx.length],
    ['Omzet', { _v: st.omzet, _f: RP }], ['  · Tunai (wajib disetor)', { _v: st.tunai, _f: RP }], ['  · QRIS', { _v: st.qris, _f: RP }],
    ['Rata-rata belanja / transaksi', { _v: st.trx.length ? Math.round(st.omzet / st.trx.length) : 0, _f: RP }]]);
  sheet('Per Event', 'Rekap per Event', [{ h: 'Kode', w: 10 }, { h: 'Event', w: 28 }, { h: 'Kota', w: 14 }, { h: 'Lokasi', w: 26 }, { h: 'Mulai', w: 12, fmt: DT }, { h: 'Selesai', w: 12, fmt: DT }, { h: 'Call', w: 9, fmt: NUM }, { h: 'Effective Call', w: 11, fmt: NUM }, { h: 'Konversi', w: 10, fmt: PCT }, { h: 'Item Terjual', w: 11, fmt: NUM }, { h: 'Omzet', w: 15, fmt: RP }, { h: 'Tunai', w: 15, fmt: RP }, { h: 'QRIS', w: 15, fmt: RP }],
    evs.map(e => { const x = stats(y => y.eventId === e.id); return [e.code, e.name, e.city || '', e.loc, new Date(e.start + 'T00:00:00Z'), new Date(e.end + 'T00:00:00Z'), x.call, x.ec, pct(x.ec, x.call), x.so, x.omzet, x.tunai, x.qris] }),
    ['TOTAL', '', '', '', '', '', 'sum', 'sum', { f: 'IF(G#=0,0,H#/G#)' }, 'sum', 'sum', 'sum', 'sum']);
  const tr = []; trxSorted.forEach(t => { const e = getEv(t.eventId) || {}; t.items.forEach(i => { const p = getP(i.pid); tr.push([t.no, xday(t.t), xtm(t.t), e.code || '', e.name || '', e.city || '', spName(t.spgId), p ? p.cat : '', i.name, i.v || '-', i.qty, i.price, { _v: { formula: `K${5 + tr.length}*L${5 + tr.length}`, result: i.qty * i.price }, _f: RP }, t.pay]) }) });
  sheet('Transaksi', 'Detail Transaksi (1 baris = 1 item)', [{ h: 'No. Transaksi', w: 16 }, { h: 'Tanggal', w: 12, fmt: DT }, { h: 'Jam', w: 8, fmt: TM }, { h: 'Kode Event', w: 10 }, { h: 'Event', w: 24 }, { h: 'Kota', w: 13 }, { h: 'SPG', w: 12 }, { h: 'Kategori', w: 11 }, { h: 'Item', w: 24 }, { h: 'Varian', w: 9 }, { h: 'Qty', w: 7, fmt: NUM }, { h: 'Harga', w: 13, fmt: RP }, { h: 'Subtotal', w: 14, fmt: RP }, { h: 'Bayar', w: 9 }],
    tr, ['TOTAL', '', '', '', '', '', '', '', '', '', 'sum', '', 'sum', '']);
  sheet('Konsumen', 'Data Konsumen (1 baris = 1 transaksi)', [{ h: 'No. Transaksi', w: 16 }, { h: 'Tanggal', w: 12, fmt: DT }, { h: 'Jam', w: 8, fmt: TM }, { h: 'Event', w: 24 }, { h: 'SPG', w: 12 }, { h: 'Umur', w: 7, fmt: NUM }, { h: 'Kelompok Umur', w: 12 }, { h: 'Domisili', w: 16 }, { h: 'Brand Sebelumnya', w: 17 }, { h: 'Trial', w: 8 }, { h: 'No. HP', w: 16 }, { h: 'Jumlah Item', w: 10, fmt: NUM }, { h: 'Total Belanja', w: 14, fmt: RP }, { h: 'Bayar', w: 9 }],
    trxSorted.map(t => [t.no, xday(t.t), xtm(t.t), evName(t.eventId), spName(t.spgId), t.cust.age, ageGrp(t.cust.age), t.cust.kec, t.cust.old || '-', t.cust.trial == null ? '-' : t.cust.trial ? 'Ya' : 'Tidak', t.cust.hp || '-', packs(t), t.total, t.pay]),
    ['TOTAL', '', '', '', '', '', '', '', '', '', '', 'sum', 'sum', '']);
  const sp = S.spgs.map(m => ({ m, x: stats(y => f(y) && y.spgId === m.id) })).filter(r => r.x.call > 0).sort((a, b) => b.x.call - a.x.call);
  sheet('Per SPG', 'Performa per SPG', [{ h: 'Peringkat', w: 10, fmt: NUM }, { h: 'Nama', w: 14 }, { h: 'Peran', w: 13 }, { h: 'No. HP', w: 16 }, { h: 'Call', w: 9, fmt: NUM }, { h: 'Effective Call', w: 11, fmt: NUM }, { h: 'Konversi', w: 10, fmt: PCT }, { h: 'Trial', w: 8, fmt: NUM }, { h: 'Item Terjual', w: 11, fmt: NUM }, { h: 'Omzet', w: 15, fmt: RP }, { h: 'Tunai (Setoran)', w: 15, fmt: RP }, { h: 'QRIS', w: 15, fmt: RP }],
    sp.map((r, i) => [i + 1, r.m.name, r.m.role || 'SPG', r.m.hp || '-', r.x.call, r.x.ec, { _v: { formula: `IF(E${5 + i}=0,0,F${5 + i}/E${5 + i})`, result: pct(r.x.ec, r.x.call) }, _f: PCT }, r.x.trial, r.x.so, r.x.omzet, r.x.tunai, r.x.qris]),
    ['', 'TOTAL', '', '', 'sum', 'sum', { f: 'IF(E#=0,0,F#/E#)' }, 'sum', 'sum', 'sum', 'sum', 'sum']);
  const ps = []; evs.forEach(e => S.products.forEach(p => skus(p).forEach(s => { const sd = sold(e.id, s.sku), al = e.stock[s.sku] || 0; if (!al && !sd) return; const r = 5 + ps.length; ps.push([e.code, e.name, p.cat, p.name, s.v || '-', p.unit, p.price, al, sd, { _v: { formula: `H${r}-I${r}`, result: al - sd }, _f: NUM }, { _v: { formula: `I${r}*G${r}`, result: sd * p.price }, _f: RP }]) })));
  sheet('Produk & Stok', 'Penjualan & Sisa Stok per Item', [{ h: 'Kode Event', w: 10 }, { h: 'Event', w: 24 }, { h: 'Kategori', w: 11 }, { h: 'Item', w: 24 }, { h: 'Varian', w: 9 }, { h: 'Satuan', w: 9 }, { h: 'Harga', w: 13, fmt: RP }, { h: 'Dibawa', w: 9, fmt: NUM }, { h: 'Keluar', w: 9, fmt: NUM }, { h: 'Sisa', w: 9, fmt: NUM }, { h: 'Omzet', w: 15, fmt: RP }],
    ps, ['TOTAL', '', '', '', '', '', '', 'sum', 'sum', 'sum', 'sum']);
  const lg2 = [...st.calls.map(c => ({ t: c.t, e: c.eventId, s: c.spgId, buy: false, trial: c.trial, no: '' })), ...st.trx.map(t => ({ t: t.t, e: t.eventId, s: t.spgId, buy: true, trial: t.cust.trial, no: t.no }))].sort((a, b) => a.t - b.t);
  sheet('Log Call', 'Log Semua Call (ditawari)', [{ h: 'Tanggal', w: 12, fmt: DT }, { h: 'Jam', w: 8, fmt: TM }, { h: 'Event', w: 24 }, { h: 'SPG', w: 12 }, { h: 'Hasil', w: 11 }, { h: 'Trial', w: 8 }, { h: 'No. Transaksi', w: 16 }],
    lg2.map(c => [xday(c.t), xtm(c.t), evName(c.e), spName(c.s), c.buy ? 'Beli' : 'Tidak beli', c.trial == null ? '-' : c.trial ? 'Ya' : 'Tidak', c.no || '-']));
  return await wb.xlsx.writeBuffer();
}
async function exportXlsx() {
  if (exportXlsx.busy) return; exportXlsx.busy = true; toast('Menyiapkan file Excel…');
  try {
    await loadExcel();
    const buf = await buildWb(), fn = `DGTLN-POS_${adminEv === 'all' ? 'Semua-Event' : getEv(adminEv).code}_${ymd(new Date())}.xlsx`;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('File Excel diunduh ✅');
  } catch (e) { console.warn(e); toast('Gagal bikin Excel — cek koneksi lalu coba lagi') }
  finally { exportXlsx.busy = false }
}

/* =====================================================================
   START-UP
   ===================================================================== */
window.addEventListener('online', () => { NET.fail = false; if (MODE === 'spg') { syncNow(); refreshBoot() } else render() });
window.addEventListener('offline', () => { NET.fail = true; if (MODE === 'spg') render() });
setInterval(() => { if (MODE === 'spg') syncNow() }, 20000);
setInterval(() => { if (MODE === 'admin' && view === 'admin' && aTab === 'rekap' && !sheetOpen() && document.visibilityState === 'visible') refreshAdmin(true) }, 60000);
if (APP === 'spg' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });

(async function init() {
  if (!CONFIGURED) { view = 'setup'; return render() }
  if (APP === 'admin') {
    view = 'adminLogin'; render();
    if (!sb) return;
    sb.auth.onAuthStateChange((ev, session) => { S.me = session ? session.user.email : null });
    try { const { data } = await sb.auth.getSession(); if (data && data.session) await enterAdmin() } catch (e) { }
    return;
  }
  if (SESS && CK) {
    B = LS.get(bootKey(CK.eventId), null);
    if (B) { enterSpg(); syncNow(); refreshBoot(); return }
  }
  goSpgLogin(); syncNow();
})();
