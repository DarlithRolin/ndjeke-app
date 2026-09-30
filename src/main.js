/* Application GIC Ndjeke Prospérité : navigation, connexion farmOS, réseau, bouton retour Android. */
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import * as F from './farmos.js';
import { CONFIG } from './config.js';
import { showDashboard, clearDashboard } from './dashboard.js';
import { initSaisie, refreshRef, renderQueue, sync } from './saisie.js';
import { queue, ref } from './store.js';
import { $, $$, esc, toast } from './util.js';

const TABS = ['tableau', 'saisie', 'gic', 'plus'];
const NAME_KEY = 'ndjeke.app.user';
let current = null;
const backStack = [];

function openSite(path) {
  return Browser.open({ url: CONFIG.siteUrl + path, toolbarColor: '#5B2E1A' });
}

/* ---------- navigation ---------- */
function show(tab, push = true) {
  if (!F.connected() && tab !== 'login') tab = 'login';
  if (push && current && current !== tab && current !== 'login') backStack.push(current);
  current = tab;
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + tab; });
  $('#tabs').hidden = tab === 'login';
  $('#topbar').hidden = tab === 'login';
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  $('#title').textContent = { tableau: 'Tableau de bord', saisie: 'Saisie terrain', gic: 'Le GIC', plus: 'Plus' }[tab] || '';
  window.scrollTo(0, 0);
  if (tab === 'tableau') showDashboard(false, needAuth);
  if (tab === 'saisie') renderQueue();
  if (tab === 'plus') renderPlus();
}

function needAuth(msg) {
  F.disconnect();
  $('#login-msg').textContent = msg || 'Votre session farmOS a expiré. Reconnectez-vous.';
  $('#login-msg').hidden = false;
  show('login', false);
}

/* ---------- connexion ---------- */
async function login() {
  const btn = $('#login-btn');
  btn.disabled = true;
  $('#login-msg').hidden = true;
  btn.textContent = 'Connexion en cours…';
  try {
    if (!navigator.onLine) throw new Error('Pas de réseau. La première connexion demande Internet.');
    await F.connect();
    await afterLogin();
  } catch (e) {
    $('#login-msg').textContent = e.message;
    $('#login-msg').hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter avec farmOS';
  }
}

async function afterLogin() {
  const name = await F.whoami();
  if (name) localStorage.setItem(NAME_KEY, name);
  backStack.length = 0;
  show('tableau', false);
  toast(name ? `Bienvenue, ${name} !` : 'Connecté à farmOS.');
  refreshRef();
  sync();
}

/* ---------- onglet Plus ---------- */
async function renderPlus() {
  const name = localStorage.getItem(NAME_KEY);
  const pending = (await queue.all()).filter((i) => i.state !== 'sent').length;
  const lists = await ref.get('lists');
  $('#who').innerHTML = `<strong>${esc(name || 'Membre connecté')}</strong><br><small>${esc(F.farmUrl.replace(/^https?:\/\//, ''))}</small>`;
  $('#plus-info').textContent = `${pending} saisie(s) en attente · listes ${lists ? 'du ' + new Date(lists.at).toLocaleDateString('fr-FR') : 'non chargées'}`;
}

async function logout() {
  const pending = (await queue.all()).filter((i) => i.state !== 'sent').length;
  const msg = pending
    ? `${pending} saisie(s) ne sont pas encore envoyées. Elles resteront sur ce téléphone et partiront à la prochaine connexion. Se déconnecter ?`
    : 'Se déconnecter de farmOS sur ce téléphone ?';
  if (!confirm(msg)) return;
  F.disconnect();
  localStorage.removeItem(NAME_KEY);
  await clearDashboard();
  $('#login-msg').hidden = true;
  show('login', false);
}

async function wipe() {
  if (!confirm('Effacer toutes les données de l\'application sur ce téléphone (connexion, listes, saisies non envoyées) ?')) return;
  for (const i of await queue.all()) await queue.del(i.id);
  await ref.del('lists');
  await clearDashboard();
  F.disconnect();
  localStorage.clear();
  $('#login-msg').hidden = true;
  show('login', false);
  toast('Données effacées.');
}

/* ---------- réseau ---------- */
function net() {
  const on = navigator.onLine;
  $('#net').hidden = on;
  if (on && F.connected()) { sync(); if (current === 'tableau') showDashboard(false, needAuth); }
}

/* ---------- démarrage ---------- */
async function start() {
  // Mode navigateur (tests) : retour de la page de connexion farmOS.
  if (/callback\.html$/.test(location.pathname)) {
    try { await F.handleWebCallback(); location.replace('index.html#connecte'); } catch (e) {
      document.body.textContent = 'Connexion impossible : ' + e.message;
    }
    return;
  }

  $('#version').textContent = CONFIG.version;
  $('#login-btn').addEventListener('click', login);
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  $$('[data-site]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openSite(a.dataset.site); }));
  $$('[data-go]').forEach((a) => a.addEventListener('click', () => show(a.dataset.go)));
  $('#dash-refresh').addEventListener('click', () => showDashboard(true, needAuth));
  $('#logout').addEventListener('click', logout);
  $('#wipe').addEventListener('click', wipe);
  $('#plus-refresh').addEventListener('click', async () => { await refreshRef(); renderPlus(); toast('Listes mises à jour.'); });
  $('#tel').href = 'tel:' + CONFIG.phone;
  $('#wa').href = 'https://wa.me/' + CONFIG.whatsapp;
  window.addEventListener('online', net);
  window.addEventListener('offline', net);

  await initSaisie(needAuth);

  App.addListener('backButton', () => {
    if (backStack.length) show(backStack.pop(), false);
    else if (current !== 'tableau' && current !== 'login' && F.connected()) show('tableau', false);
    else App.exitApp();
  });
  App.addListener('resume', () => {
    if (!F.connected()) return;
    net();
    if (current === 'saisie') renderQueue();
  });

  document.body.classList.remove('booting');
  if (F.isNative && !F.connected()) {
    try {
      const launch = await App.getLaunchUrl();
      if (launch && await F.handleLaunchUrl(launch.url)) { await afterLogin(); return; }
    } catch (e) { $('#login-msg').textContent = e.message; $('#login-msg').hidden = false; }
  }
  if (F.connected()) {
    const first = location.hash === '#connecte';
    if (first) window.history.replaceState(null, '', location.pathname);
    show('tableau', false);
    if (first) { const n = await F.whoami(); if (n) localStorage.setItem(NAME_KEY, n); refreshRef(); }
    net();
  } else {
    show('login', false);
  }
  $('#net').hidden = navigator.onLine;
}

start();
