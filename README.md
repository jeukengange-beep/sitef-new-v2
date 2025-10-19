# SiteFactory Cloudflare Monorepo

Mono-repo Cloudflare avec un front React/Vite déployé sur Pages, une API Hono sur Workers et une base Cloudflare D1 pour stocker les projets.

## Structure

```
frontend/  # Application Vite/React déployée sur Cloudflare Pages
worker/    # API Cloudflare Worker + accès D1, OpenAI et Pexels
```

## Pré-requis

- [Node.js 20+](https://nodejs.org/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Compte Cloudflare avec l'accès D1 activé

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
   cp .env.example .dev.vars
   ```

   Fichier `.dev.vars` :

   ```
   ORIGIN=http://localhost:5173
   OPENAI_API_KEY=<votre-cle-openai>
   PEXELS_API_KEY=<votre-cle-pexels>
   ```

   Les liaisons D1 sont gérées automatiquement par Wrangler en local (`sitefactory` dans `wrangler.toml`).

2. Appliquez les migrations D1 (en local) :

   ```bash
   npm run migrate
   ```

3. Terminal A – API Worker :

   ```bash
   cd worker
   npm run dev
   ```

   Le Worker écoute sur `http://localhost:8787`.

4. Terminal B – Frontend Vite :

   ```bash
   cd frontend
   npm run dev
   ```

   Le serveur Vite écoute sur `http://localhost:5173` et proxifie `/api` vers le Worker.

5. Testez le CRUD sur `http://localhost:5173`.

## Déploiement

1. **Créer la base D1**

   ```bash
   wrangler d1 create sitefactory
   ```

   Récupérez l'`database_id` et remplacez la valeur dans `worker/wrangler.toml`.

2. **Appliquer les migrations en production**

   ```bash
   cd worker
   npm run migrate
   ```

3. **Configurer les secrets Worker**

   ```bash
   wrangler secret put OPENAI_API_KEY
   wrangler secret put PEXELS_API_KEY
   ```

   Dans `worker/wrangler.toml`, définissez `ORIGIN` sur l'URL Cloudflare Pages de production (ex. `https://mon-site.pages.dev`).

4. **Déployer l'API**

   ```bash
   npm run deploy
   ```

5. **Déployer le frontend**

   - Dans Cloudflare Pages, créez un projet connecté au dossier `frontend`.
   - Commande de build : `npm run build`
   - Répertoire de sortie : `dist`
   - Variables d'environnement :
     - `VITE_API_BASE_URL=https://<votre-worker>.workers.dev`

6. **CORS / ORIGIN**

   - `ORIGIN` accepte plusieurs valeurs séparées par des virgules et prend en charge les jokers `*` (ex. `https://mon-site.pages.dev,https://*.pages.dev`).

## API

- `GET /health` → `{ "ok": true }`
- `POST /ai/complete` → `{ "text": "..." }` (body : `{ "prompt": "...", "model"?: "..." }`)
- `GET /media/pexels?query=...&page?=&per_page?=` → recherche Pexels normalisée `{ photos: [...], page, per_page, total_results }`
- `GET /projects` → liste des projets stockés dans D1
- `POST /projects` → crée un projet `{ name }`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

Les erreurs sont renvoyées au format `{ "error": "message" }`.
