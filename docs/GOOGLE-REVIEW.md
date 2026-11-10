# Revisión de Google (OAuth y API de YouTube)

Para publicar en YouTube con la visibilidad que elijas, el proyecto de Google Cloud de Metrix tiene que pasar **dos trámites distintos**:

| Trámite | Qué quita | Dónde |
|---|---|---|
| **Verificación de OAuth** de los permisos sensibles | La pantalla «Google no verificó esta app» y el límite de 100 usuarios | Google Cloud → *Google Auth Platform* → *Centro de verificación* |
| **Auditoría de la API de YouTube** | El bloqueo que deja **privado** todo video subido por la API | Formulario *YouTube API Services – Audit and Quota Extension* |

La que importa para que los videos no queden privados es la **auditoría**. Conviene pasar primero la verificación de OAuth, porque el formulario de auditoría la toma en cuenta.

Metrix ya hace lo que piden: elige la visibilidad y la declaración «hecho para niños» en cada publicación, enlaza los Términos de YouTube y la Política de privacidad de Google, y tiene **Desconectar y borrar datos**. Mientras el proyecto no esté auditado, YouTube sigue forzando «privado» y Metrix lo avisa en la publicación. Cuando lo auditen, el código no cambia.

## 1. Verificar el dominio (Search Console)

