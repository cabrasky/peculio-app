# Roadmap de Peculio

**Estado actual (septiembre de 2026):** Peculio es un servicio que aloja su autor en
[peculio.cabrasky.net](https://peculio.cabrasky.net): web, API y APK de Android.
Todavía **no** se puede instalar en un servidor propio. Esa opción llegará más adelante (punto 1).

La portada de la web enseña estos planes en «Lo que viene», sin fechas.

---

## Planeado

### 1. Autoalojamiento (self-hosted)

**Objetivo:** que cualquiera pueda desplegar Peculio en su propia máquina, con sus datos ahí.

**Pendiente:**
- **Arranque de un solo comando** (Docker Compose con backend, frontend y Postgres):
  - configuración por variables de entorno;
  - un primer arranque guiado: crear el admin, configurar el correo y, si se quiere, Google.
- **Migraciones fiables.** Hoy `alembic upgrade` falla al arrancar por dos motivos:
  - `alembic.ini` no tiene sección `[alembic]`;
  - el id de la revisión 007 supera los 32 caracteres de `alembic_version`.

  El esquema se mantiene gracias a `create_all` + `schema_sync.sync_missing_columns`.
- **App móvil con servidor configurable.** Hoy la URL de la API está fija en `src/api.ts`. Los enlaces legales, el APK y el manifest de versiones tendrían que salir de ese servidor.
- **Sin dependencias del despliegue actual:**
  - Cuentas Claras opcional;
  - las URLs de `cabrasky.net` pasan a la configuración;
  - Kubernetes como opción, no como requisito.
- **Documentación** de instalación, copias de seguridad y actualizaciones.

### 2. Modo 100 % local + sincronización por QR y WebSocket

**Objetivo:**
- Usar Peculio sin cuenta ni servidor, con **todo en el dispositivo**: gastos, ingresos, metas, suscripciones, proyectos, categorías y fotos de tickets.
- Poder pasar esos datos a otro dispositivo en una **sesión** que se abre escaneando un **QR**, con la conexión por **WebSocket**.

**Idea de diseño:**
- **Almacenamiento local completo.** En la app, SQLite (`expo-sqlite`) y las fotos en el sistema de archivos. En la web, IndexedDB, con las fotos como `Blob`.
  - La app ya funciona sin conexión (caché + cola de operaciones en AsyncStorage).
  - En modo local, el dispositivo pasa a ser la fuente de verdad.
- **Emparejar por QR.** El dispositivo de origen abre una sesión y muestra un QR con:
  - el id de la sesión;
  - la URL del relay;
  - una clave efímera de un solo uso.

  El otro dispositivo lo escanea. Lo normal: la web muestra el QR y el móvil lo lee.
- **Transporte por WebSocket con sesión.** Un relay ligero reenvía los mensajes entre los dos dispositivos de la sesión.
  - Puede ser un endpoint WebSocket en el backend, o autoalojado.
  - No guarda nada.
  - La sesión caduca sola (p. ej. a los 10 minutos) o al cerrarla.
- **Cifrado de extremo a extremo** con la clave del QR (p. ej. X25519 + AES-GCM): el relay no puede leer los datos.
- **Protocolo:**
  - una instantánea inicial y después un registro de operaciones;
  - se reutiliza el formato de la cola offline actual: crear, actualizar y borrar por entidad, con ids estables;
  - en los conflictos gana la última escritura de cada registro, por marca de tiempo;
  - las fotos van por trozos.
- **Dos usos:**
  - copia única, para pasar todo a un móvil nuevo;
  - sincronización en vivo mientras la sesión siga abierta.
- **Convivencia con las cuentas:** poder subir un espacio local a una cuenta, o exportarlo (CSV / Excel), y al revés.

**Preguntas abiertas:**
- ¿El relay va en el backend actual o como servicio aparte (también autoalojable)?
- Límites de tamaño y compresión de las fotos al sincronizar.
- Cómo avisar y resolver los conflictos que la regla de «última escritura gana» no cubre bien (p. ej. borrar frente a editar).

---

## Hecho recientemente

- **Sistema visual «Salvia y tomate»** en la web, la app y los correos, con modo oscuro. Idiomas: es, en y pt.
- **Primer uso:** configuración inicial, carrusel de bienvenida y tutorial en la app.
- **Cuenta demo** pública de solo lectura, desde la portada.
- **Cuentas y textos legales:** eliminar la cuenta con todos sus datos, y privacidad, cookies, aviso legal y términos.
- **Panel de admin:** uso, usuarios, soporte técnico y estado del sistema.
- **Soporte** desde la web y la app.
