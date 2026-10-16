# Time Tracker

Application web personnelle de suivi des horaires de travail : on pointe ses entrées et sorties, l'app calcule l'heure de départ pour faire ses heures, la limite de 9 h, et tient à jour le compteur d'heures de l'entreprise.

Un seul fichier `index.html` (HTML, CSS et JavaScript sans framework ni étape de build), installable comme application (PWA) et utilisable hors ligne.

## Fonctions

**Journée**
- Bouton « Pointer entrée / Pointer sortie » à l'heure courante (horloge à la seconde) ; -5 min / -15 min proposés juste après pour corriger un pointage oublié.
- Créneaux début / fin modifiables à la main, ajout, suppression, passage de minuit.
- **Partir à** : heure de départ pour faire le temps dû, avec compte à rebours et anneau de progression de la journée.
- **Limite 9 h** : heure à laquelle 9 h de travail effectif sont atteintes (la pause n'y est pas comptée).
- Total travaillé et différence (travail + pause − temps dû), en h min et en décimal.
- Frise de la journée, alerte quand deux créneaux se chevauchent (leur temps commun serait compté deux fois).

**D'un jour à l'autre**
- À la première ouverture d'un nouveau jour, les créneaux de la veille passent dans un bloc **Hier** en lecture seule et la journée repart à zéro (annulable 10 s). Rien n'est vidé tant qu'un créneau est ouvert.
- **Compteur d'heures** (« Solde d'hier ») : chaque journée close ajoute sa différence, arrondie à la minute ; une journée sans créneau n'ajoute rien. Au premier passage dans un nouveau mois, le compteur est ramené à 20:00 s'il dépasse (le surplus n'est pas affiché). Correction manuelle possible. Rouge sous 0:00, normal jusqu'à 20:00 inclus, vert au-delà.

**Paramètres** : temps dû et pause, en heures décimales (8.26 = 8 h 16).

**Affichage** : thème sombre (défaut) ou clair ; une colonne sur mobile, deux colonnes au-delà de 1024 px (héros et compteur à gauche). Animations désactivées si le système demande de réduire les mouvements.

## Calculs

| Valeur | Formule |
|---|---|
| Total travail | somme des créneaux fermés (fin − début, +24 h si la fin est avant le début) |
| Différence | total + pause − temps dû |
| Partir à | début du créneau ouvert + (temps dû − total − pause) |
| Limite 9 h | début du créneau ouvert + (9 − total) |
| Ajout au compteur | différence de la journée close × 60, arrondie à la minute |

## Données et confidentialité

- Tout reste **sur l'appareil**, dans le `localStorage` du navigateur : aucune requête réseau vers un tiers, aucun compte, aucune statistique d'usage.
- Clés : `horaireData` (temps dû, pause, créneaux, date, journée précédente, compteur) et `theme`.
- Les données ne se synchronisent pas entre appareils ni entre navigateurs, et sont perdues si l'on efface les données du site. Sur iPhone, installer l'app sur l'écran d'accueil évite l'effacement automatique de Safari après plusieurs jours sans visite.

## Sécurité

- Aucun secret, aucune dépendance tierce, aucun appel réseau sortant.
- **Politique de sécurité du contenu** (balise `Content-Security-Policy`) : tout doit venir de la même origine ; images, polices, connexions et formulaires vers un autre domaine sont bloqués. `'unsafe-inline'` reste nécessaire tant que le script et les styles sont intégrés à la page.
- **Données relues validées** : heures au format `HH:MM`, dates `AAAA-MM-JJ`, nombres bornés ; toute autre valeur est ignorée. Le `localStorage` est partagé par toutes les pages d'une même origine (sur `*.github.io`, tous les projets du même compte) : sans cette validation, une valeur injectée par une autre page pouvait s'exécuter dans l'app.
- Un stockage illisible ne bloque plus l'app : elle repart d'une journée vide.
- Le service worker ne met en cache que la vraie page (réponse 200, même origine, sans redirection) : une page d'erreur ne peut plus remplacer l'app hors ligne.
- Limites connues : la protection contre l'intégration dans une autre page (`frame-ancestors`, en-têtes HTTP) ne peut pas être posée par une balise `<meta>` ; elle dépend de l'hébergeur. Les données sont stockées en clair sur l'appareil.

## Installation et hors ligne

- Ouvrir l'app dans le navigateur, puis « Ajouter à l'écran d'accueil » (iOS) ou « Installer l'application » (Android, Chrome).
- Le service worker (`sw.js`) met en cache la page, les polices et les icônes : l'app s'ouvre sans réseau. Après une mise à jour, la nouvelle version peut n'apparaître qu'au deuxième lancement.

## Structure

```
index.html     l'application (styles, interface et logique)
tests/         tests navigateur et version d'origine figée (référence)
sw.js          service worker : cache hors ligne
manifest.json  manifeste PWA (nom, couleurs, icônes)
icons/         icônes PNG 180, 192, 512 et 512 « maskable »
fonts/         Bricolage Grotesque et Instrument Sans (woff2, licence OFL 1.1)
```

## Développement

L'app n'a aucune dépendance ni build (`package.json` ne sert qu'aux tests). Pour l'essayer avec le service worker, servir le dossier en HTTP (un `file://` ne l'active pas) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000/
```

La page est servie « réseau d'abord » : une nouvelle version d'`index.html` arrive dès qu'il y a du réseau. Les polices, icônes et le manifeste sont servis « cache d'abord » : après les avoir modifiés, incrémenter `CACHE_NAME` dans `sw.js` pour que les appareils installés les récupèrent.

## Tests

Tests navigateur automatisés (Playwright, Chromium), lancés par GitHub Actions à chaque pull request et à chaque push sur `main` (`.github/workflows/tests.yml`). En local :

```bash
npm ci
npx playwright install chromium   # une fois
npm test                          # toutes les suites (environ 5 min)
npm test -- mobile                # une seule suite
```

| Suite | Ce qu'elle vérifie |
|---|---|
| `mobile` | calculs identiques à la version d'origine (`tests/legacy/`), pointage, correction, effacement, nouvelle journée, compteur et plafond mensuel, chevauchement, horloge (minute et secondes), mise en page à 360-390 px sans débordement, thème, installabilité, animations réduites |
| `desktop` | grand écran (1024 à 1920 px) : deux colonnes, héros et compteur à gauche, ordre fixe, colonne collante |
| `cta` | libellé du bouton de pointage sur une ligne de 360 à 1280 px |
| `security` | données piégées dans le stockage, stockage corrompu, CSP, page d'erreur et cache hors ligne |

Les tests utilisent une horloge simulée : aucune dépendance à l'heure réelle. Les captures sont écrites dans `tests/output/` (ignoré par Git) et jointes au run GitHub en cas d'échec.

## Licences

Polices sous SIL Open Font License 1.1 (voir `fonts/OFL-*.txt`).
