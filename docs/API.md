# API de Peculio — Documentación para desarrolladores

Acceso programático a tus datos de **Peculio** (gastos, ingresos, metas,
suscripciones, proyectos y categorías) sin usar la web.

- **Base URL:** `https://peculio.cabrasky.net/api`
- **Autenticación:** cabecera `X-API-Key` con una clave que creas tú mismo en la
  web (**Más → Desarrollador**). También sigue funcionando el JWT (`Authorization:
  Bearer <token>`) para la web y la app móvil.
- **Formato:** JSON. Fechas en `YYYY-MM-DD`.

---

## 1. Activar el modo Desarrollador

Es **autoservicio**: entra en la web con tu cuenta → **Más → Desarrollador** →
**Activar modo Desarrollador**. Desde ahí creas y revocas tus API keys.

> La clave completa se muestra **una sola vez** al crearla. En la base de datos
> solo se guarda su hash SHA-256, así que si la pierdes tendrás que crear otra.

---

## 2. Autenticación

Todas las peticiones a endpoints de datos llevan:

```
X-API-Key: mb_live_...
```

Opcionalmente también puedes autenticarte con el token de sesión de la web:

```
Authorization: Bearer <jwt>
```

Las API keys son **personales**: solo acceden a los datos del usuario que las
creó. Al revocar una clave, deja de funcionar de inmediato.

---

## 3. Endpoints

Todos los endpoints de datos devuelven un array de objetos (o el objeto creado/
modificado). Los campos de respuesta incluyen `id`, `user_id`, `created_at`, etc.

### 3.1 Gastos — `/expenses`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/expenses` | Lista tus gastos. Query params opcionales: `month`, `year`, `skip`, `limit` |
| `GET`  | `/expenses/{id}` | Un gasto concreto |
| `POST` | `/expenses` | Crear un gasto |
| `PUT`  | `/expenses/{id}` | Modificar un gasto |
| `DELETE` | `/expenses/{id}` | Borrar un gasto |

**Campos de un gasto** (solo `date`, `description` y `amount` son obligatorios):

| Campo | Tipo | Notas |
|-------|------|-------|
| `date` | date | `YYYY-MM-DD` (solo fecha, no hay hora) |
| `description` | string | |
| `amount` | float | en euros, mayor que 0 |
| `purpose` | string | categoría (p. ej. `Comida`, `Ocio`, `Productos`) |
| `motive` | string | subcategoría / motivo |
| `type` | string | `Puntual`, `Fijo`, `Viajes`, `Inversión`… |
| `method` | string | `Tarjeta`, `Efectivo`, `Bizum`… |
| `is_shared` | bool | el gasto incluye importes de otras personas |
| `is_invitation` | bool | es una invitación sin devolución |
| `debtors` | string | nombres de quienes deben su parte |
| `participants` | string | JSON con el reparto del gasto compartido |
| `cc_reference` | string | vínculo a Cuentas Claras (interno) |
| `repayment_method` | string | método de devolución |
| `repaid` | bool | indica si la deuda ya fue devuelta |
| `personal_share` | float | parte del gasto que te corresponde |
| `trip` | string | viaje asociado |
| `project_id` | string | id del proyecto al que enlazarlo |

### 3.2 Ingresos — `/incomes`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` / `POST` | `/incomes` | listar / crear |
| `GET` / `PUT` / `DELETE` | `/incomes/{id}` | uno / modificar / borrar |

Campos: `date` (date), `description` (string), `amount` (float), `category`
(string), `notes` (string).

### 3.3 Metas — `/goals`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` / `POST` | `/goals` | listar / crear |
| `GET` / `PUT` / `DELETE` | `/goals/{id}` | uno / modificar / borrar |

Campos: `name`, `target_amount` (float), `current_amount` (float, 0 por defecto),
`deadline` (date, opcional), `category`, `notes`.

### 3.4 Suscripciones — `/subscriptions`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` / `POST` | `/subscriptions` | listar / crear |
| `GET` / `PUT` / `DELETE` | `/subscriptions/{id}` | uno / modificar / borrar |

Campos: `name`, `amount`, `billing_cycle` (`weekly` | `monthly` | `quarterly` |
`yearly`), `next_billing` (date), `category`, `method`, `notes`, `active` (bool).
`auto_charge` (bool, por defecto `false`): si es `true`, al llegar `next_billing` el servidor
apunta el gasto por su cuenta, con el importe de ese momento, y avanza la fecha un ciclo.

### 3.5 Proyectos — `/projects`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` / `POST` | `/projects` | listar / crear |
| `PUT` / `DELETE` | `/projects/{id}` | renombrar / borrar |

Campos: `name`.

### 3.6 Categorías — `/categories`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` / `POST` | `/categories` | listar / crear (`kind` = `expense` o `income`) |
| `PUT` / `DELETE` | `/categories/{id}` | renombrar / borrar |

### 3.7 Desarrollador — `/developer`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/developer` | estado del modo desarrollador |
| `PUT`  | `/developer/toggle` | activar/desactivar el modo (autoservicio) |
| `GET`  | `/developer/keys` | listar tus API keys (sin la clave completa) |
| `POST` | `/developer/keys` | crear una API key (devuelve la clave UNA vez) |
| `DELETE` | `/developer/keys/{id}` | revocar una API key |

> Los endpoints de `/developer` se autentican con **JWT** (sesión web), no con
> `X-API-Key`, para evitar que una clave revoque a otras.

---

## 4. Ejemplos

### Crear un gasto

```bash
curl -X POST https://peculio.cabrasky.net/api/expenses \
  -H "X-API-Key: mb_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-09-17",
    "description": "Cine con Luz",
    "amount": 15.90,
    "purpose": "Ocio",
    "method": "Tarjeta"
  }'
```

### Listar gastos de septiembre de 2026

```bash
curl -H "X-API-Key: mb_live_..." \
  "https://peculio.cabrasky.net/api/expenses?month=9&year=2026"
```

### Crear un ingreso

```bash
curl -X POST https://peculio.cabrasky.net/api/incomes \
  -H "X-API-Key: mb_live_..." \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-09-01","description":"Nómina","amount":2200,"category":"Trabajo"}'
```

### Python

```python
import requests

API = "https://peculio.cabrasky.net/api"
HEADERS = {"X-API-Key": "mb_live_...", "Content-Type": "application/json"}

# añadir gasto
requests.post(f"{API}/expenses", headers=HEADERS, json={
    "date": "2026-09-17", "description": "Cine", "amount": 15.90,
})

# listar gastos
for e in requests.get(f"{API}/expenses", headers=HEADERS).json():
    print(e["date"], e["description"], e["amount"])
```

---

## 5. Errores

| Código | Significado |
|--------|-------------|
| `401` | API key inválida o revocada (o token expirado) |
| `403` | Modo Desarrollador no activado |
| `404` | Recurso no encontrado |
| `422` | Validación fallida (campos mal formados) |
