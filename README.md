# Peculio (peculio-app): control de gastos personal

Web y API de **Peculio**, para apuntar gastos, ingresos, metas, suscripciones y proyectos, compartir gastos y ver estadísticas.
La app de Android está en [`cabrasky/peculio-mobile`](https://github.com/cabrasky/peculio-mobile).

- **Web:** https://peculio.cabrasky.net
- **API:** https://peculio.cabrasky.net/api (alias histórico: suelto.cabrasky.net)

> **Estado:** hoy Peculio es un **servicio alojado por su autor** en peculio.cabrasky.net.
> **Todavía no se puede instalar en un servidor propio.** El autoalojamiento está planeado para más adelante, junto con un modo 100 % local con sincronización entre dispositivos por QR (ver [ROADMAP.md](ROADMAP.md)).
> Las instrucciones de abajo son para **desarrollar** en local, no para montar una instancia propia.

| Parte | Tecnología |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, Recharts, React Router · fuentes servidas desde la propia web |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy (async), Alembic |
| **Acceso** | Email y contraseña o Google OAuth 2.0 · JWT |
| **BD** | PostgreSQL 16 |
| **Infra** | Docker, Kubernetes (kustomize), NGINX |
| **CI/CD** | Jenkins (multibranch): cada push a `main` despliega |

## Funciones

- **Gastos como en tu Excel:** categoría, motivo, tipo y método, con sugerencias según tu historial y los buckets Fijo / Puntual / Viajes / Inversión calculados solos.
- **Ingresos, metas, suscripciones y proyectos.** Las suscripciones tienen «Pagado» con un toque; los proyectos llevan su desglose de gastos.
- **Gastos compartidos y pagos pendientes.** Se pueden enviar a **Cuentas Claras** con el botón «Añadir a CC»; el vínculo queda en `ref_cc`.
- **Estadísticas:** resúmenes mensual y semanal, diagrama Sankey (Ingresos → Disponible → Gastos) y comparativas.
- **Excel:** plantilla, exportación e importación sin duplicados. También exportación a CSV.
- **Cuenta:**
  - preferencias (idioma, tema, presupuesto semanal) guardadas en la cuenta y en cookies;
  - ventana de bienvenida la primera vez;
  - eliminar la cuenta con todos sus datos.
- **Demo pública de solo lectura** desde la portada, con datos de ejemplo que se renuevan cada día.
- **Textos legales:** privacidad, cookies, aviso legal, términos y cómo eliminar la cuenta (`/legal/…`; `/legal/eliminar-cuenta` es el enlace de baja de la ficha de Google Play).
- **Soporte técnico:** los usuarios escriben desde la web o la app y el admin responde; las respuestas llegan también por email.
- **Panel de admin (`/admin`):**
  - uso de la app con gráficos;
  - usuarios: suspender, dar admin, reset, eliminar;
  - soporte;
  - estado del sistema y errores recientes;
  - App Android (ver abajo);
  - configuración de Google y del correo.
- **App Android, repositorio de versiones:**
  - cada build de Jenkins, y cada APK que se sube a mano desde el panel (por trozos), queda en `/opt/peculio-apk/builds/`;
  - el admin elige qué build se sirve en la portada y en el aviso de actualización de la app (`manifest.json`);
  - notas por versión y contador de descargas;
  - se pueden eliminar builds (salvo la servida): se borra también su fichero.
- **Correos** con la plantilla «Salvia y tomate» (logo incrustado, modo oscuro).
- **Diseño:** sistema visual «Salvia y tomate», modo claro y oscuro, disposición de escritorio y de móvil que se adapta sola. Idiomas: es, en y pt.

## Desarrollo local

```bash
# 1. Variables
cp .env.example .env            # credenciales de Google OAuth (opcional)

# 2. Backend + BD
docker compose up -d postgres backend

# 3. Frontend
cd frontend
npm install
npm run dev                     # o: npm run build && python3 spa-server.py 8121 0.0.0.0
```

Más detalle en [SETUP.MD](SETUP.MD). La API está documentada en [docs/API.md](docs/API.md).

### Tests

Los tests del backend son scripts de extremo a extremo con SQLite y `TestClient`:

```bash
cd backend
pip install -r requirements.txt aiosqlite httpx
python tests/test_admin_e2e.py      # también: test_support_e2e, test_delete_account_e2e,
                                    # test_demo_e2e, test_preferences_e2e, test_photo_e2e, test_emails
```

Frontend: `npx tsc -b`, `npx oxlint src` y `npx vite build`.

## Estructura

```
├── backend/
│   ├── app/
│   │   ├── main.py            # Arranque, middlewares (demo de solo lectura) y errores
│   │   ├── config.py          # Configuración por entorno
│   │   ├── models/            # Usuarios, gastos, ingresos, metas, suscripciones, proyectos, soporte…
│   │   ├── routers/           # auth, expenses, …, admin, support
│   │   ├── services/          # demo, cuentas, soporte, errores, recurrentes, fotos
│   │   ├── mail.py            # Envío de correos
│   │   └── email_layout.py    # Plantilla de los correos
│   ├── migrations/            # Alembic
│   └── tests/                 # Pruebas de extremo a extremo
├── frontend/
│   └── src/
│       ├── components/        # Páginas y piezas (admin/, Landing, SettingsPage…)
│       ├── legal/             # Textos legales (es/en/pt)
│       ├── locales/           # Traducciones (es/en/pt)
│       └── store.ts           # Caché local de los datos de la cuenta
├── k8s/                       # Manifiestos de Kubernetes (kustomize)
├── docker-compose.yml
├── ROADMAP.md
└── Jenkinsfile
```
