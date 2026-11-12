# Fase de publicación: programar y publicar

Decisiones (9 nov 2026): los videos salen del **Google Drive** del usuario, se publican a la hora programada con **pg_cron de Supabase** (cada 5 minutos) y se incluyen **las 4 redes**.

## Flujo

1. En `/publicar` el usuario elige un video de su Drive con **Google Picker** (permiso `drive.file`: Metrix solo ve los archivos que el usuario elige). El token del Picker vive solo en memoria del navegador.
2. Escribe el texto (uno general y, si quiere, uno por red), el título de YouTube, elige redes y la hora (Ciudad de México) o «Ahora».
3. La Server Action guarda `scheduled_posts` y un `scheduled_post_targets` por red (con service_role, después de revisar la sesión).
4. `pg_cron` (job `metrix-publish`) llama a `POST /api/cron/publish` cada 5 minutos con `Authorization: Bearer <CRON_SECRET>`; el secreto está en Vault (`metrix_cron_secret`).
5. La ruta reserva hasta 8 destinos vencidos (`claim_publish_targets`, con `for update skip locked` y un lease de 290 s), descarga el video de Drive con el token de la conexión **Google Drive** (una vez por publicación y corrida, y solo si hace falta) y avanza la máquina de estados de cada red un paso.
6. Cada destino termina en `published` (id y enlace) o `failed` (motivo claro). Los errores transitorios se reintentan 2 veces (10 y 20 min). Si una red tarda más de 3 h en procesar, se marca como fallida. Cada resultado crea una alerta en `/alertas`.

## Google Drive va aparte

Google rechaza `drive.file` en la misma autorización que los permisos de YouTube (`Error 400: invalid_request`, «scopes that cannot be requested together»). Por eso Drive es su propia conexión (`platform = 'drive'`), que pide solo `openid email drive.file`, nunca se sincroniza y sirve para elegir y descargar los videos.

## Por red

| Red | Permisos | Cómo sube | Límite actual |
|---|---|---|---|
| Instagram | `instagram_content_publish` | Contenedor `REELS` con `upload_type=resumable` → bytes a `rupload.facebook.com` → espera `status_code=FINISHED` → `media_publish` | Público |
| Facebook | `pages_manage_posts` | `/{page}/video_reels` fases start → upload (rupload) → finish con `video_state=PUBLISHED` → espera `publishing_phase=complete` | Público |
| YouTube | `youtube.upload` | Sesión reanudable de `videos.insert` + un PUT con los bytes; después `videos.list?part=status` cada 10 s hasta `processed` (Publicado) o `failed`/`rejected` (Falló con el motivo de YouTube). Visibilidad y «hecho para niños» los elige el usuario en cada publicación | Google fuerza **privado** hasta que el proyecto pase la auditoría de la API de YouTube; Metrix lo avisa en la nota de la publicación (ver `docs/GOOGLE-REVIEW.md`) |
| TikTok | `video.publish` (con `TIKTOK_PUBLISH=true`) | `creator_info` (también al abrir el formulario) → `video/init` (`FILE_UPLOAD`, partes de 10 MB si pasa de 64 MB) con la privacidad, interacciones y divulgación comercial elegidas → PUT por partes → `status/fetch` | Hasta la auditoría de TikTok solo acepta **Solo yo** (o cualquier privacidad con la cuenta privada); ver `docs/TIKTOK-REVIEW.md` |

Las opciones por red se guardan en `scheduled_post_targets.options` (`src/lib/publishing/options.ts`) y no tienen valor por defecto: el formulario y la herramienta MCP `programar_publicacion` las piden en cada publicación, como exigen las guías de TikTok.

Código: `src/lib/publishing/` (`runner.ts`, `meta-publishers.ts`, `youtube-publisher.ts`, `tiktok-publisher.ts`, `drive.ts`, `scheduling.ts`, `deps.ts`), ruta `src/app/api/cron/publish/route.ts`, UI `src/app/(dashboard)/publicar/`.

## Lo que falta configurar (usuario)

1. **Google Cloud (proyecto Metrix)**
   - Habilitar **Google Drive API** y **Google Picker API**.
   - Crear una **API key** restringida a la Google Picker API y a los sitios `https://metrix-swart-mu.vercel.app/*` y `http://localhost:3000/*`.
   - En «Acceso a los datos», agregar `.../auth/drive.file` y `.../auth/youtube.upload`.
   - En «Clientes» → el cliente web: agregar `https://metrix-swart-mu.vercel.app` y `http://localhost:3000` como **orígenes de JavaScript autorizados** (el Picker pide el token desde el navegador), y `https://metrix-swart-mu.vercel.app/api/connect/drive/callback` y `http://localhost:3000/api/connect/drive/callback` como **URIs de redireccionamiento autorizados**.
2. **Variables** en `.env.local` y en Vercel: `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER` (número del proyecto) y `TIKTOK_PUBLISH=true`.
3. **Secreto del cron en Vault**: `pnpm db:config` (copia `CRON_SECRET` de `.env.local` a Vault con `set_cron_secret`). Sin esto la ruta responde 401 y no se publica nada.
4. **Reconectar** YouTube, Meta y TikTok para aceptar los permisos nuevos, y **conectar Google Drive** con la cuenta donde están los videos (puede ser otra que la del canal).
5. El Picker se abre con la cuenta conectada en Google Drive (`drive.file` es por usuario y por proyecto: el archivo se elige y se descarga con la misma cuenta).

## Pendiente a futuro

- Auditoría de Google (YouTube público) y de TikTok (privacidad pública): cambiar `YOUTUBE_PRIVACY` y `TIKTOK_PRIVACY`.
- Videos de más de ~1 GB: hoy se rechazan (memoria de la función).
