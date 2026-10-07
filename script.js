/* CloudSave prototype - data disimpan di localStorage browser */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const QUOTA = 50 * 1024 * 1024, MAX_FILE = 1.5 * 1024 * 1024;
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } },
             set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { return false } } };

let users = LS.get('cs_users', [{ name: 'Pengguna Demo', email: 'demo@cloudsave.id', pass: 'demo123' }]);
LS.set('cs_users', users);
let me = LS.get('cs_session', null), db = null, view = 'dashboard', cwd = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const when = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const ext = n => (n.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400) }
function save() { if (!LS.set('cs_data_' + me.email, db)) toast('Penyimpanan browser penuh. Hapus beberapa file.') }
function log(a, n) { db.log.unshift({ a, n, t: Date.now() }); db.log = db.log.slice(0, 100) }

/* ---------- AUTH ---------- */
$('#tabLogin').onclick = () => authTab(true);
$('#tabReg').onclick = () => authTab(false);
function authTab(l) {
  $('#formLogin').hidden = !l; $('#formReg').hidden = l; $('#authMsg').textContent = '';
  $('#tabLogin').classList.toggle('active', l); $('#tabReg').classList.toggle('active', !l);
}
$('#formLogin').onsubmit = e => {
  e.preventDefault();
  const u = users.find(x => x.email === $('#lEmail').value.trim().toLowerCase() && x.pass === $('#lPass').value);
  if (!u) return $('#authMsg').textContent = 'Email atau kata sandi salah. Periksa kembali atau daftar akun baru.';
  start(u);
};
$('#formReg').onsubmit = e => {
  e.preventDefault();
  const email = $('#rEmail').value.trim().toLowerCase();
  if (users.some(x => x.email === email)) return $('#authMsg').textContent = 'Email sudah terdaftar. Silakan masuk.';
  const u = { name: $('#rName').value.trim(), email, pass: $('#rPass').value };
  users.push(u); LS.set('cs_users', users); start(u);
};
function start(u) {
  me = u; LS.set('cs_session', u);
  db = LS.get('cs_data_' + u.email, null);
  if (!db) { db = { nodes: [], log: [], backup: true }; log('Akun dibuat', u.name); save() }
  log('Masuk ke CloudSave', u.name); save();
  $('#auth').hidden = true; $('#app').hidden = false; cwd = null; go('dashboard');
}
function logout() { LS.set('cs_session', null); me = null; location.reload() }

/* ---------- NAV ---------- */
$$('nav a').forEach(a => a.onclick = () => { cwd = null; $('#search').value = ''; go(a.dataset.v); $('#side').classList.remove('open') });
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#upBtn').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => { upload([...e.target.files]); e.target.value = '' };
$('#search').oninput = () => { if (view !== 'files') go('files'); else render() };

function go(v) { view = v; $$('nav a').forEach(a => a.classList.toggle('active', a.dataset.v === v)); render() }
function used() { return db.nodes.reduce((s, n) => s + (n.size || 0), 0) }

function render() {
  const q = used(), p = Math.min(100, q / QUOTA * 100);
  $('#qBar').style.width = p + '%';
  $('#qText').textContent = `${fmt(q)} dari ${fmt(QUOTA)} terpakai`;
  $('#view').innerHTML = ({ dashboard, files, shared, history, profile })[view]();
  bind();
}

/* ---------- VIEWS ---------- */
function dashboard() {
  const f = db.nodes.filter(n => n.type === 'file'), d = db.nodes.filter(n => n.type === 'dir');
  const recent = [...f].sort((a, b) => b.date - a.date).slice(0, 5);
  return `<h2>Halo, ${esc(me.name.split(' ')[0])}</h2><p class="sub">Ringkasan penyimpanan online Anda.</p>
  <div class="stats">
    <div class="card stat"><span>Total file</span><b>${f.length}</b></div>
    <div class="card stat"><span>Folder</span><b>${d.length}</b></div>
    <div class="card stat"><span>Dibagikan</span><b>${f.filter(x => x.shared).length}</b></div>
    <div class="card stat"><span>Ruang terpakai</span><b>${fmt(used())}</b></div>
  </div>
  <div class="card switch"><div><b>Backup otomatis</b><br><span class="sub" style="margin:0">Salinan file disimpan otomatis setiap kali Anda mengunggah.</span></div>
    <button class="btn small ${db.backup ? '' : 'ghost'}" data-act="backup">${db.backup ? 'Aktif' : 'Nonaktif'}</button></div>
  <h2 style="font-size:18px">File terbaru</h2>
  ${recent.length ? table(recent, true) : '<div class="card empty">Belum ada file. Klik "Unggah file" untuk memulai.</div>'}`;
}

