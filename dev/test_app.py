"""Test de bout en bout de l'application (mode navigateur) contre le faux farmOS.
   php -S 127.0.0.1:8081 ../ndjeke-prosperite/dev/mock-farmos.php  &  python3 -m http.server 8090 -d www &
"""
import sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'shots'
APP = 'http://127.0.0.1:8090/index.html'
errors = []

def shot(page, path, **kw):
    page.evaluate("document.getElementById('toast').hidden = true")
    time.sleep(0.25)
    page.screenshot(path=path, **kw)

def wait(page, fn, timeout=8):
    t = time.time()
    while time.time() - t < timeout:
        if fn(): return True
        time.sleep(0.15)
    raise AssertionError('délai dépassé')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, locale='fr-FR', timezone_id='Africa/Douala')
    ctx.add_init_script("window.NDJEKE_FARM_URL='http://127.0.0.1:8081'")
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto(APP)
    page.wait_for_selector('#view-login:not([hidden])')
    time.sleep(0.4)
    shot(page, f'{OUT}/1-connexion.png')

    page.click('#login-btn')
    page.wait_for_url('**/index.html*', timeout=8000)
    page.wait_for_selector('#view-tableau:not([hidden])')
    wait(page, lambda: 'à jour' in page.text_content('#dash-status'))
    assert page.text_content('.kpi strong') == '2', page.text_content('.kpi strong')
    time.sleep(0.4)
    shot(page, f'{OUT}/2-tableau.png')
    shot(page, f'{OUT}/2b-tableau-long.png', full_page=True)

    # Saisie hors connexion
    page.click('#tabs [data-tab=saisie]')
    wait(page, lambda: page.eval_on_selector_all('#land option', 'o => o.length') > 1)
    ctx.set_offline(True)
    wait(page, lambda: page.is_visible('#net'))
    page.check('#entry input[value=harvest]', force=True)
    page.fill('#what', 'Récolte de cabosses')
    page.select_option('#land', label='Cacaoyère Mvog-Nkoa')
    page.fill('#qty', '42,5')
    page.select_option('#unit', label='kg')
    page.fill('#notes', 'Cabosses mûres, bon état sanitaire.')
    page.evaluate('window.scrollTo(0, 0)')
    shot(page, f'{OUT}/3a-saisie-formulaire.png')
    page.click('#entry button[type=submit]')
    wait(page, lambda: 'Récolte de cabosses' in page.text_content('#queue'))
    assert page.text_content('#badge-saisie') == '1', (errors, page.text_content('#badge-saisie'), page.text_content('#queue'))
    time.sleep(0.3)
    shot(page, f'{OUT}/3-saisie.png')
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    time.sleep(0.2)
    shot(page, f'{OUT}/3b-hors-connexion.png')

    ctx.set_offline(False)
    wait(page, lambda: 'envoyé' in page.text_content('#queue'))
    assert page.is_hidden('#badge-saisie')

    # Tableau : la nouvelle récolte apparaît après actualisation
    page.click('#tabs [data-tab=tableau]')
    page.click('#dash-refresh')
    wait(page, lambda: 'Récolte de cabosses' in page.text_content('#dash'))

    page.click('#tabs [data-tab=gic]'); time.sleep(0.3)
    shot(page, f'{OUT}/4-le-gic.png')
    page.click('#tabs [data-tab=plus]')
    wait(page, lambda: 'Marie Awono' in page.text_content('#who'))
    shot(page, f'{OUT}/5-plus.png')

    # Hors connexion : le tableau reste lisible (copie locale)
    page.reload(); ctx.set_offline(True)
    page.click('#tabs [data-tab=tableau]')
    wait(page, lambda: 'Hors connexion' in page.text_content('#dash-status') or 'à jour' in page.text_content('#dash-status'))
    ctx.set_offline(False)

    # Déconnexion
    page.click('#tabs [data-tab=plus]')
    page.once('dialog', lambda d: d.accept())
    page.click('#logout')
    page.wait_for_selector('#view-login:not([hidden])')
    b.close()

errs = [e for e in errors if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to fetch' not in e]
print('ERREURS JS:', errs if errs else 'aucune')
print('OK')
