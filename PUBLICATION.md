# Application Android GIC Ndjeke — de zéro au Play Store

Application Capacitor 8 (Android 7 et plus, cible API 36 exigée par Google depuis le 31/08/2026).
Elle ne parle qu'au serveur farmOS `https://ndjeke2.bloosat.africa` (InfinityFree bloque les applications) ;
les pages « Le GIC » s'ouvrent dans un onglet Chrome vers `https://ndjeke.rf.gd`.

La compilation se fait sur **GitHub Actions** (gratuit) : rien à installer sur votre PC, pas d'Android Studio.

---

## 1. farmOS : client OAuth de l'application

farmOS > Administration > Configuration > Web services > Consumers > **Ajouter** (même écran que `gic_site`) :

| Champ | Valeur |
| --- | --- |
| Label | Application Android GIC Ndjeke |
| Client ID | `gic_app` |
| Secret | vide |
| Is confidential | **non** |
| Use PKCE | **oui** |
| Grant types | Authorization code, Refresh token |
| Scopes | `farm_worker` |
| Redirect URI | `cm.gicndjeke.app://oauth` |
| Allowed origins | `https://localhost` |
| Access token expiration | 3600 |
| Refresh token expiration | 2592000 (30 jours) |

Vérification depuis la VM 204 (doit afficher `access-control-allow-origin: https://localhost`) :

```bash
curl -si -X OPTIONS https://ndjeke2.bloosat.africa/api/log/activity \
  -H 'Origin: https://localhost' -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization' | grep -i access-control
```

## 2. Dépôt GitHub

1. Créez un compte sur github.com si besoin, puis **New repository** : nom `ndjeke-app`, **Private**, sans README.
2. Depuis la VM 204 (ou tout Linux avec git) :

```bash
sudo apt-get install -y git unzip
unzip ndjeke-app.zip && cd ndjeke-app
git init -b main && git add . && git commit -m "Application Android GIC Ndjeke 1.0.0"
git remote add origin https://github.com/VOTRE-COMPTE/ndjeke-app.git
git push -u origin main      # mot de passe = un « Personal access token » GitHub (Settings > Developer settings)
```

## 3. Premier essai sur un téléphone (sans clé)

GitHub > dépôt > **Actions** > *Android* > **Run workflow** (version `1.0.0`).
Après ~8 minutes : en bas de l'exécution, *Artifacts* > téléchargez le zip > `gic-ndjeke-1.0.0-1-TEST.apk`.
Copiez-le sur un téléphone Android, ouvrez-le, autorisez « installer des applis inconnues ».

À vérifier : connexion farmOS → retour automatique dans l'appli → tableau de bord rempli ;
saisie en mode avion → « en attente » → désactiver le mode avion → « envoyé » et visible dans farmOS.

## 4. Clé de signature (une seule fois, à garder précieusement)

Sur la VM 204 (Docker y est déjà) :

```bash
mkdir -p ~/cle-android && cd ~/cle-android
sudo docker run --rm -it -v "$PWD":/k -w /k eclipse-temurin:21-jre \
  keytool -genkeypair -v -keystore upload.jks -alias ndjeke -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=GIC Ndjeke Prosperite, O=GIC Ndjeke Prosperite, L=Ndjeke, C=CM"
sudo chown $USER upload.jks
base64 -w0 upload.jks > upload.jks.b64
```

Le mot de passe demandé sert pour `ANDROID_KEYSTORE_PASSWORD` **et** `ANDROID_KEY_PASSWORD`.
Copiez `upload.jks` et le mot de passe dans un lieu sûr (clé USB + gestionnaire de mots de passe) :
c'est la « clé d'importation ». Google garde la vraie clé de l'appli (Play App Signing) ; si vous perdez
celle-ci, Google peut la réinitialiser, mais cela prend quelques jours.

GitHub > dépôt > Settings > Secrets and variables > Actions > **New repository secret**, quatre fois :

| Nom | Valeur |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | tout le contenu de `upload.jks.b64` (`cat upload.jks.b64`) |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe |
| `ANDROID_KEY_ALIAS` | `ndjeke` |
| `ANDROID_KEY_PASSWORD` | le mot de passe |

Puis supprimez `upload.jks.b64` de la VM. Relancez *Run workflow* : l'artefact contient maintenant
`gic-ndjeke-1.0.0-N.aab` (pour Google) et un `.apk` signé.

