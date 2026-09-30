/*
 * Client farmOS de l'application : OAuth2 « authorization code » + PKCE, puis API JSON:API.
 * - Sur Android : la page de connexion farmOS s'ouvre dans un onglet Chrome sécurisé,
 *   puis farmOS renvoie vers cm.gicndjeke.app://oauth, que l'application intercepte.
 * - Dans un navigateur (tests) : redirection classique vers callback.html.
 */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { CONFIG } from './config.js';

const KEY = 'ndjeke.app.token';
const PKCE = 'ndjeke.app.pkce';
const native = Capacitor.isNativePlatform();
const FARM = (window.NDJEKE_FARM_URL || CONFIG.farmUrl).replace(/\/$/, '');
const REDIRECT = native ? CONFIG.nativeRedirect : location.origin + location.pathname.replace(/[^/]*$/, '') + 'callback.html';

export class NeedAuth extends Error {
  constructor(msg) { super(msg || 'Connexion à farmOS nécessaire.'); this.name = 'NeedAuth'; }
}

function b64url(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
async function sha256(str) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(new Uint8Array(h));
}

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
function save(t) {
  const prev = load() || {};
  const tok = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || prev.refresh_token,
    expires_at: Date.now() + ((t.expires_in || 3600) - 60) * 1000,
  };
  localStorage.setItem(KEY, JSON.stringify(tok));
  return tok;
}

async function tokenRequest(params) {
  params.client_id = CONFIG.clientId;
  const r = await fetch(FARM + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* réponse vide */ }
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_description || j.message || j.error || `Erreur ${r.status} du serveur farmOS`);
  }
  return save(j);
}

let refreshing = null;
async function token(force) {
  const t = load();
  if (!t) throw new NeedAuth();
  if (!force && t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new NeedAuth('Session farmOS expirée.');
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
      .then((n) => n.access_token)
      .catch((e) => {
        if (navigator.onLine) localStorage.removeItem(KEY);
        throw new NeedAuth('Session farmOS expirée : reconnectez-vous. (' + e.message + ')');
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, opts = {}, retried = false) {
  const tok = await token(false);
  const headers = { Accept: 'application/vnd.api+json', Authorization: 'Bearer ' + tok };
  if (opts.body) headers['Content-Type'] = 'application/vnd.api+json';
  const r = await fetch(FARM + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && !retried) { await token(true); return api(path, opts, true); }
  if (r.status === 401) throw new NeedAuth();
  let j = {};
  try { j = await r.json(); } catch (e) { /* vide */ }
  if (!r.ok) {
    const err = new Error(j.errors && j.errors[0] ? (j.errors[0].detail || j.errors[0].title) : 'HTTP ' + r.status);
    err.status = r.status;
    throw err;
  }
  return j;
}

export async function list(path, maxPages = 4) {
  let data = [], included = [], next = path, n = 0;
  while (next && n < maxPages) {
    const j = await api(next);
    data = data.concat(j.data || []);
    included = included.concat(j.included || []);
    const href = j.links && j.links.next && j.links.next.href;
    next = href ? href.replace(FARM, '') : null;
    n++;
  }
  return { data, included };
}

export async function listOptional(path, maxPages) {
  try { return await list(path, maxPages); } catch (e) {
    if (e.status === 404 || e.status === 400) return { data: [], included: [], missing: true };
    throw e;
  }
}

export const isArchived = (r) => { const a = r.attributes || {}; return a.archived === true || a.status === 'archived'; };

export function includedName(res, rel, included) {
  const d = res.relationships && res.relationships[rel] && res.relationships[rel].data;
  if (!d) return '';
  return (Array.isArray(d) ? d : [d])
    .map((x) => { const hit = included.find((i) => i.id === x.id); return hit ? (hit.attributes.name || hit.attributes.label || '') : ''; })
    .filter(Boolean).join(', ');
}

/** Nom de l'utilisateur connecté (si le serveur l'indique). */
export async function whoami() {
  try {
    const j = await api('/api');
    const me = (j.meta && j.meta.links && j.meta.links.me) || (j.links && j.links.me);
    const id = me && me.meta && me.meta.id;
    if (!id) return null;
    const u = await api('/api/user/user/' + id);
    return u.data.attributes.display_name || u.data.attributes.name || null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ connexion */

async function exchange(url) {
  const q = new URL(url).searchParams;
  if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
  const saved = JSON.parse(sessionStorage.getItem(PKCE) || localStorage.getItem(PKCE) || 'null');
  sessionStorage.removeItem(PKCE);
  localStorage.removeItem(PKCE);
  if (!saved || saved.s !== q.get('state')) throw new Error('Réponse de farmOS inattendue. Recommencez la connexion.');
  return tokenRequest({ grant_type: 'authorization_code', code: q.get('code') || '', redirect_uri: REDIRECT, code_verifier: saved.v });
}

/** Ouvre la page de connexion farmOS. Sur Android, résout quand la connexion est terminée. */
export async function connect() {
  const verifier = randomString(48);
  const state = randomString(16);
  const store = JSON.stringify({ v: verifier, s: state });
  localStorage.setItem(PKCE, store);   // survit si Android recrée l'activité
  const challenge = await sha256(verifier);
  const q = new URLSearchParams({
    response_type: 'code', client_id: CONFIG.clientId, redirect_uri: REDIRECT, scope: CONFIG.scope,
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  const url = FARM + '/oauth/authorize?' + q.toString();
  if (!native) { sessionStorage.setItem(PKCE, store); location.assign(url); return new Promise(() => {}); }

  return new Promise((resolve, reject) => {
    let done = false;
    const subs = [];
    const cleanup = async () => { for (const h of subs) { try { (await h).remove(); } catch (e) { /* déjà retiré */ } } };
    subs.push(App.addListener('appUrlOpen', async ({ url: back }) => {
      if (!back || !back.startsWith(CONFIG.nativeRedirect) || done) return;
      done = true;
      await cleanup();
      try { await Browser.close(); } catch (e) { /* déjà fermé */ }
      exchange(back).then(resolve, reject);
    }));
    subs.push(Browser.addListener('browserFinished', () => {
      setTimeout(async () => { if (!done) { done = true; await cleanup(); reject(new Error('Connexion annulée.')); } }, 800);
    }));
    Browser.open({ url, toolbarColor: '#5B2E1A', presentationStyle: 'fullscreen' }).catch(async (e) => { done = true; await cleanup(); reject(e); });
  });
}

/** Android : l'application a été relancée par le lien de retour (Android l'avait fermée pendant la connexion). */
export async function handleLaunchUrl(url) {
  if (!url || !url.startsWith(CONFIG.nativeRedirect) || !localStorage.getItem(PKCE)) return false;
  await exchange(url);
  return true;
}

/** Mode navigateur : traite le retour de farmOS sur callback.html. */
export function handleWebCallback() { return exchange(location.href); }

export function disconnect() { localStorage.removeItem(KEY); }
export function connected() { return !!load(); }
export const farmUrl = FARM;
export const isNative = native;