function files() {
  const q = $('#search').value.trim().toLowerCase();
  let list = q ? db.nodes.filter(n => n.name.toLowerCase().includes(q)) : db.nodes.filter(n => n.parent === cwd);
  list.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  let crumb = '<a data-open="">File Saya</a>', c = cwd, path = [];
  while (c) { const n = db.nodes.find(x => x.id === c); if (!n) break; path.unshift(n); c = n.parent }
  path.forEach(n => crumb += ` / <a data-open="${n.id}">${esc(n.name)}</a>`);
  return `<h2>File Saya</h2>
  <div class="bar-row"><div class="crumb">${q ? `Hasil pencarian "${esc(q)}"` : crumb}</div>
    <button class="btn small ghost" data-act="mkdir">+ Folder baru</button></div>
  <div class="drop" id="drop">Seret file ke sini atau klik untuk memilih (maks. 1,5 MB per file pada prototype)</div>
  ${list.length ? table(list) : `<div class="card empty">${q ? 'Tidak ada file yang cocok.' : 'Folder ini kosong.'}</div>`}`;
}

function shared() {
  const l = db.nodes.filter(n => n.shared);
  return `<h2>Dibagikan</h2><p class="sub">File yang memiliki tautan berbagi.</p>
  ${l.length ? table(l, true) : '<div class="card empty">Belum ada file yang dibagikan.</div>'}`;
}

function history() {
  return `<h2>Riwayat Aktivitas</h2><p class="sub">Semua aktivitas dicatat untuk keperluan audit.</p>
  <div class="tbl"><table><tr><th>Waktu</th><th>Aktivitas</th><th>Objek</th></tr>
  ${db.log.map(l => `<tr><td>${when(l.t)}</td><td>${esc(l.a)}</td><td>${esc(l.n)}</td></tr>`).join('')}</table></div>`;
}

function profile() {
  return `<h2>Profil</h2><p class="sub">Kelola informasi akun Anda.</p>
  <div class="card prof"><div class="avatar">${esc(me.name[0].toUpperCase())}</div>
    <label>Nama<input id="pName" value="${esc(me.name)}"></label>
    <label>Email<input value="${esc(me.email)}" disabled></label>
    <span class="tag">Data terenkripsi (simulasi)</span>
    <div class="acts"><button class="btn small" data-act="saveProf">Simpan perubahan</button>
    <button class="btn small ghost" data-act="logout">Keluar</button></div></div>`;
}

function table(list, flat) {
  return `<div class="tbl"><table><tr><th>Nama</th><th class="hide-m">Ukuran</th><th class="hide-m">Diubah</th><th>Aksi</th></tr>
  ${list.map(n => `<tr><td><div class="name ${n.type === 'dir' ? 'dir' : ''}" ${n.type === 'dir' ? `data-open="${n.id}"` : ''}>
    <span class="ico ${n.type === 'dir' ? 'dir' : ''}">${n.type === 'dir' ? 'DIR' : ext(n.name)}</span>${esc(n.name)}${n.shared ? ' <span class="tag">Dibagikan</span>' : ''}</div></td>
    <td class="hide-m">${n.type === 'dir' ? '-' : fmt(n.size)}</td><td class="hide-m">${when(n.date)}</td>
    <td><div class="acts">${n.type === 'file' ? `<button data-dl="${n.id}">Unduh</button><button data-share="${n.id}">Bagikan</button>` : ''}
    <button data-ren="${n.id}">Ubah nama</button><button class="del" data-del="${n.id}">Hapus</button></div></td></tr>`).join('')}</table></div>`;
}

/* ---------- ACTIONS ---------- */
function bind() {
  $$('[data-open]').forEach(a => a.onclick = () => { $('#search').value = ''; cwd = a.dataset.open || null; go('files') });
  $$('[data-dl]').forEach(b => b.onclick = () => download(b.dataset.dl));
  $$('[data-share]').forEach(b => b.onclick = () => share(b.dataset.share));
  $$('[data-ren]').forEach(b => b.onclick = () => rename(b.dataset.ren));
  $$('[data-del]').forEach(b => b.onclick = () => remove(b.dataset.del));
  $$('[data-act]').forEach(b => b.onclick = () => ({ backup, mkdir, logout, saveProf })[b.dataset.act]());
  const d = $('#drop');
  if (d) {
    d.onclick = () => $('#fileIn').click();
    d.ondragover = e => { e.preventDefault(); d.classList.add('over') };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); upload([...e.dataTransfer.files]) };
  }
}

