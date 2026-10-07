/* CloudSave + Supabase */
const CFG = { url: 'https://qrrlfduhgvsdnkjvozuo.supabase.co', key: 'sb_publishable_2fwxtv-2FGDGUBop8sDK6g_M4_9ypEm' };
const sb = supabase.createClient(CFG.url, CFG.key);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const QUOTA = 1024 * 1048576, MAX = 10 * 1048576;
let me, nodes = [], logs = [], view = 'dashboard', cwd = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const when = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const ext = n => (n.includes('.') ? n.split('.').pop() : 'FILE').slice(0, 4).toUpperCase();
const isImg = n => /\.(jpe?g|png|gif|webp|svg)$/i.test(n);
const used = () => nodes.reduce((s, n) => s + (n.size || 0), 0);
const uname = () => me.user_metadata?.name || me.email;
const urlOf = n => sb.storage.from('files').getPublicUrl(n.path).data.publicUrl;
const find = id => nodes.find(x => x.id === id);
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2800) }
const msg = (m, ok) => { const e = $('#authMsg'); e.textContent = m; e.style.color = ok ? '#1b8a4b' : '#c62828' };
const log = (a, o) => sb.from('logs').insert({ action: a, object: o });
async function load() {
  const [n, l] = await Promise.all([sb.from('nodes').select('*').order('created_at', { ascending: false }),
    sb.from('logs').select('*').order('created_at', { ascending: false }).limit(100)]);
  nodes = n.data || []; logs = l.data || [];
}
async function reload() { await load(); render() }
async function dl(url, name) {
  const b = await (await fetch(url)).blob(), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ---------- AUTH ---------- */
const authTab = l => { $('#formLogin').hidden = !l; $('#formReg').hidden = l; msg(''); $('#tabLogin').classList.toggle('active', l); $('#tabReg').classList.toggle('active', !l) };
$('#tabLogin').onclick = () => authTab(true); $('#tabReg').onclick = () => authTab(false);
$('#formLogin').onsubmit = async e => {
  e.preventDefault(); msg('Memproses...', 1);
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPass').value });
  if (error) return msg(/not confirmed/i.test(error.message) ? 'Email belum dikonfirmasi. Cek kotak masuk email Anda.' : 'Email atau kata sandi salah.');
  await enter(data.user); log('Masuk ke CloudSave', uname());
};
$('#formReg').onsubmit = async e => {
  e.preventDefault(); msg('Memproses...', 1);
  const { data, error } = await sb.auth.signUp({ email: $('#rEmail').value.trim(), password: $('#rPass').value, options: { data: { name: $('#rName').value.trim() } } });
  if (error) return msg(error.message);
  if (!data.session) { authTab(true); return msg('Akun dibuat. Konfirmasi email Anda, lalu masuk.', 1) }
  await enter(data.user); log('Akun dibuat', uname());
};
async function enter(u) {
  me = u; $('#auth').hidden = true; $('#app').hidden = false; cwd = null;
  await load(); go('dashboard');
}

/* ---------- NAV ---------- */
$$('nav a').forEach(a => a.onclick = () => { cwd = null; $('#search').value = ''; go(a.dataset.v); $('#side').classList.remove('open') });
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#upBtn').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => { upload([...e.target.files]); e.target.value = '' };
$('#search').oninput = () => view !== 'files' ? go('files') : render();
function go(v) { view = v; $$('nav a').forEach(a => a.classList.toggle('active', a.dataset.v === v)); render() }
function render() {
  const q = used(); $('#qBar').style.width = Math.min(100, q / QUOTA * 100) + '%';
  $('#qText').textContent = `${fmt(q)} dari ${fmt(QUOTA)} terpakai`;
  $('#view').innerHTML = V[view](); bind();
}

/* ---------- VIEWS ---------- */
const V = {
  dashboard() {
    const f = nodes.filter(n => n.type === 'file'), rec = f.slice(0, 5);
    return `<h2>Halo, ${esc(uname().split(' ')[0])}</h2><p class="sub">Ringkasan penyimpanan online Anda. Data tersimpan di cloud dan sama di semua perangkat.</p>
    <div class="stats"><div class="card stat"><span>Total file</span><b>${f.length}</b></div>
    <div class="card stat"><span>Folder</span><b>${nodes.filter(n => n.type === 'dir').length}</b></div>
    <div class="card stat"><span>Dibagikan</span><b>${f.filter(n => n.shared).length}</b></div>
    <div class="card stat"><span>Ruang terpakai</span><b>${fmt(used())}</b></div></div>
    <h2 style="font-size:18px">File terbaru</h2>
    ${rec.length ? table(rec) : '<div class="card empty">Belum ada file. Klik "Unggah file" untuk memulai.</div>'}`;
  },
  files() {
    const q = $('#search').value.trim().toLowerCase();
    const l = (q ? nodes.filter(n => n.name.toLowerCase().includes(q)) : nodes.filter(n => n.parent === cwd))
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
    let crumb = '<a data-open="">File Saya</a>', c = cwd, p = [];
    while (c) { const n = find(c); if (!n) break; p.unshift(n); c = n.parent }
    p.forEach(n => crumb += ` / <a data-open="${n.id}">${esc(n.name)}</a>`);
    return `<h2>File Saya</h2><div class="bar-row"><div class="crumb">${q ? `Hasil pencarian "${esc(q)}"` : crumb}</div>
    <button class="btn small ghost" data-act="mkdir">+ Folder baru</button></div>
    <div class="drop" id="drop">Seret file ke sini atau klik untuk memilih (maks. 10 MB per file)</div>
    ${l.length ? table(l) : `<div class="card empty">${q ? 'Tidak ada file yang cocok.' : 'Folder ini kosong.'}</div>`}`;
  },
  shared() {
    const l = nodes.filter(n => n.shared);
    return `<h2>Dibagikan</h2><p class="sub">File yang memiliki tautan berbagi aktif.</p>${l.length ? table(l) : '<div class="card empty">Belum ada file yang dibagikan.</div>'}`;
  },
  history() {
    return `<h2>Riwayat Aktivitas</h2><p class="sub">Semua aktivitas dicatat untuk keperluan audit.</p>
    <div class="tbl"><table><tr><th>Waktu</th><th>Aktivitas</th><th>Objek</th></tr>
    ${logs.map(l => `<tr><td>${when(l.created_at)}</td><td>${esc(l.action || '')}</td><td>${esc(l.object || '')}</td></tr>`).join('')}</table></div>`;
  },
  profile() {
    return `<h2>Profil</h2><p class="sub">Kelola akun Anda.</p><div class="prof">
    <div class="card prof"><div class="avatar">${esc(uname()[0].toUpperCase())}</div>
    <label>Nama<input id="pName" value="${esc(me.user_metadata?.name || '')}"></label>
    <label>Email<input value="${esc(me.email)}" disabled></label>
    <button class="btn small" data-act="saveProf">Simpan nama</button></div>
    <div class="card prof"><label>Kata sandi baru (min. 6)<input type="password" id="nPw"></label>
    <button class="btn small ghost" data-act="pw">Ubah kata sandi</button>
    <button class="btn small danger" data-act="logout">Keluar</button></div></div>`;
  }
};
function table(l) {
  return `<div class="tbl"><table><tr><th>Nama</th><th class="hide-m">Ukuran</th><th class="hide-m">Dibuat</th><th>Aksi</th></tr>
  ${l.map(n => `<tr><td><div class="name ${n.type === 'dir' ? 'dir' : ''}" ${n.type === 'dir' ? `data-open="${n.id}"` : `data-pv="${n.id}"`}>
  <span class="ico ${n.type === 'dir' ? 'dir' : ''}">${n.type === 'dir' ? 'DIR' : ext(n.name)}</span>${esc(n.name)}${n.shared ? ' <span class="tag">Dibagikan</span>' : ''}</div></td>
  <td class="hide-m">${n.type === 'dir' ? '-' : fmt(n.size)}</td><td class="hide-m">${when(n.created_at)}</td>
  <td><div class="acts">${n.type === 'file' ? `<button data-dl="${n.id}">Unduh</button><button data-share="${n.id}">Bagikan</button>` : ''}
  <button data-ren="${n.id}">Ubah nama</button><button class="del" data-del="${n.id}">Hapus</button></div></td></tr>`).join('')}</table></div>`;
}

/* ---------- ACTIONS ---------- */
function ask(html, cb) { const f = $('#dlgForm'); f.innerHTML = html; $('#dlg').showModal(); f.onsubmit = e => cb(e.submitter && e.submitter.value) }
const buttons = (ok, cls = '') => `<div class="dlg-act"><button class="btn ghost" value="x">Batal</button><button class="btn ${cls}" value="ok">${ok}</button></div>`;
const A = {
  mkdir() {
    ask(`<h3>Folder baru</h3><label>Nama folder<input id="dIn" autocomplete="off"></label>${buttons('Buat')}`, async s => {
      const v = $('#dIn').value.trim(); if (s !== 'ok' || !v) return;
      const { error } = await sb.from('nodes').insert({ type: 'dir', name: v, parent: cwd });
      if (error) return toast('Gagal membuat folder.');
      log('Buat folder', v); await reload(); toast('Folder dibuat.');
    });
  },
  async saveProf() {
    const v = $('#pName').value.trim(); if (!v) return toast('Nama tidak boleh kosong.');
    const { data, error } = await sb.auth.updateUser({ data: { name: v } });
    if (error) return toast('Gagal menyimpan.'); me = data.user; log('Ubah profil', v); render(); toast('Profil disimpan.');
  },
  async pw() {
    const v = $('#nPw').value; if (v.length < 6) return toast('Kata sandi minimal 6 karakter.');
    const { error } = await sb.auth.updateUser({ password: v });
    if (error) return toast('Gagal: ' + error.message); log('Ubah kata sandi', '-'); $('#nPw').value = ''; toast('Kata sandi diubah.');
  },
  async logout() { await sb.auth.signOut(); location.href = location.pathname }
};
function kids(id) { const s = new Set([id]); let c = 1; while (c) { c = 0; nodes.forEach(x => { if (s.has(x.parent) && !s.has(x.id)) { s.add(x.id); c = 1 } }) } return nodes.filter(x => s.has(x.id)) }

function bind() {
  $$('[data-open]').forEach(a => a.onclick = () => { $('#search').value = ''; cwd = a.dataset.open || null; go('files') });
  $$('[data-act]').forEach(b => b.onclick = () => A[b.dataset.act]());
  $$('[data-dl]').forEach(b => b.onclick = async () => { const n = find(b.dataset.dl); toast('Mengunduh ' + n.name); await dl(urlOf(n), n.name); log('Unduh file', n.name) });
  $$('[data-pv]').forEach(b => b.onclick = () => { const n = find(b.dataset.pv);
    ask(`<h3>${esc(n.name)}</h3>${isImg(n.name) ? `<img src="${urlOf(n)}" alt="" style="max-width:100%;border-radius:10px">` : '<p class="sub">Pratinjau tersedia untuk gambar. Gunakan tombol Unduh.</p>'}
    <small>${fmt(n.size)} - ${when(n.created_at)}</small><div class="dlg-act"><button class="btn ghost" value="x">Tutup</button></div>`, () => { }) });
  $$('[data-ren]').forEach(b => b.onclick = () => { const n = find(b.dataset.ren);
    ask(`<h3>Ubah nama</h3><label>Nama baru<input id="dIn" value="${esc(n.name)}"></label>${buttons('Simpan')}`, async s => {
      const v = $('#dIn').value.trim(); if (s !== 'ok' || !v) return;
      const { error } = await sb.from('nodes').update({ name: v }).eq('id', n.id);
      if (error) return toast('Gagal mengubah nama.'); log(`Ubah nama ${n.name} menjadi`, v); await reload(); toast('Nama diubah.');
    }) });
  $$('[data-del]').forEach(b => b.onclick = () => { const n = find(b.dataset.del);
    ask(`<h3>Hapus "${esc(n.name)}"?</h3><p class="sub">${n.type === 'dir' ? 'Semua isi folder ikut terhapus. ' : ''}Tindakan ini tidak bisa dibatalkan.</p>${buttons('Hapus', 'danger')}`, async s => {
      if (s !== 'ok') return;
      const paths = kids(n.id).filter(x => x.path).map(x => x.path);
      if (paths.length) await sb.storage.from('files').remove(paths);
      const { error } = await sb.from('nodes').delete().eq('id', n.id);
      if (error) return toast('Gagal menghapus.'); log(n.type === 'dir' ? 'Hapus folder' : 'Hapus file', n.name); await reload(); toast('Berhasil dihapus.');
    }) });
  $$('[data-share]').forEach(b => b.onclick = () => { const n = find(b.dataset.share);
    const tk = n.token || crypto.randomUUID().replace(/-/g, '').slice(0, 12), link = `${location.origin}${location.pathname}?s=${tk}`;
    ask(`<h3>Bagikan file</h3><label>Tautan untuk ${esc(n.name)}<input id="dIn" value="${link}" readonly></label>
    <label>Hak akses<select id="acc"><option>Hanya lihat</option><option ${n.access === 'Boleh unduh' ? 'selected' : ''}>Boleh unduh</option></select></label>
    <div class="dlg-act"><button class="btn ghost" value="stop">${n.shared ? 'Hentikan berbagi' : 'Batal'}</button><button class="btn" value="ok">Aktifkan dan salin</button></div>`, async s => {
      if (s === 'ok') { await sb.from('nodes').update({ shared: true, token: tk, access: $('#acc').value }).eq('id', n.id); navigator.clipboard?.writeText(link); log('Bagikan file', n.name); toast('Tautan disalin.') }
      else if (s === 'stop' && n.shared) { await sb.from('nodes').update({ shared: false }).eq('id', n.id); log('Hentikan berbagi', n.name) }
      await reload();
    }) });
  const d = $('#drop');
  if (d) { d.onclick = () => $('#fileIn').click(); d.ondragover = e => { e.preventDefault(); d.classList.add('over') }; d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); upload([...e.dataTransfer.files]) } }
}

