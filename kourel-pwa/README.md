# Saytu Kurel - PWA de Gestion d'Appel

Cette application est une PWA (Progressive Web App) conçue pour la gestion des présences des membres de la Fédération Universitaire.

## Fonctionnalités
- ✅ Authentification sécurisée via Supabase
- ✅ Gestion multi-Kourels
- ✅ Pointage des présences (Présent, Absent, Retard, Excusé)
- ✅ Mode Hors-ligne (synchronisation automatique au retour de la connexion)
- ✅ Historique complet et statistiques d'assiduité
- ✅ Exportation de rapports en PDF
- ✅ Gestion des membres (ajout, modification, désactivation)
- ✅ Importation massive de membres via CSV
- ✅ Alertes d'absences répétées avec lien WhatsApp direct

## Installation

1. Installez les dépendances :
   ```bash
   npm install
   ```

2. Configurez les variables d'environnement dans un fichier `.env` :
   ```
   VITE_SUPABASE_URL=votre_url_supabase
   VITE_SUPABASE_ANON_KEY=votre_cle_anon_supabase
   ```

3. Lancez le serveur de développement :
   ```bash
   npm run dev
   ```

## Base de données
Utilisez le fichier `kourel_setup.sql` à la racine du projet pour configurer votre base de données Supabase, incluant les tables et les politiques de sécurité (RLS).

## Déploiement
Le projet est prêt à être déployé sur Vercel, Netlify ou toute autre plateforme statique.
Pour construire la version de production :
```bash
npm run build
```
