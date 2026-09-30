"""Génère les images sources (icône, écran de démarrage) et les visuels Play Store à partir des SVG de la charte."""
import base64, pathlib
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parent.parent
img = R / 'www/assets/img'
def data(name): return 'data:image/svg+xml;base64,' + base64.b64encode((img / name).read_bytes()).decode()
SYM, LOGO = data('gic-ndjeke-symbole-inverse.svg'), data('gic-ndjeke-logo-horizontal-blanc.svg')
MOTIF = data('motif-grains-cacao.svg')
FONT = (R / 'www/assets/fonts/fraunces-latin-700-normal.woff2').read_bytes()
FONT2 = (R / 'www/assets/fonts/source-sans-3-latin-600-normal.woff2').read_bytes()
CSS = ("@font-face{font-family:F;src:url(data:font/woff2;base64,%s)}@font-face{font-family:S;src:url(data:font/woff2;base64,%s)}"
       "html,body{margin:0}body{display:flex;align-items:center;justify-content:center;overflow:hidden}") % (base64.b64encode(FONT).decode(), base64.b64encode(FONT2).decode())
jobs = {
  'assets/icon-only.png': (1024, 1024, f'<body style="background:#5B2E1A"><img src="{SYM}" style="height:74%">'),
  'assets/icon-foreground.png': (1024, 1024, f'<body style="background:transparent"><img src="{SYM}" style="height:78%">'),
  'assets/icon-background.png': (1024, 1024, '<body style="background:#5B2E1A">'),
  'assets/splash.png': (2732, 2732, f'<body style="background:#5B2E1A"><img src="{LOGO}" style="width:34%">'),
  'assets/splash-dark.png': (2732, 2732, f'<body style="background:#5B2E1A"><img src="{LOGO}" style="width:34%">'),
  'store/icone-play-512.png': (512, 512, f'<body style="background:#5B2E1A"><img src="{SYM}" style="height:74%">'),
  'store/banniere-1024x500.png': (1024, 500, f'''<body style="background:#5B2E1A url({MOTIF}) center/200px;justify-content:flex-start;gap:48px;padding:0 64px;box-sizing:border-box">
     <img src="{LOGO}" style="width:380px"><div style="color:#F6EEDF;font:600 30px/1.3 S;max-width:460px">
     <div style="font:700 44px/1.1 F;color:#D99A1E;margin-bottom:14px">Le carnet de terrain du GIC</div>
     Parcelles, récoltes, stocks et saisies même sans réseau.</div>'''),
}
with sync_playwright() as p:
    b = p.chromium.launch()
    for out, (w, h, html) in jobs.items():
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.set_content(f'<!doctype html><style>{CSS}body{{width:{w}px;height:{h}px}}</style>{html}')
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(R / out), omit_background=out.endswith('foreground.png'))
        pg.close()
        print('ok', out)
    b.close()
