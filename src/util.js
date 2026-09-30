export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

export function dateFr(iso) {
  if (!iso) return '';
  const d = new Date(typeof iso === 'number' && iso < 1e12 ? iso * 1000 : iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeFr(ms) {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function num(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v.decimal != null) return parseFloat(v.decimal);
    if (v.numerator != null) return v.numerator / (v.denominator || 1);
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

export function localIso(d) {
  const z = d.getTimezoneOffset() * 60000;
  return new Date(d - z).toISOString().slice(0, 16);
}

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export function icon(name) {
  return `<img class="ico" src="assets/img/icones/${name}" alt="" width="34" height="34">`;
}
