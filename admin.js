// admin.js
const API = '/api/admin-bookings'; // Netlify function endpoint
const el = id => document.getElementById(id);
const btnLogin = el('btnLogin');
const btnLogout = el('btnLogout');
const adminPasswordInput = el('adminPassword');
const adminPanel = el('adminPanel');
const bookingsTable = el('bookingsTable');
const messageEl = el('message');
const statsEl = el('stats');
const qInput = el('q');
const btnReload = el('btnReload');

function showMessage(txt, type='info', timeout=4000){
  messageEl.textContent = txt;
  messageEl.style.background = type === 'error' ? '#3b0f0f' : '#062f1a';
  messageEl.classList.remove('hidden');
  setTimeout(()=> messageEl.classList.add('hidden'), timeout);
}

function authHeaders(){
  const t = sessionStorage.getItem('KaptureAdminToken');
  if(!t) return {};
  return { 'x-admin-password': t, 'Content-Type': 'application/json' };
}

async function signIn(){
  const pwd = adminPasswordInput.value.trim();
  if(!pwd) { showMessage('Enter admin password', 'error'); return; }
  // Try a test call to verify password
  try {
    const res = await fetch(API + '?limit=1', { headers: { 'x-admin-password': pwd } });
    if (res.status === 401) {
      showMessage('Invalid admin password', 'error'); return;
    }
    // success
    sessionStorage.setItem('KaptureAdminToken', pwd);
    adminPanel.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    btnLogin.classList.add('hidden');
    adminPasswordInput.value = '';
    loadBookings();
    showMessage('Signed in', 'info');
  } catch (err){
    console.error(err);
    showMessage('Sign in failed', 'error');
  }
}

function signOut(){
  sessionStorage.removeItem('KaptureAdminToken');
  adminPanel.classList.add('hidden');
  btnLogout.classList.add('hidden');
  btnLogin.classList.remove('hidden');
  bookingsTable.innerHTML = '';
  statsEl.textContent = '';
  showMessage('Signed out', 'info');
}

btnLogin.addEventListener('click', signIn);
btnLogout.addEventListener('click', signOut);
btnReload.addEventListener('click', loadBookings);
qInput.addEventListener('input', () => {
  // simple client-side filtering of shown bookings
  const q = qInput.value.trim().toLowerCase();
  Array.from(bookingsTable.children).forEach(row => {
    if(!q) row.style.display = '';
    else {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    }
  });
});

async function loadBookings(){
  bookingsTable.innerHTML = 'Loading…';
  statsEl.textContent = '';
  try {
    const hdr = authHeaders();
    const res = await fetch(API, { headers: hdr });
    if (res.status === 401) {
      showMessage('Unauthorized — bad admin password', 'error');
      signOut();
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderBookings(data);
    statsEl.textContent = `${data.length} bookings`;
  } catch(err){
    console.error(err);
    bookingsTable.innerHTML = 'Could not load bookings.';
    showMessage('Failed to load bookings', 'error');
  }
}

function renderBookings(list){
  bookingsTable.innerHTML = '';
  if(!list || list.length === 0) {
    bookingsTable.textContent = 'No bookings found.';
    return;
  }
  // newest first
  list.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  for(const bk of list){
    const row = document.createElement('div');
    row.className = 'booking-row';
    row.innerHTML = `
      <div class="booking-left">
        <div><strong>${escapeHtml(bk.service)}</strong> — ${escapeHtml(bk.date)} @ ${escapeHtml(bk.time)}</div>
        <div class="booking-meta">${escapeHtml(bk.name)} · ${escapeHtml(bk.email)} ${bk.phone ? '· ' + escapeHtml(bk.phone) : ''}</div>
        <div class="booking-meta">${escapeHtml(bk.notes || '')}</div>
      </div>
      <div class="booking-actions">
        <select class="select-status">
          <option value="pending">pending</option>
          <option value="confirmed">confirmed</option>
          <option value="attended">attended</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button class="btn-outline btn-delete">Delete</button>
      </div>
    `;
    // attach status
    const sel = row.querySelector('.select-status');
    sel.value = bk.status || 'pending';
    sel.addEventListener('change', () => updateStatus(bk.id, sel.value, row));
    // delete
    const btnDel = row.querySelector('.btn-delete');
    btnDel.addEventListener('click', () => deleteBooking(bk.id, row));
    bookingsTable.appendChild(row);
  }
}

async function updateStatus(id, status, rowEl){
  const hdr = authHeaders();
  try {
    const res = await fetch(API, {
      method: 'PATCH',
      headers: hdr,
      body: JSON.stringify({ id, status })
    });
    if (res.status === 401) { showMessage('Unauthorized', 'error'); signOut(); return; }
    if(!res.ok) throw new Error(await res.text());
    showMessage('Status updated', 'info');
    // optionally update UI (no change needed)
  } catch(err){
    console.error(err);
    showMessage('Failed to update status', 'error');
  }
}

async function deleteBooking(id, rowEl){
  if(!confirm('Delete this booking? This action cannot be undone.')) return;
  const hdr = authHeaders();
  try {
    const res = await fetch(API + `?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: hdr });
    if (res.status === 401) { showMessage('Unauthorized', 'error'); signOut(); return; }
    if(!res.ok) throw new Error(await res.text());
    // remove row
    rowEl.remove();
    showMessage('Booking deleted', 'info');
    // refresh stats
    const remaining = bookingsTable.children.length;
    statsEl.textContent = `${remaining} bookings`;
  } catch(err){
    console.error(err);
    showMessage('Failed to delete booking', 'error');
  }
}

// helper to escape text in HTML
function escapeHtml(s=''){ return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;', '`':'&#96;'})[c]); }

// bootstrap: if token exists try to load
if(sessionStorage.getItem('KaptureAdminToken')) {
  adminPanel.classList.remove('hidden');
  btnLogout.classList.remove('hidden');
  btnLogin.classList.add('hidden');
  loadBookings();
}
