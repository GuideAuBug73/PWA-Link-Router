# PWA Link Router

Extension pour Microsoft Edge (Linux) qui ouvre les liens cliqués dans les PWA
Outlook et Teams dans le navigateur de votre choix (Brave par défaut), au lieu
d'ouvrir une fenêtre Edge complète.

## Fonctionnement

- `extension/` : l'extension Edge (Manifest V3).
- `host/` : un petit programme Python (« native messaging host ») appelé par
  l'extension, qui lance le navigateur choisi avec l'URL.

L'extension s'injecte dans les pages Outlook et Teams (`outlook.office.com`,
`outlook.office365.com`, `outlook.live.com`, `outlook.cloud.microsoft`,
`teams.microsoft.com`, `teams.live.com`, `teams.cloud.microsoft`). Elle
intercepte les clics sur les liens (clic gauche et clic du milieu) et les
appels à `window.open` avant qu'Edge n'ouvre une fenêtre, puis transmet l'URL
au navigateur choisi. Aucune fenêtre Edge ne s'ouvre.

Restent dans Edge :

- les liens internes à l'application (même site que la page) ;
- Outlook, Teams et les pages de connexion Microsoft
  (`login.microsoftonline.com`, ...) ;
- les liens non web (`mailto:`, `tel:`, `ms-teams:`, ...) ;
- par défaut, tout ce qui se passe dans un onglet Edge normal : l'extension
  n'agit que dans les fenêtres de PWA.

Navigateurs reconnus : navigateur par défaut du système (`xdg-open`), Brave,
Google Chrome, Chromium, Firefox, Vivaldi, ou une commande personnalisée
(`{url}` est remplacé par le lien).

Si un lien échappe malgré tout à l'interception (par exemple via « Ouvrir dans
un nouvel onglet »), un filet de sécurité ferme la fenêtre Edge dès qu'elle
apparaît et envoie le lien au navigateur choisi. Le clic droit sur un lien
propose aussi « Ouvrir le lien dans Brave » (ou le navigateur choisi).

## Réglages

Page d'options : `edge://extensions` > PWA Link Router > Détails > Options
de l'extension. On y règle :

- le navigateur de destination (avec un bouton de test) ;
- une commande personnalisée, si votre navigateur n'est pas dans la liste ;
- l'activation de la redirection, la restriction aux fenêtres de PWA et le
  filet de sécurité ;
- la liste des sites qui restent dans Edge (`*.sharepoint.com` couvre le
  domaine et ses sous-domaines).

## Installation

1. Installer l'hôte natif :

   ```sh
   ./install.sh
   ```

2. Dans Edge, ouvrir `edge://extensions`, activer le mode développeur, puis
   « Charger l'extension décompressée » et choisir le dossier `extension/`.
   L'identifiant de l'extension doit être `hncnnfdenhfdmlplbicaogigpjecklje`.

Pour vérifier l'hôte sans passer par Edge :

```sh
python3 host/selftest.py list
python3 host/selftest.py https://example.com brave
```

## Désinstallation

```sh
./uninstall.sh
```

## Tests

```sh
python3 -m unittest discover -s host
node --test tests/*.test.js
node tests/e2e.js   # nécessite Playwright et Chromium
```
