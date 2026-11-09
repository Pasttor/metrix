# Fase de publicación: programar y publicar

Decisiones (9 nov 2026): los videos salen del **Google Drive** del usuario, se publican a la hora programada con **pg_cron de Supabase** (cada 5 minutos) y se incluyen **las 4 redes**.

## Flujo

1. En `/publicar` el usuario elige un video de su Drive con **Google Picker** (permiso `drive.file`: Metrix solo ve los archivos que el usuario elige).
2. Escribe el texto (uno general y, si quiere, uno por red), elige redes y fecha/hora (Ciudad de México).
3. Metrix guarda la publicación programada (`scheduled_posts`) y un destino por red (`scheduled_post_targets`).
4. `pg_cron` llama a `POST /api/cron/publish` cada 5 minutos con el `CRON_SECRET`. La ruta toma los destinos vencidos, descarga el video de Drive y lo sube directo a cada red con su API de subida oficial. No se guarda copia del video.
5. Cada destino termina en `published` (con el id y el enlace de la red) o `failed` (con el motivo), y genera una alerta en `/alertas`.

## Por red

| Red | Permiso nuevo | Cómo sube | Límite actual |
|---|---|---|---|
| Instagram | `instagram_content_publish` | Reels con subida reanudable (rupload) | Público |
| Facebook | `pages_manage_posts` (+ `pages_read_engagement`) | Reels de Página (`/video_reels`, subida por fases) | Público |
| YouTube | `youtube.upload` | Subida reanudable de `videos.insert` | **Privado** hasta la auditoría de Google |
| TikTok | `video.publish` (+ `video.upload`) | Content Posting API, `FILE_UPLOAD` por partes | **Solo yo (SELF_ONLY)** hasta la auditoría de TikTok |

Cada red necesita **reconectarse** una vez para aceptar el permiso nuevo.

## Preparación en Google Cloud (proyecto Metrix)

1. Habilitar **Google Drive API** y **Google Picker API**.
2. Crear una **API key** (Credenciales → Crear credenciales → Clave de API), restringida a la Google Picker API y al sitio `https://metrix-swart-mu.vercel.app/*`.
3. En Acceso a los datos, agregar el permiso `.../auth/drive.file`.
4. Variables: `GOOGLE_PICKER_API_KEY` y `GOOGLE_CLOUD_PROJECT_NUMBER` (el «número del proyecto» que aparece en la página principal de la consola).

## Pasos de construcción

1. Migración: `scheduled_posts`, `scheduled_post_targets`; conexión de Google Drive (cuenta `drive`).
2. UI `/publicar`: Picker, formulario, lista de programadas con estado; cancelar y reintentar.
3. Ruta `/api/cron/publish` + job de `pg_cron` y `pg_net`.
4. Publicadores: Instagram → Facebook → YouTube → TikTok, cada uno con pruebas y fixtures.
5. Actualizar `/privacidad` y `/terminos` (Metrix ya no es solo lectura).
