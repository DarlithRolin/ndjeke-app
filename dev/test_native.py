"""Simule le parcours de connexion Android (onglet sécurisé + retour cm.gicndjeke.app://oauth)
en faisant passer l'application pour « android » avec les implémentations web des plugins."""
import time
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 360, 'height': 640})
    ctx.add_init_script("window.NDJEKE_FARM_URL='http://127.0.0.1:8081'; window.CapacitorCustomPlatform={name:'android'};")
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8090/index.html')
    page.wait_for_selector('#view-login:not([hidden])')

    # 1) Connexion normale : l'onglet s'ouvre, farmOS renvoie vers le schéma de l'appli
    loc = {}
    ctx.on('response', lambda r: '/oauth/authorize' in r.url and loc.setdefault('url', r.headers.get('location')))
    page.click('#login-btn')
    t = time.time()
    while 'url' not in loc and time.time() - t < 8: time.sleep(0.1)
    assert loc.get('url', '').startswith('cm.gicndjeke.app://oauth?code='), loc
    page.evaluate("u => Capacitor.Plugins.App.notifyListeners('appUrlOpen', {url: u})", loc['url'])
    page.wait_for_selector('#view-tableau:not([hidden])', timeout=8000)
    print('1. connexion par schéma cm.gicndjeke.app : OK')

    # 2) Réponse d'un autre lien ignorée, état incorrect refusé
    page.evaluate("localStorage.clear()"); page.reload()
    page.wait_for_selector('#view-login:not([hidden])')
    loc.clear(); page.click('#login-btn')
    t = time.time()
    while 'url' not in loc and time.time() - t < 8: time.sleep(0.1)
    bad = loc['url'].split('&state=')[0] + '&state=faux'
    page.evaluate("u => Capacitor.Plugins.App.notifyListeners('appUrlOpen', {url: 'https://autre.exemple/x'})")
    page.evaluate("u => Capacitor.Plugins.App.notifyListeners('appUrlOpen', {url: u})", bad)
    page.wait_for_selector('#login-msg:not([hidden])')
    assert 'inattendue' in page.text_content('#login-msg'), page.text_content('#login-msg')
    print('2. état OAuth falsifié refusé : OK')
    b.close()
print('ERREURS JS:', errors or 'aucune')
