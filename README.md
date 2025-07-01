# Dashboard Vincennes

Dashboard en temps réel pour l'Hippodrome de Vincennes.

## Fonctionnalités

✅ Horaires temps réel RER/Bus  
✅ Météo temps réel avec icônes  
✅ Vélib et circulation (structure prête)  
✅ Design responsive, prêt pour écran 16/9 portrait  
✅ Aucune clé exposée : tout passe par votre proxy Cloudflare sécurisé.

## Déploiement

1. Copier tous les fichiers et dossiers dans un répertoire `dashboard-vincennes/`.
2. Héberger sur un serveur statique ou GitHub Pages.
3. Mettre à jour les assets si besoin (logos, fond…).

## Config API

- Proxy utilisé : https://ratp-proxy.hippodrome-proxy42.workers.dev/
- Les clés API sont gérées côté proxy pour plus de sécurité.

## Mise à jour des données GTFS

Les fichiers GTFS (arrêts et premiers/derniers passages) peuvent être mis à
jour à l'aide du script `scripts/update-gtfs.js`. Utilisez Node.js 20 ou une
version plus récente, puis installez la dépendance `node-fetch` et exécutez :

```bash
npm install node-fetch
node scripts/update-gtfs.js
```

Les fichiers JSON générés sont enregistrés dans le dossier `static/`.
