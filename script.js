// script.js (module)
import { Calendar } from 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';

const LS_TEMP = 'kapture_temp'; // optional local fallback
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
document.getElementById('tzLabel').textContent = tz;
document.getElementById('year').textContent = new Date().getFullYear();

// elements
const slotListEl = document.getElementById('slotList');
const selectedServiceEl = document.getElementById('selectedService');
const confirmBtn = document.getElementById('confirmBooking');
const clearBtn = document.getElementById('clearSelection');
const bookingForm = document.getElementById('bookingForm');
const bookingResult = document.getElementById('bookingResult');
const bookingsListEl = document.getElementById('bookingsList');
const exportBtn = document.getElementById('exportBookings');

let selected = { service: null, price: null, dateISO: null, slot: null }; // dateISO: 'YYYY-MM-DD', slot: 'HH:mm'

// simple helper
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

/* ---------- Calendar ---------- */
const calendarEl = document.getElementById('calendar');
let calendar;

async function fetchEvents(info, successCallback, failureCallback) {
  try {
    const res = await fetch('/api/bookings');
    if (!res.ok) throw new Error('Failed to fetch bookings');
    const data = await res.json();
    // Map bookings to FullCalendar events (all-day = false)
    const events = data.map(b => {
      // construct ISO datetime in local timezone by combining date + time.
      // server returns start_iso with timezone offset if possible. But here we create local ISO by merging.
      const start = `${b.date}T${b.time}`;
      return {
        id: b.id,
        title: b.service,
        start,
        extendedProps: { raw: b }
      };
    });
    successCallback(events);
  } catch (err) {
    console.error(err);
    failureCallback(err);
  }
}

function initCalendar() {
  calendar = new Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    timeZone: 'local',
    events: fetchEvents,
    dateClick(info) {
      // when user clicks a date, set selected.dateISO and render slots for that date
      selected.dateISO = info.dateStr;
      renderSlotsForDate(info.dateStr);
      // scroll to slot list smoothly
      slotListEl.scrollIntoView({behavior:'smooth', block:'center'});
      updateConfirmState();
    }
  });
  calendar.render();
}
initCalendar();

/* ---------- Slots ---------- */
const SLOT_START = 9; // 09:00
const SLOT_END = 17;  // last slot 16:00 (we create slots 9..16)
function allSlots(){
  const slots = [];
  for(let h=SLOT_START; h < SLOT_END; h++){
    slots.push(`${String(h).padStart(2,'0')}:00`);
  }
  return slots;
}

async function renderSlotsForDate(dateISO){
  slotListEl.innerHTML = '';
  // fetch server bookings for this date to know which time slots are taken
  let bookedTimes = [];
  try {
    const res = await fetch(`/api/bookings?date=${encodeURIComponent(dateISO)}`);
    const data = await res.ok ? await res.json() : [];
    bookedTimes = data.map(b => b.time);
  } catch(e) {
    console.warn('Could not fetch bookings for date:', e);
  }

  // also disallow past times if date is today
  const now = new Date();
  const todayISO = now.toISOString().slice(0,10);

  allSlots().forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.type = 'button';
    btn.textContent = s;
    btn.dataset.time = s;

    let disabled = false;
    if (dateISO === todayISO) {
      const [hh,mm] = s.split(':').map(Number);
      const slotDate = new Date();
      slotDate.setHours(hh,mm,0,0);
      if (slotDate <= now) disabled = true;
    }

    if (bookedTimes.includes(s)) {
      btn.dataset.state = 'booked';
      btn.disabled = true;
    } else if (disabled) {
      btn.dataset.state = 'booked';
      btn.disabled = true;
    } else {
      btn.dataset.state = 'available';
      btn.addEventListener('click', ()=> selectSlot(s, btn));
    }
    slotListEl.appendChild(btn);
  });
}

function selectSlot(time, btnEl){
  $$('.slot-btn', slotListEl).forEach(b=> b.classList.remove('active'));
  btnEl.classList.add('active');
  selected.slot = time;
  updateConfirmState();
}

/* ---------- Services selection ---------- */
$$('.select-service').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    selected.service = btn.dataset.service;
    selected.price = Number(btn.dataset.price || 0);
    selectedServiceEl.textContent = `${selected.service} — ₱${selected.price.toLocaleString()}`;
    // if calendar has a focused date, render slots for that day; otherwise jump to today
    const focusedDate = calendar.getDate();
    const iso = focusedDate.toISOString().slice(0,10);
    selected.dateISO = iso;
    renderSlotsForDate(iso);
    updateConfirmState();
  });
});

