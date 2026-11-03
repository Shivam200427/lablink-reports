// Database timestamps are UTC, stored without an offset. Format explicitly for
// the lab's India timezone; never shift the stored event or audit ordering.
export function formatIST(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  const iso = raw.replace(' ', 'T');
  const date = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date) + ' IST';
}
