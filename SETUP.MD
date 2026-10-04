# peculio-app — Peculio Setup Guide

Setup for Peculio (web + API). Mobile app: `cabrasky/peculio-mobile` (React Native/Expo).

> **Note:** this guide covers **local development** and the author's own deployment (Kubernetes + Jenkins).
> Peculio is currently a hosted service at https://peculio.cabrasky.net and is **not yet supported
> as a self-hosted install**. Self-hosting is planned; see [ROADMAP.md](ROADMAP.md).

## Prerequisites

- Docker & Docker Compose
- Kubernetes cluster (for production)
- Jenkins instance (for CI/CD)
- Google OAuth credentials (for authentication)

---

## Local Development

### 1. Clone & env

```bash
git clone https://github.com/cabrasky/peculio-app.git
cd peculio-app
cp .env.example .env
```

Fill in `.env` with your Google OAuth client ID and secret.

### 2. Start backend + database

```bash
docker compose up -d postgres backend
```

The API will be available at `http://localhost:8000`.

### 3. Build frontend

```bash
npm install
npm run build
```

### 4. Start frontend

```bash
docker compose up -d frontend
# or directly:
python3 spa-server.py 8121 0.0.0.0
```

Open `http://localhost:8121`.

---

## Docker Images

Build and push images to your registry:

```bash
# Backend
docker build -t 100.111.131.248:5000/gastos-backend:latest ./backend
docker push 100.111.131.248:5000/gastos-backend:latest

# Frontend (multi-stage: build + nginx)
docker build -t 100.111.131.248:5000/gastos-frontend:latest -f Dockerfile.frontend .
docker push 100.111.131.248:5000/gastos-frontend:latest
```

---

## Kubernetes Deployment

### Prerequisites

- `kubectl` configured with cluster access
- Registry credentials on each node (`/etc/containers/registries.conf` or `imagePullSecrets`)

### Deploy

```bash
# Production
kubectl apply -k k8s/overlays/production

# Preview (ephemeral)
kubectl create namespace gastos-preview-feature-x
kubectl apply -k k8s/overlays/preview -n gastos-preview-feature-x
```

### Verify

```bash
kubectl get all -n gastos
kubectl rollout status deployment/backend -n gastos
kubectl rollout status deployment/frontend -n gastos
```

### Access

The app will be available at `https://peculio.cabrasky.net` (configured in `k8s/base/ingress.yaml`).

---

## Jenkins CI/CD

### Setup

1. Add the following credentials in Jenkins:
   - `notification-email` — email for build notifications

2. Create a Multibranch Pipeline pointing to:
   ```
   https://github.com/cabrasky/gastos-app.git
   ```

3. Jenkins will use the `Jenkinsfile` at the root of the repo.

### GitHub Webhook

The webhook is already configured on the repository. It pushes `push` and `pull_request` events to:

```
https://jenkins.cabrasky.net/github-webhook/
```

This triggers the multibranch pipeline automatically on every push and PR.

To verify:
```bash
gh api repos/cabrasky/gastos-app/hooks --jq '.[] | {url: .config.url, events, active}'
```

### Pipeline Behaviour

| Trigger | Action |
|---------|--------|
| Push to `backend/**` | Build & push backend image |
| Push to `src/**` | Build & push frontend image |
| Push to `k8s/**`, `docker-compose*`, `Jenkinsfile` | Deploy only (no rebuild) |
| PR opened | Preview deploy |
| Push to `main` | Production deploy |
| Weekly (Mon 6am) | Cleanup stale previews |

### Parameters

- `FORCE_PREVIEW_DEPLOY` — deploy any branch as preview
- `FORCE_REBUILD` — skip change detection, rebuild everything
- `FORCE_PROD_DEPLOY` — redeploy existing images (main only)
- `DEPLOY_ID` — custom preview namespace slug

---

## Project Structure

```
gastos-app/
├── backend/              # FastAPI Python backend
│   ├── app/
│   │   ├── main.py       # FastAPI entry point
│   │   ├── config.py     # Environment config
│   │   ├── database.py   # SQLAlchemy async engine
│   │   ├── models/       # DB models (User, Expense, Income, Goal, Sub)
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   └── routers/      # API route handlers
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/             # React + Vite SPA
│   ├── src/
│   ├── spa-server.py     # Dev SPA HTTP server
│   └── package.json
├── k8s/                  # Kubernetes manifests
│   ├── base/             # Kustomize base
│   │   ├── backend/      # Deployment + Service
│   │   ├── database/     # StatefulSet + Service
│   │   ├── frontend/     # Deployment + Service
│   │   ├── ingress.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── preview/      # Preview env (1 replica)
│       └── production/   # Production env (3 replicas)
├── docker-compose.yml
├── Jenkinsfile
├── Jenkinsfile.cleanup
├── .env.example
└── SETUP.MD
```
