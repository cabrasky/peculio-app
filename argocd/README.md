# Despliegue GitOps con Argo CD

`peculio-app` se despliega en el clúster **Hetzner prod**, namespace `peculio`,
gestionado por **Argo CD**.

- **Application**: `argocd/peculio.yaml` (sync **manual** — es producción).
- **Overlay**: `k8s/overlays/production`.
- **Imágenes**: `registry.cabrasky.net/peculio-{backend,frontend}` (registro en unraid).
- **Image Updater**: sigue tags `X.Y.Z-<sha>` y hace write-back a Git (rama main).

## Flujo

```
Jenkins (build + push)  ->  registry.cabrasky.net
        ->  Image Updater (commit del tag)  ->  Argo CD  ->  sync a Hetzner (ns peculio)
```

Jenkins **ya no hace `kubectl apply`**: solo construye y publica imágenes.

## Aplicar la Application

```bash
kubectl apply -f argocd/peculio.yaml
```

El secret `peculio-secrets` (OAuth, JWT, credenciales DB) se gestiona aparte.

> Rebrand desde "Suelto" (namespace `suelto`) a **Peculio** (namespace
> `peculio`), incluyendo la base de datos (`suelto`→`peculio`, `suelto_user`→`peculio_user`). `suelto.cabrasky.net` queda como alias.