/* ---------- Booking create (POST to /api/bookings) ---------- */

function updateConfirmState(){
  const ok = selected.service && selected.dateISO && selected.slot;
  confirmBtn.disabled = !ok;
}

clearBtn.addEventListener('click', ()=>{
  selected = { service:null, price:null, dateISO:null, slot:null };
  selectedServiceEl.textContent = '— Choose a service —';
  slotListEl.innerHTML = '';
  $$('.date-selected')?.forEach(e => e.classList.remove('date-selected'));
  updateConfirmState();
});

function showError(input, message){
  const err = input.parentElement.querySelector('.error');
  if(err) err.textContent = message;
  input.setAttribute('aria-invalid','true');
}
function clearError(input){
  const err = input.parentElement.querySelector('.error');
  if(err) err.textContent = '';
  input.removeAttribute('aria-invalid');
}

async function createBookingAPI(payload) {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || 'Booking failed');
  }
  return res.json();
}

bookingForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  bookingResult.textContent = '';
  // form fields
  const name = $('#bk_name'); const email = $('#bk_email'); const phone = $('#bk_phone'); const notes = $('#bk_notes');

  // simple validation
  let ok = true;
  if(!selected.service){ bookingResult.textContent = 'Pick a service & date/time.'; ok = false; }
  if(!name.value.trim() || name.value.trim().length < 2){ showError(name, 'Enter a name (2+ chars).'); ok=false; } else clearError(name);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRe.test(email.value.trim())){ showError(email, 'Enter a valid email.'); ok=false; } else clearError(email);
  if(!ok) return;

  const payload = {
    name: name.value.trim(),
    email: email.value.trim(),
    phone: phone.value.trim(),
    notes: notes.value.trim(),
    service: selected.service,
    price: selected.price || 0,
    date: selected.dateISO,
    time: selected.slot,
    timezone: tz
  };

  // call server
  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirming...';

    const saved = await createBookingAPI(payload);
    // refresh calendar events & bookings list
    calendar.refetchEvents();
    await loadBookingsList();

    bookingResult.textContent = `✅ Booked: ${saved.service} — ${saved.date} @ ${saved.time}. Confirmation sent to ${saved.email}`;
    bookingResult.style.color = 'var(--muted)';

    bookingForm.reset();
    selected = { service:null, price:null, dateISO:null, slot:null };
    selectedServiceEl.textContent = '— Choose a service —';
    slotListEl.innerHTML = '';
    updateConfirmState();
  } catch(err) {
    console.error(err);
    bookingResult.textContent = `❌ ${err.message}`;
    bookingResult.style.color = '#ffb4b4';
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Booking';
  }
});

/* ---------- Bookings list & export ---------- */
async function loadBookingsList(){
  try {
    const res = await fetch('/api/bookings');
    const data = await res.ok ? await res.json() : [];
    renderBookingsList(data);
  } catch(err) {
    console.warn(err);
    bookingsListEl.textContent = 'Could not load bookings.';
  }
}
function renderBookingsList(arr){
  if(!arr || arr.length === 0){ bookingsListEl.textContent = 'No bookings yet.'; return; }
  bookingsListEl.innerHTML = '';
  arr.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at)).forEach(bk=>{
    const div = document.createElement('div');
    div.className = 'booking-row';
    div.innerHTML = `<div><strong>${bk.service}</strong> — ${bk.date} @ ${bk.time}</div>
      <div style="font-size:0.9rem;color:var(--muted)">${bk.name} · ${bk.email}${bk.phone ? ' · ' + bk.phone : ''}</div>`;
    bookingsListEl.appendChild(div);
  });
}

exportBtn.addEventListener('click', async ()=>{
  try {
    const res = await fetch('/api/bookings');
    if(!res.ok) throw new Error('Export failed');
    const data = await res.json();
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = `kapture_bookings_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch(e){
    alert('Export failed: ' + e.message);
  }
});

/* ---------- Init ---------- */
loadBookingsList();
updateConfirmState();

/* ---------- Theme toggle (simple) ---------- */
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', current);
});
