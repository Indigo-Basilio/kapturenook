// netlify/functions/admin-bookings.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // server-only service role
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-admin-password'
  };
}
function respond(status, body){
  return { statusCode: status, headers: { 'Content-Type':'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };

    // auth: require header x-admin-password to match ADMIN_PASSWORD
    const headers = event.headers || {};
    const provided = headers['x-admin-password'] || headers['X-Admin-Password'] || '';
    if (!ADMIN_PASSWORD || provided !== ADMIN_PASSWORD) {
      return respond(401, { error: 'Unauthorized' });
    }

    // GET: return all bookings (optionally filter by ?date=YYYY-MM-DD or ?limit=N)
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      let query = supabase.from('bookings').select('*');
      if (q.date) query = query.eq('date', q.date);
      if (q.limit) query = query.limit(Number(q.limit));
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) return respond(500, { error: error.message });
      return respond(200, data);
    }

    // DELETE: ?id=<uuid>
    if (event.httpMethod === 'DELETE') {
      const q = event.queryStringParameters || {};
      const id = q.id;
      if (!id) return respond(400, { error: 'id is required' });
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) return respond(500, { error: error.message });
      return respond(200, { ok: true });
    }

    // PATCH: update status or other fields (body: { id: '...', status: 'attended' })
    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return respond(400, { error: 'id is required' });
      const update = {};
      if (body.status) update.status = body.status;
      if (body.notes !== undefined) update.notes = body.notes;
      const { data, error } = await supabase.from('bookings').update(update).eq('id', body.id).select().single();
      if (error) return respond(500, { error: error.message });
      return respond(200, data);
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return respond(500, { error: String(err) });
  }
}