1. Abre [Google Search Console](https://search.google.com/search-console) con la cuenta dueña del proyecto de Google Cloud.
2. Elige **Agregar propiedad → Prefijo de la URL** y escribe `https://metrix-swart-mu.vercel.app`.
3. En los métodos de verificación, elige **Etiqueta HTML** y copia solo el valor de `content="…"`.
4. En Vercel (*metrix → Settings → Environment Variables*), agrega `GOOGLE_SITE_VERIFICATION` con ese valor y vuelve a desplegar.
5. Regresa a Search Console y da clic en **Verificar**.

`vercel.app` está en la lista de sufijos públicos, así que `metrix-swart-mu.vercel.app` cuenta como dominio propio.

## 2. Google Auth Platform

En [Google Cloud Console](https://console.cloud.google.com/), con el proyecto de Metrix seleccionado, entra a **Google Auth Platform**.

**Branding**
- Nombre de la app: `Metrix`. Correo de asistencia: el tuyo.
- Logotipo: opcional. Si lo subes, también pasa por revisión.
- Página principal: `https://metrix-swart-mu.vercel.app/acerca`
- Política de privacidad: `https://metrix-swart-mu.vercel.app/privacidad`
- Condiciones del servicio: `https://metrix-swart-mu.vercel.app/terminos`
- Dominios autorizados: `metrix-swart-mu.vercel.app`

**Acceso a los datos.** Deben estar exactamente estos permisos:
- `.../auth/youtube.readonly`
- `.../auth/yt-analytics.readonly`
- `.../auth/youtube.upload`
- `.../auth/drive.file`
- `openid`, `.../auth/userinfo.email`

Si no usas los ingresos de YouTube (`yt-analytics-monetary.readonly`), no lo agregues.

**Justificación de cada permiso** (el formulario la pide en inglés):

```
Metrix is a personal, single-user dashboard (https://metrix-swart-mu.vercel.app). The owner connects their own YouTube channel to see its analytics and to publish their own videos.

youtube.readonly: reads the owner's channel (title, thumbnail, subscriber and video counts) and the list of their own videos with their statistics, shown on the YouTube page and saved daily to chart growth.

yt-analytics.readonly: reads YouTube Analytics reports for the owner's channel and videos (views, watch time, audience retention, traffic sources, search terms, demographics), shown as charts so the owner can improve their videos' hooks and scripts.

youtube.upload: on the "Publicar" page the owner picks one of their own videos from their Google Drive, writes the title and description, chooses the visibility (public, unlisted or private) and the made-for-kids declaration, and schedules it. Metrix uploads that video with videos.insert at the scheduled time. Nothing is uploaded that the owner did not schedule, and existing videos are never edited or deleted.

drive.file: requested on a separate connection. The owner picks a video with the Google Picker; Metrix can only open the files picked there and downloads that file at publishing time to upload it. It never lists or reads the rest of the Drive and does not keep a copy.

Data is stored encrypted in the app's database, used only to show the owner their own data and to make the posts they schedule, never sold or shared, and deleted with "Desconectar y borrar datos". Use of data follows the Google API Services User Data Policy, including the Limited Use requirements.
```

## 3. Video demo de OAuth (YouTube, «No listado»)

Graba la ventana completa de Chrome con la barra de direcciones visible. Google pide que la pantalla de consentimiento salga **en inglés**. Al llegar a `accounts.google.com`, agrega `&hl=en` al final de la URL y presiona Enter.

1. **Entrar**: abre `https://metrix-swart-mu.vercel.app/acerca`, luego **/login**, inicia sesión y muestra el Resumen.
2. **Conectar YouTube**:
   1. En *Configuración → Conexiones*, da clic en **Reconectar** en YouTube.
   2. Agrega `&hl=en` a la URL.
   3. **Detente** para que se lea el `client_id=` en la barra de direcciones y el nombre «Metrix» en la pantalla.
   4. Muestra la lista de permisos y da clic en **Continue/Allow**.
3. **Uso de `youtube.readonly` y `yt-analytics.readonly`**:
   1. Abre **YouTube** en el menú: canal, suscriptores, gráficas por día.
   2. Abre un video y muestra la curva de retención, las fuentes de tráfico y los términos de búsqueda.
4. **Conectar Google Drive (`drive.file`)**:
   1. En *Conexiones*, da clic en **Reconectar** en Google Drive.
   2. Agrega `&hl=en`, deja ver el `client_id` y el permiso, y autoriza.
5. **Uso de `drive.file` y `youtube.upload`**:
   1. En **Publicar**, da clic en **Elegir de Google Drive** y muestra que el selector de Google solo abre lo que eliges.
   2. Elige un video, escribe el texto, marca **YouTube** y escribe el título.
   3. En **Visibilidad** elige **No listado**. En «¿Está hecho para niños?» elige **No**.
   4. Señala el aviso de los Términos del servicio de YouTube.
   5. Da clic en **Publicar**.
   6. Espera a que diga **Publicado**, abre **Ver publicación** y muestra el video en YouTube Studio.
6. **Cierre**: en *Conexiones*, muestra **Desconectar y borrar datos** (sin confirmarlo), y abre `/privacidad` y `/terminos`.

Sube el video a YouTube como **No listado** y pega el enlace en el formulario de verificación. Luego, en *Centro de verificación*, da clic en **Enviar para verificación**.

## 4. Auditoría de la API de YouTube

Formulario: <https://support.google.com/youtube/contact/yt_api_form> (*YouTube API Services – Audit and Quota Extension Form*). Llénalo con la misma cuenta del proyecto.

- **Project number**: el de `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER`.
- **API client URL**: `https://metrix-swart-mu.vercel.app/acerca`
- **¿Quién la usa?** Solo el dueño (uso interno, un usuario).
- **Cómo usa la API**: reutiliza el texto de la sección 2 para `youtube.readonly`, `yt-analytics.readonly` y `youtube.upload`.
- **Demo**: el mismo video no listado de la sección 3.
- **Cumplimiento**:
  - Términos de YouTube en `/terminos` y en el formulario de publicación.
  - Política de privacidad de Google en `/privacidad`.
  - Revocación en la página de permisos de Google y con «Desconectar y borrar datos».
  - Visibilidad y «hecho para niños» los elige el usuario en cada video.

Si el equipo de YouTube pide **acceso para probar la app**, hoy solo entra el correo de `ALLOWED_EMAIL`. Antes de compartir cualquier acceso habría que agregar una cuenta de revisión.

La auditoría suele tardar varias semanas.
