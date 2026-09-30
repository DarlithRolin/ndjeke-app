/* Tableau de bord : lecture des données farmOS, avec copie locale pour la consultation hors connexion. */
import * as F from './farmos.js';
import { ref } from './store.js';
import { $, esc, dateFr, num, timeFr } from './util.js';

export const LOG_TYPES = {
  activity: 'Activité', harvest: 'Récolte', input: 'Intrant', observation: 'Observation', seeding: 'Semis',
  transplanting: 'Repiquage', birth: 'Naissance', medical: 'Soins', maintenance: 'Entretien',
};
const STOCK_TYPES = ['material', 'seed', 'product'];
const MEASURE = { weight: 'poids', count: 'nombre', volume: 'volume', area: 'surface', length: 'longueur', value: 'valeur', time: 'durée' };
const LAND = { field: 'champ', bed: 'planche', paddock: 'pâturage', landmark: 'repère', property: 'propriété', other: 'autre' };

let loading = false;

/** Construit un résumé compact (c'est lui qui est gardé sur le téléphone). */
async function fetchModel() {
  const q = '?page[limit]=50';
  const [landR, plantR, animalR, stocks, logsets] = await Promise.all([
    F.list('/api/asset/land' + q + '&sort=name', 3),
    F.listOptional('/api/asset/plant' + q + '&include=plant_type', 3),
    F.listOptional('/api/asset/animal' + q + '&include=animal_type', 3),
    Promise.all(STOCK_TYPES.map((t) => F.listOptional('/api/asset/' + t + q, 2))),
    Promise.all(Object.keys(LOG_TYPES).map((t) => {
      const inc = t === 'harvest' ? '&include=quantity,quantity.units' : '';
      return F.listOptional('/api/log/' + t + '?page[limit]=50&sort=-timestamp' + inc, 1).then((r) => ({ ...r, kind: t }));
    })),
  ]);
  const active = (r) => r.data.filter((x) => !F.isArchived(x));
  const lands = active(landR);
  const plants = active(plantR);
  const animals = active(animalR);

  const logs = [];
  logsets.forEach((set) => set.data.forEach((l) => {
    logs.push({ type: set.kind, name: l.attributes.name, status: l.attributes.status, date: l.attributes.timestamp });
  }));
  logs.sort((a, b) => new Date(b.date) - new Date(a.date));
  const since = Date.now() - 30 * 86400000;

  const byType = {};
  animals.forEach((a) => { const t = F.includedName(a, 'animal_type', animalR.included) || 'Animaux'; byType[t] = (byType[t] || 0) + 1; });

  const stock = [];
  stocks.forEach((set) => active(set).forEach((x) => {
    const inv = (x.attributes.inventory || []).map((i) => {
      const v = num(i.value);
      return (v == null ? i.value : v.toLocaleString('fr-FR')) + ' ' + (i.units || '') + (i.measure && !i.units ? ' (' + (MEASURE[i.measure] || i.measure) + ')' : '');
    }).join(', ');
    stock.push({ name: x.attributes.name, detail: inv || 'inventaire non suivi' });
  }));

  const harvest = logsets.find((s) => s.kind === 'harvest');
  const harvests = harvest.data.slice(0, 8).map((l) => {
    const qs = ((l.relationships.quantity || {}).data || []).map((r) => {
      const qn = harvest.included.find((i) => i.id === r.id);
      if (!qn) return '';
      const uref = qn.relationships && qn.relationships.units && qn.relationships.units.data;
      const unit = uref ? harvest.included.find((i) => i.id === uref.id) : null;
      const v = num(qn.attributes.value);
      return (v == null ? '' : v.toLocaleString('fr-FR')) + ' ' + (unit ? unit.attributes.name : (qn.attributes.label || ''));
    }).filter(Boolean).join(', ');
    return { name: l.attributes.name, detail: [qs, dateFr(l.attributes.timestamp)].filter(Boolean).join(' · ') };
  });

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), n: 0, label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
  }
  logs.forEach((l) => {
    const d = new Date(l.date);
    months.forEach((mo) => { if (d.getFullYear() === mo.y && d.getMonth() === mo.m) mo.n++; });
  });

  return {
    at: Date.now(),
    counts: { lands: lands.length, plants: plants.length, animals: animals.length, logs30: logs.filter((l) => new Date(l.date) >= since).length },
    logs: logs.slice(0, 12),
    lands: lands.slice(0, 20).map((x) => ({ name: x.attributes.name, detail: LAND[x.attributes.land_type] || x.attributes.land_type || '' })),
    assets: plants.slice(0, 12).map((x) => ({ name: x.attributes.name, detail: F.includedName(x, 'plant_type', plantR.included) || 'culture' }))
      .concat(Object.keys(byType).map((t) => ({ name: t, detail: byType[t] + (byType[t] > 1 ? ' animaux' : ' animal') }))),
    stock,
    harvests,
    months: months.map((m) => ({ label: m.label, n: m.n })),
  };
}