## 5. Compte Google Play Console

play.google.com/console — 25 USD une fois.

- **Compte « Organisation »** (recommandé pour le GIC) : il faut un numéro **D-U-N-S** (gratuit, demande sur dnb.com, 1 à 4 semaines) et le certificat du GIC. Pas de test obligatoire : vous pouvez publier dès que l'appli est validée.
- **Compte « Personnel »** (au nom d'une personne) : plus rapide à ouvrir, mais Google impose avant la publication un **test fermé avec au moins 12 testeurs inscrits pendant 14 jours d'affilée** (voir §7). Le nom de la personne apparaît comme développeur.

## 6. Créer l'application dans la Play Console

1. *Créer une application* : nom `GIC Ndjeke – Carnet de terrain`, langue Français, **Application**, **Gratuite**.
2. *Tableau de bord > Configurer l'application* : remplissez chaque rubrique avec `store/fiche-play-store.md`
   (confidentialité, accès, annonces, classification, public cible, sécurité des données…).
3. **Accès à l'application** : créez dans farmOS un compte `revue-google` (rôle *Farm Worker*, mot de passe fort) et indiquez :
   > Appuyez sur « Se connecter avec farmOS », saisissez l'identifiant `revue-google` et le mot de passe `…`, puis « Autoriser ».
   Supprimez les saisies de test de ce compte après la validation.
4. *Fiche principale du Play Store* : textes et visuels du dossier `store/`.
5. *Tests > Tests internes* > Créer une version > importez le `.aab` > « Utiliser Play App Signing » (accepté par défaut).
   Ajoutez votre adresse Gmail comme testeur, installez depuis le lien : c'est la vraie appli, signée par Google.

## 7. Publication

- **Compte organisation** : *Production* > Créer une version > même `.aab` (ou un plus récent) > *Envoyer pour examen*. Examen : de quelques heures à 7 jours.
- **Compte personnel** :
  1. *Tests > Test fermé* > créer la piste > version avec le `.aab` > pays : Cameroun (+ autres si besoin).
  2. Testeurs : une liste d'au moins **12 adresses Gmail** (membres du GIC, famille). Chacun ouvre le lien d'inscription, accepte, installe l'appli et la garde **14 jours**.
  3. Au 15ᵉ jour : *Tableau de bord > Demander l'accès à la production*, répondez au questionnaire (qui a testé, ce qui a été corrigé).
  4. Une fois accordé : *Production* > nouvelle version > envoi pour examen.

## 8. Mises à jour

Modifiez le code, `git commit`, `git push`, puis *Run workflow* avec un nouveau numéro (`1.0.1`…).
Le `versionCode` augmente tout seul (numéro d'exécution GitHub). Importez le nouvel `.aab` dans la piste voulue.

## Dépannage

| Symptôme | Cause probable / solution |
| --- | --- |
| Après la connexion farmOS, l'onglet reste ouvert | Redirect URI du client `gic_app` différente de `cm.gicndjeke.app://oauth` ; ou, si farmOS saute l'écran « Autoriser », Chrome bloque la redirection : laissez l'écran d'autorisation actif pour ce client |
| « Erreur … du serveur farmOS » ou « Failed to fetch » à la connexion | Allowed origins sans `https://localhost` (test CORS du §1) |
| L'appli dit « Session farmOS expirée » | Normal après 30 jours sans réseau : se reconnecter |
| Échec GitHub « Secret … manquant » ou signature | Revoir les 4 secrets du §4 (noms exacts, pas d'espace) |
| La Play Console refuse l'URL de confidentialité | Ouvrez-la dans un navigateur pour vérifier ; au besoin, publiez la même page sur GitHub Pages |

## Développement (optionnel)

```bash
npm ci && npm run build          # construit www/app.js
npx cap sync android             # copie vers le projet Android
npm run icons                    # régénère icônes et écran de démarrage depuis assets/
python3 dev/make_images.py       # régénère assets/ et visuels store/ depuis la charte
```

Tests dans un navigateur contre le faux farmOS du site (`ndjeke-prosperite/dev/mock-farmos.php`) :
`dev/test_app.py` (parcours complet, captures) et `dev/test_native.py` (retour OAuth façon Android).
