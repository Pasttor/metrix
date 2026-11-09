# Fase de publicación: programar y publicar

Decisiones (9 nov 2026): los videos salen del **Google Drive** del usuario, se publican a la hora programada con **pg_cron de Supabase** (cada 5 minutos) y se incluyen **las 4 redes**.

## Flujo

1. En `/publicar` el usuario elige un video de su Drive con **Google Picker** (permiso `drive.file`: Metrix solo ve los archivos que el usuario elige). El token del Picker vive solo en memoria del navegador.
2. Escribe el texto (uno general y, si quiere, uno por red), el título de YouTube, elige redes y la hora (Ciudad de México) o «Ahora».
3. La Server Action guarda `scheduled_posts` y un `scheduled_post_targets` por red (con service_role, después de revisar la sesión).
4. `pg_cron` (job `metrix-publish`) llama a `POST /api/cron/publish` cada 5 minutos con `Authorization: Bearer <CRON_SECRET>`; el secreto está en Vault (`metrix_cron_secret`).
5. La ruta reserva hasta 8 destinos vencidos (`claim_publish_targets`, con `for update skip locked` y un lease de 290 s), descarga el video de Drive con el token de la conexión de **YouTube** (una vez por publicación y corrida, y solo si hace falta) y avanza la máquina de estados de cada red un paso.
6. Cada destino termina en `published` (id y enlace) o `failed` (motivo claro). Los errores transitorios se reintentan 2 veces (10 y 20 min). Si una red tarda más de 3 h en procesar, se marca como fallida. Cada resultado crea una alerta en `/alertas`.

## Por red

| Red | Permisos | Cómo sube | Límite actual |
|---|---|---|---|
| Instagram | `instagram_content_publish` | Contenedor `REELS` con `upload_type=resumable` → bytes a `rupload.facebook.com` → espera `status_code=FINISHED` → `media_publish` | Público |
| Facebook | `pages_manage_posts` | `/{page}/video_reels` fases start → upload (rupload) → finish con `video_state=PUBLISHED` → espera `publishing_phase=complete` | Público |
| YouTube | `youtube.upload` | Sesión reanudable de `videos.insert` + un PUT con los bytes | **Privado** hasta la auditoría de Google |
| TikTok | `video.upload`, `video.publish` (con `TIKTOK_PUBLISH=true`) | `creator_info` → `video/init` (`FILE_UPLOAD`, partes de 10 MB si pasa de 64 MB) → PUT por partes → `status/fetch` | **Solo yo (SELF_ONLY)** hasta la auditoría de TikTok; además TikTok puede exigir que la cuenta sea privada |

Código: `src/lib/publishing/` (`runner.ts`, `meta-publishers.ts`, `youtube-publisher.ts`, `tiktok-publisher.ts`, `drive.ts`, `scheduling.ts`, `deps.ts`), ruta `src/app/api/cron/publish/route.ts`, UI `src/app/(dashboard)/publicar/`.

## Lo que falta configurar (usuario)

1. **Google Cloud (proyecto Metrix)**
   - Habilitar **Google Drive API** y **Google Picker API**.
   - Crear una **API key** restringida a la Google Picker API y a los sitios `https://metrix-swart-mu.vercel.app/*` y `http://localhost:3000/*`.
   - En «Acceso a los datos», agregar `.../auth/drive.file` y `.../auth/youtube.upload`.
   - En «Clientes» → el cliente web: agregar `https://metrix-swart-mu.vercel.app` y `http://localhost:3000` como **orígenes de JavaScript autorizados** (el Picker pide el token desde el navegador).
2. **Variables** en `.env.local` y en Vercel: `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER` (número del proyecto) y `TIKTOK_PUBLISH=true`.
3. **Secreto del cron en Vault**: `pnpm db:config` (copia `CRON_SECRET` de `.env.local` a Vault con `set_cron_secret`). Sin esto la ruta responde 401 y no se publica nada.
4. **Reconectar** YouTube, Meta y TikTok para aceptar los permisos nuevos.
5. Elegir videos en el Picker con **la misma cuenta de Google** que se conectó en YouTube (`drive.file` es por usuario y por proyecto).

## Pendiente a futuro

- Auditoría de Google (YouTube público) y de TikTok (privacidad pública): cambiar `YOUTUBE_PRIVACY` y `TIKTOK_PRIVACY`.
- Videos de más de ~1 GB: hoy se rechazan (memoria de la función).