function list(items, empty) {
  return items.length
    ? items.map((i) => `<li><span>${esc(i.name)}</span>${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</li>`).join('')
    : `<li class="muted">${esc(empty)}</li>`;
}

function render(m) {
  const root = $('#dash');
  const max = Math.max(1, ...m.months.map((x) => x.n));
  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><strong>${m.counts.lands}</strong><span>parcelles</span></div>
      <div class="kpi"><strong>${m.counts.plants}</strong><span>cultures</span></div>
      <div class="kpi"><strong>${m.counts.animals}</strong><span>animaux</span></div>
      <div class="kpi"><strong>${m.counts.logs30}</strong><span>activités (30 j)</span></div>
    </div>
    <section class="card">
      <h2>Activités des 6 derniers mois</h2>
      <div class="chart" role="img" aria-label="${esc(m.months.map((x) => x.label + ' ' + x.n).join(', '))}">
        ${m.months.map((x) => `<div class="b"><em>${x.n || ''}</em><i style="height:${Math.round((x.n / max) * 100)}%"></i><span>${esc(x.label)}</span></div>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2>Derniers journaux</h2>
      <ul class="list">${m.logs.length ? m.logs.map((l) => `<li><span><span class="pill">${esc(LOG_TYPES[l.type] || l.type)}</span> ${esc(l.name)}</span><small>${esc(dateFr(l.date))} ${l.status === 'done' ? '<span class="pill ok">fait</span>' : '<span class="pill warn">prévu</span>'}</small></li>`).join('') : '<li class="muted">Aucun journal pour le moment.</li>'}</ul>
    </section>
    <section class="card"><h2>Récoltes</h2><ul class="list">${list(m.harvests, 'Aucune récolte enregistrée.')}</ul></section>
    <section class="card"><h2>Stocks</h2><ul class="list">${list(m.stock, 'Aucun stock suivi dans farmOS.')}</ul></section>
    <section class="card"><h2>Parcelles</h2><ul class="list">${list(m.lands, 'Aucune parcelle enregistrée.')}</ul></section>
    <section class="card"><h2>Cultures et cheptel</h2><ul class="list">${list(m.assets, 'Aucune culture ni animal enregistré.')}</ul></section>`;
}

function status(msg) { $('#dash-status').textContent = msg; }

export async function showDashboard(force, onNeedAuth) {
  const cached = await ref.get('dashboard');
  if (cached && !$('#dash').children.length) render(cached);
  if (!navigator.onLine) {
    status(cached ? `Hors connexion — données du ${dateFr(cached.at)} à ${timeFr(cached.at)}.` : 'Hors connexion : le tableau de bord s\'affichera au retour du réseau.');
    return;
  }
  if (loading) return;
  if (!force && cached && Date.now() - cached.at < 5 * 60000) {
    status(`Données farmOS à jour (${timeFr(cached.at)}).`);
    return;
  }
  loading = true;
  status('Chargement des données farmOS…');
  $('#dash').setAttribute('aria-busy', 'true');
  try {
    const m = await fetchModel();
    await ref.put('dashboard', m);
    render(m);
    status(`Données farmOS à jour (${timeFr(m.at)}).`);
  } catch (e) {
    if (e instanceof F.NeedAuth) { onNeedAuth(e.message); return; }
    status('Impossible de lire farmOS : ' + e.message + (cached ? ' — affichage des dernières données connues.' : ''));
  } finally {
    loading = false;
    $('#dash').removeAttribute('aria-busy');
  }
}

export function clearDashboard() { $('#dash').innerHTML = ''; return ref.del('dashboard'); }
