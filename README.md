# PWA Link Router

Extension pour Microsoft Edge (Linux) qui ouvre les liens cliqués dans les PWA
Outlook et Teams dans le navigateur de votre choix (Brave par défaut), au lieu
d'ouvrir une fenêtre Edge complète.

## Fonctionnement

- `extension/` : l'extension Edge (Manifest V3).
- `host/` : un petit programme Python (« native messaging host ») appelé par
  l'extension, qui lance le navigateur choisi avec l'URL.

Navigateurs reconnus : navigateur par défaut du système (`xdg-open`), Brave,
Google Chrome, Chromium, Firefox, Vivaldi, ou une commande personnalisée
(`{url}` est remplacé par le lien).

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
```
