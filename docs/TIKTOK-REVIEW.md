# Revisión de la app de TikTok (Production)

En el portal de desarrolladores de TikTok, la app se llama **Mettrix** (con doble «t», porque «Metrix» ya estaba ocupado). En los textos para TikTok usa ese nombre; en la interfaz y en el dominio sigue siendo Metrix.

Esta revisión pide **lectura y publicación**:

| Producto | Scopes |
|---|---|
| Login Kit | `user.info.basic`, `user.info.profile`, `user.info.stats` |
| Display (lectura de videos) | `video.list` |
| Content Posting API, con **Direct Post** activado | `video.publish` |

`video.upload` (subir a borradores) viene **incluido por defecto** con el Content Posting API y el portal no deja quitarlo (revisado el 10 de noviembre de 2026). Metrix no lo pide al conectar; el texto de revisión explica que solo se usa Direct Post.

Cuando TikTok apruebe la app, el código no cambia. Mientras TikTok no audite la app, solo deja publicar si **la cuenta de TikTok es privada** (`unaudited_client_can_only_post_to_private_accounts`); elegir «Solo yo» no basta. Cuando apruebe, la cuenta puede quedarse pública.

## Estado del portal (10 de noviembre de 2026)

- La app **nunca se ha aprobado**. La pestaña **Production** es un borrador vacío: sin productos, sin scopes, sin descripción y sin URLs.
- Metrix funciona hoy con las credenciales del **Sandbox** «mettrix». Ese Sandbox tiene Login Kit, Content Posting API con Direct Post, los 6 scopes y a `casiquiebra` como *Target user*.
- Como la app no se ha aprobado antes, TikTok exige que el video demo se grabe con el Sandbox. Así que se graba con Metrix tal como está ahora.

## Antes de enviar

En <https://developers.tiktok.com/apps/> → **Mettrix** → pestaña **Production**:

1. Da clic en **Import** para copiar la configuración del Sandbox (productos, scopes, redirect URI). Revisa que quede así:
   - *Products*: Login Kit (redirect URI `https://metrix-swart-mu.vercel.app/api/connect/tiktok/callback`) y Content Posting API con **Direct Post** activado.
   - *Scopes*: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, y `video.upload`, que viene incluido y no se puede quitar.
2. *Basic information*: ícono de 1024×1024, nombre, categoría *Productivity* y descripción.
3. *Terms of Service URL* `https://metrix-swart-mu.vercel.app/terminos`, *Privacy Policy URL* `https://metrix-swart-mu.vercel.app/privacidad`. En *Platforms* marca **Web**, con *Web/Desktop URL* `https://metrix-swart-mu.vercel.app/acerca` (dominio ya verificado).
4. *App review*: pega el texto de abajo y sube el video.
5. Da clic en **Submit for review**.

**Cuando TikTok apruebe:** copia el *Client key* y el *Client secret* de **Production** a `TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET` en Vercel y en `.env.local`. Vuelve a desplegar y **reconecta TikTok**. Hasta entonces sigue con las del Sandbox.

## Texto para «Explain how each product and scope works» (máx. 1000 caracteres)

El campo del portal acepta hasta 1000 caracteres; este texto tiene 976.

```
Mettrix (https://metrix-swart-mu.vercel.app, shown as "Metrix") is a single-user dashboard where the owner tracks and posts to their own TikTok account. The demo starts already signed in (magic-link login), going from the public About page to the dashboard.

Login Kit: Settings > Connections > Reconectar, authorize, back connected.
user.info.basic/profile: name, avatar and @username on the card.
user.info.stats: daily followers and likes charts.
video.list: own videos with views, likes, comments and shares.
video.publish (Direct Post only; video.upload comes bundled but is unused): on Publicar the owner picks a Drive video and caption. The form loads creator_info (nickname, avatar), offers its privacy options with no default, comment/duet/stitch unchecked (disabled if off), checks max duration, has the commercial content disclosure (Your brand / Branded content, labels, no branded with Only me) and the Music Usage consent. Posted with FILE_UPLOAD; status polled.
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
   4. Abre el selector **¿Quién puede ver este video?**. Muestra que empieza vacío y elige **Solo yo**. Antes de grabar, pon la cuenta de TikTok en **privado**: sin auditoría, TikTok rechaza publicar en cuentas públicas.
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
