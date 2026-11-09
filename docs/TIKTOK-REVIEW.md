# Revisión de la app de TikTok (Production)

Primera revisión: **solo lectura** (Login Kit + `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`). La publicación (Content Posting API, `video.upload`, `video.publish`) va en una segunda revisión, cuando exista en Metrix.

## Antes de enviar

1. En **Production** deben estar exactamente esos productos y scopes (ni uno más: TikTok rechaza los que no aparezcan en el video).
2. Redirect URI de Login Kit: `https://metrix-swart-mu.vercel.app/api/connect/tiktok/callback`.
3. Las URLs de términos, privacidad y sitio web en `metrix-swart-mu.vercel.app` (ya verificado).

## Texto para «Explain how each product and scope works»

```
Mettrix is a personal, single-user analytics dashboard (https://metrix-swart-mu.vercel.app) that the account owner uses to track his own TikTok account next to his YouTube, Instagram and Facebook accounts.

Login Kit: on the Settings > Connections page the owner clicks "Connect" on the TikTok card, authorizes with Login Kit and is redirected back. Tokens are stored encrypted and refreshed before each daily sync.

user.info.basic: shows the connected account (display name and avatar) on the connection card.
user.info.profile: shows the username and the profile link.
user.info.stats: a daily snapshot of follower_count, following_count, likes_count and video_count, used for the follower and likes charts.
video.list: lists the owner's own videos (title, cover, create time, duration) with view, like, comment and share counts, saved daily to chart each video's growth.

This submission is read-only: no content is posted.
```

## Guion del video demo (1–2 min, MP4, máx. 50 MB)

Graba la pantalla del navegador con la barra de direcciones visible (el dominio debe coincidir con la Web URL: `metrix-swart-mu.vercel.app`). Usa el **Sandbox** (la app aún no está aprobada) y una cuenta que esté en *Target users*.

1. **Entrar** — abre `https://metrix-swart-mu.vercel.app/login`, inicia sesión y muestra el Resumen.
2. **Conectar (Login Kit)** — ve a *Configuración → Conexiones*. En la tarjeta de TikTok da clic en **Conectar** (si ya está conectada, **Reconectar**).
3. **Pantalla de TikTok** — muestra la página de autorización de TikTok con los permisos que pide la app y da clic en **Autorizar**.
4. **Regreso** — la tarjeta queda en **Conectada** con el nombre y la foto de la cuenta (`user.info.basic`) y el @usuario (`user.info.profile`).
5. **Sincronizar** — da clic en **Sincronizar ahora** y espera el mensaje de filas guardadas.
6. **Estadísticas (`user.info.stats`)** — abre **TikTok** en el menú: seguidores, likes, gráficas por día.
7. **Videos (`video.list`)** — baja a la tabla de videos (portada, título, fecha, vistas, likes, comentarios, compartidos) y abre uno para mostrar su detalle.
8. **Cierre** — vuelve a *Configuración → Conexiones* para mostrar que se puede reconectar o revocar el acceso desde TikTok.

Consejos: sin música ni cortes bruscos; si el video pasa de 50 MB, recórtalo o súbelo en 2 partes (se permiten hasta 5 archivos).
