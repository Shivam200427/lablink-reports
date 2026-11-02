export async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'include',
    headers: opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
    ...opts,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}
