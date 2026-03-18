/**
 * db.js — Supabase client singleton
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

const missingEnv = [];
if (!url) missingEnv.push('SUPABASE_URL');
if (!key) missingEnv.push('SUPABASE_SERVICE_KEY');

const supabase = missingEnv.length === 0 ? createClient(url, key) : null;

let lastConnectionError = null;

async function assertConnection() {
  if (!supabase) {
    lastConnectionError = `Missing required env: ${missingEnv.join(', ')}`;
    throw new Error(`[db] ${lastConnectionError}. Supabase is mandatory.`);
  }

  const { error } = await supabase.from('messages').select('id', { head: true, count: 'exact' });
  if (error) {
    lastConnectionError = error.message;
    throw new Error(`[db] Supabase connection failed: ${error.message}`);
  }
  lastConnectionError = null;
}

function getStatus() {
  return {
    configured: missingEnv.length === 0,
    connected: missingEnv.length === 0 && !lastConnectionError,
    error: lastConnectionError,
    url: url || null,
  };
}

function from(...args) {
  if (!supabase) {
    const msg = `[db] Missing required env: ${missingEnv.join(', ')}. Supabase is mandatory.`;
    lastConnectionError = msg;
    throw new Error(msg);
  }
  return supabase.from(...args);
}

module.exports = {
  from,
  assertConnection,
  getStatus,
};