function upload(fs) {
  let n = 0, skip = 0, pending = fs.length;
  if (!pending) return;
  fs.forEach(f => {
    if (f.size > MAX_FILE) { skip++; if (!--pending) done(); return }
    if (used() + f.size > QUOTA) { skip++; if (!--pending) done(); return }
    const r = new FileReader();
    r.onload = () => {
      let name = f.name; const parent = cwd;
      if (db.nodes.some(x => x.parent === parent && x.name === name)) name = `${Date.now() % 1000}_${name}`;
      db.nodes.push({ id: uid(), type: 'file', name, parent, size: f.size, data: r.result, date: Date.now(), shared: false });
      log('Unggah file', name); n++;
      if (!--pending) done();
    };
    r.readAsDataURL(f);
  });
  function done() {
    save(); if (view !== 'files') view = 'files'; go(view);
    toast(n ? `${n} file berhasil diunggah${db.backup ? ' dan dicadangkan' : ''}.` : 'Tidak ada file diunggah.');
    if (skip) setTimeout(() => toast(`${skip} file dilewati: melebihi 1,5 MB atau kuota penuh.`), 2600);
  }
}

function download(id) {
  const n = db.nodes.find(x => x.id === id); if (!n) return;
  const a = document.createElement('a'); a.href = n.data; a.download = n.name; a.click();
  log('Unduh file', n.name); save(); toast('Mengunduh ' + n.name);
}

function ask(title, label, val, ok, cb) {
  const f = $('#dlgForm');
  f.innerHTML = `<h3>${title}</h3>${label ? `<label>${label}<input id="dIn" value="${esc(val || '')}" autocomplete="off"></label>` : ''}
  <div class="dlg-act"><button class="btn ghost" value="x">Batal</button><button class="btn ${ok === 'Hapus' ? 'danger' : ''}" value="ok">${ok}</button></div>`;
  $('#dlg').showModal();
  f.onsubmit = e => { if (e.submitter && e.submitter.value === 'ok') { const v = $('#dIn') ? $('#dIn').value.trim() : true; if (v) cb(v) } };
}

function mkdir() {
  ask('Folder baru', 'Nama folder', '', 'Buat', v => {
    db.nodes.push({ id: uid(), type: 'dir', name: v, parent: cwd, date: Date.now() });
    log('Buat folder', v); save(); render(); toast('Folder dibuat.');
  });
}
function rename(id) {
  const n = db.nodes.find(x => x.id === id);
  ask('Ubah nama', 'Nama baru', n.name, 'Simpan', v => {
    log(`Ubah nama ${n.name} menjadi`, v); n.name = v; n.date = Date.now(); save(); render(); toast('Nama diubah.');
  });
}
function remove(id) {
  const n = db.nodes.find(x => x.id === id);
  ask(`Hapus "${esc(n.name)}"?`, '', '', 'Hapus', () => {
    const ids = new Set([id]); let ch = true;
    while (ch) { ch = false; db.nodes.forEach(x => { if (ids.has(x.parent) && !ids.has(x.id)) { ids.add(x.id); ch = true } }) }
    db.nodes = db.nodes.filter(x => !ids.has(x.id));
    log(n.type === 'dir' ? 'Hapus folder' : 'Hapus file', n.name); save(); render(); toast('Berhasil dihapus.');
  });
}
function share(id) {
  const n = db.nodes.find(x => x.id === id);
  n.shared = true; n.link = n.link || `https://cloudsave.id/s/${uid()}`;
  log('Bagikan file', n.name); save();
  const f = $('#dlgForm');
  f.innerHTML = `<h3>Bagikan file</h3><label>Tautan berbagi untuk ${esc(n.name)}<input id="dIn" value="${n.link}" readonly></label>
  <div class="dlg-act"><button class="btn ghost" value="x">Tutup</button><button class="btn" value="copy">Salin tautan</button></div>`;
  $('#dlg').showModal();
  f.onsubmit = e => { if (e.submitter.value === 'copy') { navigator.clipboard?.writeText(n.link); toast('Tautan disalin.') } };
  render();
}
function backup() { db.backup = !db.backup; log('Backup otomatis', db.backup ? 'Aktif' : 'Nonaktif'); save(); render() }
function saveProf() {
  const v = $('#pName').value.trim(); if (!v) return toast('Nama tidak boleh kosong.');
  me.name = v; const u = users.find(x => x.email === me.email); u.name = v;
  LS.set('cs_users', users); LS.set('cs_session', me); log('Ubah profil', v); save(); render(); toast('Profil disimpan.');
}

/* auto-login jika sesi masih ada */
if (me && users.some(u => u.email === me.email)) start(users.find(u => u.email === me.email));