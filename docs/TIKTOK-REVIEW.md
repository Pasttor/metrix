# Revisión de la app de TikTok (Production)

En el portal de desarrolladores de TikTok, la app se llama **Mettrix** (con doble «t», porque «Metrix» ya estaba ocupado). En los textos para TikTok usa ese nombre; en la interfaz y en el dominio sigue siendo Metrix.

Esta revisión pide **lectura y publicación**:

| Producto | Scopes |
|---|---|
| Login Kit | `user.info.basic`, `user.info.profile`, `user.info.stats` |
| Display (lectura de videos) | `video.list` |
| Content Posting API, con **Direct Post** activado | `video.publish` |

`video.upload` (subir a borradores) **no** se usa. Si aparece en la app, quítalo: TikTok rechaza los scopes que no salen en el video.

Cuando TikTok apruebe la app, el código no cambia. La misma publicación que hoy solo pasa con «Solo yo» pasa con cualquier privacidad, y la cuenta puede volver a ser pública.

## Antes de enviar

1. **Producción** → *Products*: Login Kit, Content Posting API (con *Direct Post* activado) y los scopes de la tabla, sin ninguno de más.
2. Redirect URI de Login Kit: `https://metrix-swart-mu.vercel.app/api/connect/tiktok/callback`.
3. *Web/Desktop URL*, *Terms of Service URL* y *Privacy Policy URL*: `https://metrix-swart-mu.vercel.app/acerca`, `/terminos` y `/privacidad` (dominio ya verificado).
4. `TIKTOK_PUBLISH=true` en Vercel (ya está). Después del deploy, **reconecta TikTok** en *Configuración → Conexiones* para que el token tenga solo `video.publish`.

## Texto para «Explain how each product and scope works»

```
Mettrix (web app at https://metrix-swart-mu.vercel.app, shown as "Metrix" in its interface) is a personal, single-user dashboard. The account owner uses it to track their own TikTok account next to their YouTube, Instagram and Facebook accounts, and to publish their own videos to TikTok.

Login Kit: on Settings > Connections the owner clicks "Conectar" on the TikTok card, authorizes on TikTok and is redirected back. Tokens are stored encrypted (AES-256-GCM) and refreshed before each daily sync. "Desconectar y borrar datos" revokes the token through /v2/oauth/revoke/ and deletes every stored record of the account.

user.info.basic: shows the connected account (display name and avatar) on the connection card.
user.info.profile: shows the username and profile link.
user.info.stats: a daily snapshot of follower_count, following_count, likes_count and video_count for the follower and likes charts.
video.list: lists the owner's own videos (title, cover, create time, duration) with view, like, comment and share counts, saved daily to chart each video's growth.

video.publish (Content Posting API, Direct Post): on the "Publicar" page the owner picks one of their own videos from their Google Drive, writes the caption, selects TikTok and chooses when to post. Following the Content Sharing Guidelines, the form:
- calls creator_info/query when TikTok is selected and shows the creator's nickname and avatar;
- shows a privacy dropdown with exactly the privacy_level_options returned, with no default value;
- shows "Allow comments / Duet / Stitch" checkboxes, all unchecked by default, and disables the ones the creator turned off;
- checks max_video_post_duration_sec against the video duration;
- has the "Disclose video content" toggle (off by default) with "Your brand" and "Branded content", shows the "Promotional content" / "Paid partnership" label, blocks posting until one is selected, and does not allow branded content with "Only me";
- shows the consent line linking to TikTok's Music Usage Confirmation (plus the Branded Content Policy when branded content is selected);
- never posts anything the owner did not schedule. The video is uploaded with FILE_UPLOAD and the status is polled with status/fetch; the owner is notified when TikTok finishes processing.
```

## Guion del video demo (2–4 min, MP4, máx. 50 MB por archivo)

Graba la **ventana completa de Chrome** con la barra de direcciones visible (con **Win + Alt + R**, o con OBS). El dominio debe verse: `metrix-swart-mu.vercel.app`. Sin música; las pausas y los cortes son válidos.

1. **Entrar**: abre `https://metrix-swart-mu.vercel.app/login`, inicia sesión y muestra el Resumen.
2. **Conectar (Login Kit)**: ve a *Configuración → Conexiones* y da clic en **Reconectar** en la tarjeta de TikTok.
3. **Autorizar**: deja ver la pantalla de autorización de TikTok con todos los permisos (incluido publicar) y da clic en **Autorizar**.
4. **Regreso**: la tarjeta queda **Conectada**, con el nombre y la foto (`user.info.basic`) y el @usuario (`user.info.profile`).
5. **Estadísticas (`user.info.stats`)**: abre **TikTok** en el menú y muestra seguidores, likes y las gráficas por día.
6. **Videos (`video.list`)**: baja a la tabla de videos y abre uno para mostrar su detalle.
7. **Publicar (`video.publish`)**: abre **Publicar**.
   1. **Elegir de Google Drive**: elige un video corto.
   2. Escribe el texto y marca **TikTok**.
   3. Detente 2 segundos en «Publicarás en TikTok como…» con el nombre y la foto.
   4. Abre el selector **¿Quién puede ver este video?**. Muestra que empieza vacío y elige **Solo yo**. Mientras TikTok no audite la app, es la única opción que funciona con la cuenta pública.
   5. Marca **Comentar**. Deja ver que Dúo y Stitch empiezan desmarcados.
   6. Activa **Divulgar contenido comercial**. Muestra que el botón **Publicar** se bloquea hasta elegir una opción.
   7. Marca **Tu marca** y muestra la etiqueta «Contenido promocional».
   8. Muestra que **Contenido de marca** está desactivado con «Solo yo».
   9. Desactiva el contenido comercial.
   10. Señala el texto de consentimiento con el enlace a la Confirmación de uso de música.
   11. Elige **Ahora** y da clic en **Publicar**.
8. **Resultado**:
   1. Muestra la publicación en la lista. Recarga hasta que TikTok diga **Publicado**; el cron corre cada 5 minutos, así que puedes cortar la espera.
   2. Abre TikTok (app o web) y muestra el video en el perfil.
9. **Cierre**: vuelve a *Configuración → Conexiones* y muestra el botón **Desconectar y borrar datos** (sin confirmarlo).

Si el video pasa de 50 MB, recórtalo o súbelo en varias partes (se permiten hasta 5 archivos).
