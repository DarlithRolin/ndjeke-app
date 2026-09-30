/*
 * Saisie terrain hors connexion : gardée sur le téléphone puis envoyée à farmOS dès que le réseau revient.
 * Ordre d'envoi : quantité (si besoin) puis journal ; la quantité créée est mémorisée pour ne pas la dupliquer.
 */
import * as F from './farmos.js';
import { queue, ref } from './store.js';
import { $, esc, uid, localIso, toast, dateFr, timeFr } from './util.js';

const TYPE_LABEL = { activity: 'Activité', harvest: 'Récolte', input: 'Intrant', observation: 'Observation' };
const ASSET_TYPES = { plant: 'culture', animal: 'animaux', group: 'groupe' };
let onNeedAuth = () => {};
let syncing = false;

/* ---------- listes de référence ---------- */
function renderRef(data) {
  if (!data) { $('#ref-info').textContent = 'Listes pas encore chargées.'; return; }
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  $('#land').innerHTML = opt('', '— aucune —') + data.lands.map((l) => opt(l.id, l.name)).join('');
  $('#asset').innerHTML = opt('', '— aucun —') + data.assets.map((a) => opt(a.type + ':' + a.id, `${a.name} (${ASSET_TYPES[a.type] || a.type})`)).join('');
  $('#unit').innerHTML = opt('', '—') + data.units.map((u) => opt(u.id, u.name)).join('');
  $('#ref-info').textContent = `Listes du ${dateFr(data.at)} à ${timeFr(data.at)}`;
}

export async function refreshRef() {
  if (!navigator.onLine || !F.connected()) return;
  $('#ref-info').textContent = 'Mise à jour des listes…';
  const lim = '?page[limit]=50&sort=name';
  const active = (r) => r.data.filter((x) => !F.isArchived(x));
  try {
    const r = await Promise.all([
      F.list('/api/asset/land' + lim, 3),
      F.listOptional('/api/asset/plant' + lim, 3),
      F.listOptional('/api/asset/animal' + lim, 2),
      F.listOptional('/api/asset/group' + lim, 1),
      F.listOptional('/api/taxonomy_term/unit' + lim, 2),
    ]);
    const pick = (type) => (x) => ({ id: x.id, name: x.attributes.name, type });
    const data = {
      at: Date.now(),
      lands: active(r[0]).map(pick('land')),
      assets: active(r[1]).map(pick('plant')).concat(active(r[2]).map(pick('animal')), active(r[3]).map(pick('group'))),
      units: r[4].data.map((x) => ({ id: x.id, name: x.attributes.name })),
    };
    await ref.put('lists', data);
    // Garde la sélection en cours si l'utilisateur remplissait déjà le formulaire.
    const keep = ['land', 'asset', 'unit'].map((id) => $('#' + id).value);
    renderRef(data);
    ['land', 'asset', 'unit'].forEach((id, i) => { $('#' + id).value = keep[i]; });
  } catch (e) {
    if (e instanceof F.NeedAuth) { onNeedAuth(e.message); return; }
    $('#ref-info').textContent = 'Listes non mises à jour : ' + e.message;
  }
}

/* ---------- file d'attente ---------- */
export async function renderQueue() {
  let items = (await queue.all()).sort((a, b) => b.created - a.created);
  const weekAgo = Date.now() - 7 * 86400000;
  for (const i of items.filter((x) => x.state === 'sent' && x.sentAt < weekAgo)) await queue.del(i.id);
  items = items.filter((i) => !(i.state === 'sent' && i.sentAt < weekAgo));
  $('#queue').innerHTML = items.length ? items.map((i) => {
    const pill = i.state === 'sent' ? '<span class="pill ok">envoyé</span>'
      : i.state === 'error' ? '<span class="pill err">erreur</span>'
        : '<span class="pill warn">en attente</span>';
    const del = i.state !== 'sent' ? `<button class="link" type="button" data-del="${esc(i.id)}">supprimer</button>` : '';
    return `<li><span><span class="pill">${esc(TYPE_LABEL[i.type])}</span> ${esc(i.name)}<br><small>${esc(new Date(i.when).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))}${i.state === 'error' ? ' — ' + esc(i.error) : ''}</small></span><span class="q-side">${pill}${del}</span></li>`;
  }).join('') : '<li class="muted">Aucune saisie en attente.</li>';
  const pending = items.filter((i) => i.state !== 'sent').length;
  $('#sync').textContent = pending ? `Envoyer maintenant (${pending})` : 'Envoyer maintenant';
  const badge = $('#badge-saisie');
  badge.textContent = pending;
  badge.hidden = !pending;
}

function fraction(v) {
  const s = String(v).replace(',', '.');
  const dec = (s.split('.')[1] || '').length;
  const den = Math.pow(10, Math.min(dec, 6));
  return { numerator: Math.round(parseFloat(s) * den), denominator: den };
}

