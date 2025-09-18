// netlify/functions/bookings.mjs
// ESM Netlify Function
import { createClient } from '@supabase/supabase-js';
import Resend from 'resend';

// env vars (set these in Netlify UI)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role key recommended (server-only)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Kapture Nook <studio@kapturenook.com>';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials');
}
if (!RESEND_API_KEY) {
  console.error('Missing Resend API key');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const resend = new Resend(RESEND_API_KEY);

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders(), body: '' };
    }

    if (event.httpMethod === 'GET') {
      // optional: filter by date if query param provided
      const params = event.queryStringParameters || {};
      let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
      if (params.date) query = query.eq('date', params.date);
      const { data, error } = await query;
      if (error) return respond(500, { error: error.message });

      // return data
      return respond(200, data);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      // basic server-side validation
      const required = ['name','email','service','date','time'];
      for (const r of required) {
        if (!body[r]) return respond(400, { error: `${r} is required` });
      }

      // check double booking: same date & time
      const { data: existing, error: existErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', body.date)
        .eq('time', body.time)
        .limit(1);

      if (existErr) return respond(500, { error: existErr.message });
      if (existing && existing.length > 0) {
        return respond(409, { error: 'That time slot is already booked.' });
      }

      // insert booking
      const insert = {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        notes: body.notes || null,
        service: body.service,
        price: body.price || 0,
        date: body.date, // date in YYYY-MM-DD
        time: body.time, // time string HH:mm
        timezone: body.timezone || null,
      };

      const { data, error } = await supabase.from('bookings').insert([insert]).select().single();
      if (error) return respond(500, { error: error.message });

      // send confirmation email via Resend
      try {
        const html = `
          <div style="font-family:Inter,system-ui,Arial,sans-serif;color:#021026">
            <h2>Thanks for booking with Kapture Nook Studio!</h2>
            <p><strong>Service:</strong> ${escapeHtml(data.service)}</p>
            <p><strong>Date & time:</strong> ${escapeHtml(data.date)} @ ${escapeHtml(data.time)} (${escapeHtml(data.timezone || 'local')})</p>
            <p>We look forward to seeing you! Quack your Best Pose! 🦆</p>
            <hr/>
            <p style="font-size:0.9rem;color:#6b7280">If you have questions, reply to this email or contact hello@kapturenook.example</p>
          </div>
        `;

        await resend.emails.send({
          from: FROM_EMAIL,
          to: data.email,
          subject: 'Kapture Nook — Booking confirmation',
          html
        });

        // optional: send admin notification (uncomment if desired)
        // await resend.emails.send({ from: FROM_EMAIL, to: 'studio@kapturenook.example', subject: 'New booking', html: `<pre>${JSON.stringify(data, null, 2)}</pre>` });
      } catch (emailErr) {
        console.warn('Email failed:', emailErr);
        // continue — booking was saved; return 200 but inform client email failed
        return respond(200, { ...data, warning: 'Booking saved but confirmation email failed.' });
      }

      return respond(200, data);
    }

    return respond(405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message || String(err) });
  }
}

/* helpers */
function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function respond(statusCode, bodyObj){
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(bodyObj)
  };
}
function escapeHtml(s=''){
  return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;', '`':'&#96;'})[c]);
}
