# SiteFactory Cloudflare Monorepo

Mono-repo Cloudflare avec un front React/Vite déployé sur Pages, une API Hono sur Workers et une base Cloudflare D1.

## Structure

```
frontend/  # Application Vite/React déployée sur Cloudflare Pages
worker/    # API Cloudflare Worker + migrations D1
```

## Pré-requis

- [Node.js 20+](https://nodejs.org/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Compte Cloudflare avec accès D1 (beta activée)

## Installation des dépendances

```bash
cd worker
npm install
cd ../frontend
npm install
```

## Développement local

1. Configurez les variables d'environnement locales pour le Worker :

   ```bash
   cd worker
   cp .env.example .dev.vars # (à créer manuellement si besoin)
   ```

   Créez un fichier `.dev.vars` avec :

   ```
   ORIGIN=http://localhost:5173
   ```

2. Terminal A – API Worker :

   ```bash
   cd worker
   npm run dev
   ```

   Le Worker écoute sur `http://localhost:8787`.

3. Terminal B – Frontend Vite :

   ```bash
   cd frontend
   npm run dev
   ```

   Le serveur Vite écoute sur `http://localhost:5173` et proxifie `/api` vers le Worker.

4. Testez le CRUD sur `http://localhost:5173`.

### Migrations locales

Pour appliquer les migrations D1 sur la base locale simulée par Wrangler :

```bash
cd worker
npm run migrate
```

## Déploiement

1. **Créer la base D1**

   ```bash
   wrangler d1 create sitefactory
   ```

   Récupérez l'`database_id` retourné et remplacez `REPLACE_WITH_YOUR_DATABASE_ID` dans `worker/wrangler.toml`.

2. **Appliquer les migrations**

   ```bash
   cd worker
   npm run migrate
   ```

3. **Déployer l'API**

   ```bash
   npm run deploy
   ```

4. **Déployer le frontend**

   - Dans Cloudflare Pages, créez un projet connecté au dossier `frontend`.
   - Commande de build : `npm run build`
   - Répertoire de sortie : `dist`
   - Variables d'environnement :
     - `VITE_API_BASE_URL=https://<votre-worker>.workers.dev`

5. **CORS / ORIGIN**

   - Dans `worker/wrangler.toml`, définissez `ORIGIN` sur l'URL Pages de production (ex : `https://mon-site.pages.dev`).
   - Pour les prévisualisations, listez plusieurs origines séparées par des virgules. Les motifs joker `*` sont acceptés (ex : `https://mon-site.pages.dev,https://*.pages.dev`).

## API

- `GET /health` → `{ "ok": true }`
- `GET /projects` → liste des projets
- `POST /projects` → crée un projet `{ name, description? }`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

Les erreurs sont renvoyées au format `{ "error": "message" }`.

## Migrations D1

- `001_init.sql` : création de la table `projects`
- `002_add_created_at_index.sql` : index sur `created_at`

Appliquez-les avec :

```bash
cd worker
npm run migrate
```