async function upload(fs) {
  let ok = 0, skip = 0; toast('Mengunggah...');
  for (const f of fs) {
    if (f.size > MAX || used() + f.size > QUOTA) { skip++; continue }
    const path = `${me.id}/${Date.now()}_${f.name.replace(/[^\w.\-]/g, '_')}`;
    const up = await sb.storage.from('files').upload(path, f);
    if (up.error) { skip++; continue }
    const ins = await sb.from('nodes').insert({ type: 'file', name: f.name, parent: cwd, size: f.size, path });
    if (ins.error) { await sb.storage.from('files').remove([path]); skip++; continue }
    ok++; await log('Unggah file', f.name);
  }
  await load(); view = 'files'; go('files');
  toast(ok ? `${ok} file berhasil diunggah.` : 'Tidak ada file diunggah.');
  if (skip) setTimeout(() => toast(`${skip} file dilewati: lebih dari 10 MB, kuota penuh, atau gagal.`), 2900);
}

/* ---------- HALAMAN TAUTAN BERBAGI ---------- */
async function pub(tk) {
  $('#auth').hidden = true; const p = $('#pub'); p.hidden = false; p.innerHTML = '<div class="card">Memuat...</div>';
  const c = supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: n } = await c.from('nodes').select('*').eq('token', tk).eq('shared', true).maybeSingle();
  if (!n) return p.innerHTML = '<div class="card"><h2>Tautan tidak tersedia</h2><p class="sub">File ini tidak ada atau pemiliknya sudah menghentikan berbagi.</p></div>';
  const url = c.storage.from('files').getPublicUrl(n.path).data.publicUrl, can = n.access === 'Boleh unduh';
  p.innerHTML = `<div class="card"><div class="logo">&#9729; CloudSave</div><h2>${esc(n.name)}</h2><small>${fmt(n.size)}</small>
  ${isImg(n.name) ? `<img src="${url}" alt="">` : ''}
  ${can ? '<button class="btn" id="pubDl">Unduh file</button>' : '<p class="hint">Pemilik hanya mengizinkan melihat file ini.</p>'}</div>`;
  if (can) $('#pubDl').onclick = () => dl(url, n.name);
}

/* ---------- MULAI ---------- */
(async () => {
  const tk = new URLSearchParams(location.search).get('s');
  if (tk) return pub(tk);
  if (CFG.key.startsWith('PASTE')) return msg('Isi CFG.key di script.js dengan Publishable key Supabase.');
  const { data } = await sb.auth.getSession();
  if (data.session) enter(data.session.user);
})();