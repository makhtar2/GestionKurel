# Guide d'Installation - Saytu Kurel (PWA + Supabase)

Ce guide explique comment mettre en place la nouvelle version de l'application basée sur React et Supabase.

## 1. Configuration de Supabase

1. Créez un projet sur [Supabase](https://supabase.com/).
2. Allez dans l'onglet **SQL Editor**.
3. Copiez et exécutez le contenu du fichier `kourel_setup.sql` qui se trouve à la racine de ce projet. Cela créera :
   - Les tables : `kourels`, `profiles`, `members`, `attendance`.
   - Les politiques de sécurité (RLS) pour protéger les données.
   - Les données de base pour les Kourels.
4. Allez dans **Project Settings > API** et récupérez :
   - `Project URL`
   - `anon public` key

## 2. Configuration de l'Application (PWA)

1. Accédez au dossier de l'application :
   ```bash
   cd kourel-pwa
   ```
2. Créez un fichier `.env` en copiant le modèle `.env.example` :
   ```bash
   cp .env.example .env
   ```
3. Remplissez le fichier `.env` avec vos identifiants Supabase récupérés à l'étape 1.
4. Installez les dépendances et lancez l'application :
   ```bash
   npm install
   ```

## 3. Gestion des Utilisateurs (Surveillants)

Pour que les surveillants puissent se connecter :
1. Allez dans **Authentication > Users** sur Supabase.
2. Ajoutez les utilisateurs (email/mot de passe).
3. Important : Les rôles sont définis dans la table `profiles`. Par défaut, le script SQL attribue des rôles à certains emails. Vous pouvez modifier ces attributions directement dans la table `profiles` via le **Table Editor**.

## 4. Importation de Membres

Une fois connecté en tant que surveillant ou coordinateur, vous pouvez ajouter des membres :
- Individuellement via le bouton "Ajouter un membre".
- Par lot via le bouton "Importer CSV" (format attendu : `Nom, Téléphone, Faculté, Niveau`).
