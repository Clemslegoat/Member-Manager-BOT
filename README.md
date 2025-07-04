# Discord Member Bot

Bot Discord pour gérer automatiquement les membres et afficher les statistiques du serveur.

## Fonctionnalités

- Attribution automatique de rôles aux nouveaux membres
- Affichage en temps réel du nombre de membres dans des salons vocaux
- Commandes slash pour configurer et supprimer les statistiques
- Mise à jour automatique des statistiques

## Configuration

1. Copiez le fichier `.env.example` vers `.env`
2. Remplissez les variables d'environnement :
   - `DISCORD_TOKEN` : Token de votre bot Discord
   - `ROLE_ID` : ID du rôle à attribuer automatiquement
   - `UPDATE_INTERVAL` : Intervalle de mise à jour en millisecondes (défaut: 30000)
   - `STATS_CATEGORY_NAME` : Nom de la catégorie pour les statistiques (défaut: "📈 Stats")

## Installation locale

```bash
npm install
npm start
```

## Commandes Discord

- `/setup-stats` : Configure les salons de statistiques (Admin requis)
- `/remove-stats` : Supprime les salons de statistiques (Admin requis)

## Déploiement

Ce bot est configuré pour être déployé sur Railway avec GitHub.

## Permissions requises

Le bot nécessite les permissions suivantes :
- Gérer les salons
- Voir les salons
- Se connecter aux salons vocaux
- Gérer les rôles
