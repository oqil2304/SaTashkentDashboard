// ─── api.js — server bilan barcha muloqot ────────────────────────────────────
console.log('[api.js] yuklandi');

async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (netErr) {
    const e = new Error('Serverga ulanib boʻlmadi — node server.js ishlab turibdimi?');
    e.network = true;
    throw e;
  }

  if (res.status === 401) {
    const e = new Error('Sessiya tugagan');
    e.status = 401;
    throw e;
  }

  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`);
  return data;
}