async function sendOne(item) {
  let qref = item.quantityRef || null;
  if (item.qty !== '' && item.qty != null && !qref) {
    const qBody = { data: { type: 'quantity--standard', attributes: { measure: item.measure, value: fraction(item.qty) } } };
    if (item.unit) qBody.data.relationships = { units: { data: { type: 'taxonomy_term--unit', id: item.unit } } };
    const j = await F.api('/api/quantity/standard', { method: 'POST', body: qBody });
    qref = { id: j.data.id, rev: j.data.attributes && j.data.attributes.drupal_internal__revision_id };
    item.quantityRef = qref;
    await queue.put(item);
  }
  const rel = {};
  if (item.land) rel.location = { data: [{ type: 'asset--land', id: item.land }] };
  if (item.asset) {
    const [t, id] = item.asset.split(':');
    rel.asset = { data: [{ type: 'asset--' + t, id }] };
  }
  if (qref) {
    const qd = { type: 'quantity--standard', id: qref.id };
    if (qref.rev) qd.meta = { target_revision_id: qref.rev };
    rel.quantity = { data: [qd] };
  }
  const body = { data: { type: 'log--' + item.type, attributes: { name: item.name, timestamp: new Date(item.when).toISOString(), status: item.status } } };
  if (item.notes) body.data.attributes.notes = { value: item.notes, format: 'default' };
  if (Object.keys(rel).length) body.data.relationships = rel;
  const j = await F.api('/api/log/' + item.type, { method: 'POST', body });
  Object.assign(item, { state: 'sent', sentAt: Date.now(), farmId: j.data && j.data.id, error: '' });
  await queue.put(item);
}

export async function sync() {
  if (syncing || !navigator.onLine || !F.connected()) return;
  syncing = true;
  $('#sync').disabled = true;
  let sent = 0;
  try {
    const todo = (await queue.all()).filter((i) => i.state !== 'sent').sort((a, b) => a.created - b.created);
    for (const item of todo) {
      try { await sendOne(item); sent++; } catch (e) {
        if (e instanceof F.NeedAuth) { onNeedAuth(e.message); break; }
        item.state = 'error';
        item.error = e.message;
        await queue.put(item);
      }
    }
  } finally {
    syncing = false;
    $('#sync').disabled = false;
    await renderQueue();
  }
  if (sent) toast(sent > 1 ? `${sent} saisies envoyées à farmOS.` : 'Saisie envoyée à farmOS.');
}

/* ---------- formulaire ---------- */
function updateFormForType() {
  const t = $('#entry').querySelector('input[name=type]:checked').value;
  const needsQty = t === 'harvest' || t === 'input';
  $('#measure-row').hidden = !needsQty && !$('#qty').value;
  $('#qty').required = t === 'harvest';
  $('#qty-label').textContent = t === 'harvest' ? 'Quantité récoltée *' : 'Quantité';
}

export async function initSaisie(needAuth) {
  onNeedAuth = needAuth;
  const form = $('#entry');
  form.addEventListener('change', (e) => { if (e.target.name === 'type') updateFormForType(); });
  $('#qty').addEventListener('input', updateFormForType);
  $('#queue').addEventListener('click', async (e) => {
    const id = e.target.getAttribute('data-del');
    if (id && confirm('Supprimer cette saisie non envoyée ?')) { await queue.del(id); renderQueue(); }
  });
  $('#sync').addEventListener('click', () => {
    if (!navigator.onLine) { toast('Pas de réseau : l\'envoi se fera automatiquement plus tard.'); return; }
    sync();
  });
  $('#refresh').addEventListener('click', refreshRef);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const landSel = $('#land'), unitSel = $('#unit');
    const what = String(fd.get('what') || '').trim();
    const place = landSel.value ? landSel.options[landSel.selectedIndex].text : '';
    const qty = String(fd.get('qty') || '').trim();
    const unitName = unitSel.value ? unitSel.options[unitSel.selectedIndex].text : '';
    const name = what + (place ? ' — ' + place : '') + (qty ? ' — ' + qty + (unitName ? ' ' + unitName : '') : '');
    const item = {
      id: uid(), created: Date.now(), state: 'pending', type: fd.get('type'), name: name.slice(0, 255),
      when: new Date(fd.get('when')).getTime(), status: fd.get('status'),
      land: landSel.value, asset: $('#asset').value, qty, unit: unitSel.value, unitName,
      measure: fd.get('measure') || 'weight', notes: String(fd.get('notes') || '').trim(),
    };
    await queue.put(item);
    toast(navigator.onLine ? 'Enregistré. Envoi vers farmOS…' : 'Enregistré sur le téléphone. Envoi au retour du réseau.');
    form.reset();
    $('#when').value = localIso(new Date());
    updateFormForType();
    await renderQueue();
    sync();
  });

  $('#when').value = localIso(new Date());
  updateFormForType();
  renderRef(await ref.get('lists'));
  await renderQueue();
}
