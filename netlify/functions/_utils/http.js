// netlify/functions/_utils/http.js
// Shared HTTP plumbing for every function. Added beyond the original 3-util
// plan because the widget can be embedded cross-origin on Vortex, so every
// endpoint needs identical CORS handling — centralising it here keeps each
// function file focused on its one job. (Documented in HANDOFF_2.)

export function corsHeaders(req) {
  // Echo the caller's origin (with Vary) rather than hardcoding — works for
  // vista.netlify.app itself, localhost dev, and the Vortex domain alike.
  const origin = req?.headers?.get?.('origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/** Returns a 204 Response for OPTIONS preflights, else null. */
export function preflight(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

export function json(status, body, req) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

export function html(status, markup) {
  return new Response(markup, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    const err = new Error('Request body must be valid JSON');
    err.status = 400;
    throw err;
  }
}
