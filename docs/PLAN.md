# Metrix — Plan de desarrollo para Codex

Este documento divide Metrix en tareas del tamaño de un PR. Cada tarea tiene objetivo, alcance, criterios de aceptación y notas técnicas. Las reglas generales del repo están en `AGENTS.md`.

**Cómo usarlo con Codex:** pide una tarea a la vez, por ejemplo: *"Lee AGENTS.md y docs/PLAN.md y realiza la tarea T05. No toques nada fuera de su alcance."* Revisa y fusiona el PR antes de pedir la siguiente.

Las tareas marcadas **[David]** son pasos manuales que Codex no puede hacer (crear apps de desarrollador, aprobar permisos). Están listadas en la sección 2 y cada tarea indica cuáles necesita.

---

## 1. Contexto y decisiones

- Un solo usuario. El acceso se restringe al correo de `ALLOWED_EMAIL`.
- Solo lectura de métricas por APIs oficiales.
- Cuentas actuales:
  - Instagram: **casiquiebra**, cuenta de empresa ya vinculada a una Página de Facebook.
  - Facebook: la Página vinculada a ese Instagram.
  - YouTube: canal propio.
  - TikTok: cuenta General (personal). Se usa Display API; las métricas avanzadas son opcionales (T18).
- Meta: una sola app en **modo Desarrollo**. El acceso estándar cubre las cuentas que David administra, sin App Review.
- Google: la app OAuth debe estar publicada **"En producción"** aunque esté sin verificar. En modo Prueba los refresh tokens caducan a los 7 días.
- Vercel Hobby: cada cron corre **máximo una vez al día**, en UTC, con precisión de ±59 minutos y **sin reintentos automáticos**. Las funciones tienen un límite de duración, así que los trabajos largos se parten en bloques.
- Instagram solo da ~90 días de historial de métricas de cuenta; las historias viven 24 h. El valor de Metrix es acumular historial desde el día en que se conecta cada cuenta.

---

## 2. Prerrequisitos manuales [David]

### P1 — Infraestructura (antes de T00)
- [ ] Repo en GitHub conectado a Codex.
- [ ] Proyecto en Supabase (región más cercana, por ejemplo `us-east-1`). Copiar URL, `anon key` y `service_role key`.
- [ ] Proyecto en Vercel conectado al repo.
- [ ] Opcional: dominio propio. Si no, usar `https://<proyecto>.vercel.app`.

### P2 — Google / YouTube (antes de T05)
1. Google Cloud Console → proyecto "Metrix".
2. Habilitar **YouTube Data API v3** y **YouTube Analytics API**.
3. Pantalla de consentimiento OAuth: tipo Externo; scopes `https://www.googleapis.com/auth/youtube.readonly` y `https://www.googleapis.com/auth/yt-analytics.readonly`. Agregar `yt-analytics-monetary.readonly` solo si el canal está monetizado.
4. **Publicar la app "En producción".**
5. Credenciales → ID de cliente OAuth (aplicación web) con redirect URIs:
   - `http://localhost:3000/api/connect/youtube/callback`
   - `https://<dominio>/api/connect/youtube/callback`

### P3 — Meta (antes de T08)
1. developers.facebook.com → crear app de tipo Business.
2. Agregar **Facebook Login for Business** e **Instagram** (API con inicio de sesión de Facebook).
3. Redirect URIs válidos: los mismos dos de arriba, cambiando `youtube` por `meta`.
4. Dejar la app en **modo Desarrollo**. Confirmar que David es administrador de la app.
5. Si la Página está dentro de un Business Manager, también hacen falta los permisos `business_management`, `ads_read` y `ads_management`.
6. Copiar App ID y App Secret.
7. En T11: configurar el webhook de Instagram con la URL `https://<dominio>/api/webhooks/meta`, el `META_WEBHOOK_VERIFY_TOKEN` y la suscripción a `story_insights`.

### P4 — TikTok (antes de T13; conviene iniciarlo en T00 porque la revisión tarda)
1. developers.tiktok.com → crear app.
2. Agregar **Login Kit** y **Display API** con los scopes `user.info.basic`, `user.info.profile`, `user.info.stats` y `video.list`.
3. Redirect URI: `https://<dominio>/api/connect/tiktok/callback` (TikTok puede exigir HTTPS; para local usar la URL de Vercel preview o un túnel).
4. URLs de Términos y Privacidad: `https://<dominio>/legal/terms` y `https://<dominio>/legal/privacy` (las crea T13).
5. Probar en sandbox con la cuenta propia y después enviar a revisión.

---

## 3. Variables de entorno

Todas se declaran en `.env.example` y se validan en `src/lib/env.ts`.

```bash
# App
APP_URL=http://localhost:3000
ALLOWED_EMAIL=tu-correo@ejemplo.com   # valor real solo en .env.local y en Vercel
TOKEN_ENCRYPTION_KEY=          # 32 bytes en base64: openssl rand -base64 32
CRON_SECRET=                   # Vercel lo envía como "Authorization: Bearer <CRON_SECRET>"
REPORT_TIMEZONE=America/Mexico_City

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # solo en el servidor

# Google / YouTube
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YOUTUBE_MONETARY=false         # true agrega el scope de ingresos

# Meta
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v26.0
META_LOGIN_CONFIG_ID=          # opcional: configuración de Facebook Login for Business
META_WEBHOOK_VERIFY_TOKEN=

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# Alertas (T16)
RESEND_API_KEY=
ALERT_EMAIL_TO=tu-correo@ejemplo.com
```

---

## 4. Modelo de datos

Referencia para T01. Todas las tablas tienen RLS activado.

| Tabla | Llave | Columnas |
| --- | --- | --- |
| `accounts` | `id uuid` | `platform` (`youtube`, `instagram`, `facebook`, `tiktok`), `external_id`, `name`, `handle`, `avatar_url`, `parent_account_id` (IG → su Página de FB), `status` (`active`, `reauth_required`, `disabled`), `connected_at`, `last_synced_at`; único (`platform`, `external_id`) |
| `oauth_tokens` | `account_id` | `access_token_enc`, `refresh_token_enc`, `expires_at`, `refresh_expires_at`, `scopes text[]`, `updated_at` |
| `account_metrics_daily` | (`account_id`, `date`, `metric`) | `value numeric`, `captured_at` |
| `posts` | `id uuid` | `account_id`, `external_id`, `type` (`video`, `short`, `reel`, `image`, `carousel`, `story`, `post`, `live`), `caption`, `permalink`, `thumbnail_url`, `published_at`, `duration_seconds`, `raw jsonb`; único (`account_id`, `external_id`) |
| `post_metric_snapshots` | (`post_id`, `captured_on`, `metric`) | `value numeric` — valor acumulado del post ese día |
| `audience_snapshots` | (`account_id`, `date`, `dimension`, `key`) | `value numeric`; `dimension`: `age`, `gender`, `age_gender`, `country`, `city`, `device`, `traffic_source` |
| `metric_catalog` | (`platform`, `metric`) | `unified_metric`, `label_es`, `description_es`, `unit` (`count`, `seconds`, `minutes`, `percent`, `currency`), `scope` (`account`, `post`, `audience`), `deprecated_at` |
| `sync_runs` | `id uuid` | `platform`, `account_id`, `job` (`daily`, `backfill`, `webhook`), `status` (`running`, `success`, `partial`, `error`), `cursor jsonb`, `stats jsonb`, `error`, `started_at`, `finished_at` |
| `webhook_events` | `id uuid` | `platform`, `payload jsonb`, `received_at`, `processed_at`, `error` |
| `oauth_states` | `state text` | `platform`, `code_verifier`, `created_at` (caduca en 10 min) |

Métricas unificadas (`metric_catalog.unified_metric`) para comparar entre redes: `followers`, `views`, `reach`, `interactions`, `likes`, `comments`, `shares`, `saves`, `watch_time_minutes`, `avg_view_duration_seconds`.

**Engagement rate** = (`likes` + `comments` + `shares` + `saves`) / `views`. Si no hay `views`, no se calcula.

---

## 5. Tareas

### Fase 0 — Base

#### T00 — Inicializar el repo
**Requiere:** P1.
- Crear la app con `create-next-app` (TypeScript, App Router, Tailwind, ESLint, `src/`), pnpm, shadcn/ui y Vitest.
- Scripts `lint`, `typecheck`, `test`, `db:reset`, `db:types` según `AGENTS.md`.
- `src/lib/env.ts` con Zod: falla al arrancar si falta una variable requerida. Las variables de cada plataforma son opcionales hasta su tarea.
- `.env.example` con todas las variables de la sección 3.
- Supabase CLI inicializado (`supabase/`), sin tablas todavía.
- GitHub Action que corre lint, typecheck y test en cada PR.

**Criterios de aceptación**
- `pnpm dev` muestra una página en blanco con el título "Metrix".
- `pnpm lint && pnpm typecheck && pnpm test` pasan (con al menos una prueba trivial).
- El workflow de CI pasa en el PR.

#### T01 — Esquema de base de datos
- Migración con las tablas de la sección 4, índices por (`account_id`, `date`) y por (`post_id`, `captured_on`), y RLS en todas las tablas.
- Política: solo un usuario autenticado cuyo `auth.email()` sea igual a `ALLOWED_EMAIL` puede leer. Como RLS no lee variables de entorno, guarda el correo permitido en una tabla `app_config` o en una función SQL creada desde la migración con un valor que se configura en el seed.
- Las escrituras las hace el servidor con `service_role`; no hay políticas de escritura para usuarios.
- `seed.sql` con el `metric_catalog` inicial de las cuatro plataformas (nombres de la sección de cada tarea de sincronización), con `label_es` y `unified_metric`.
- Generar `src/lib/db/types.ts`.

**Criterios de aceptación**
- `pnpm db:reset` crea todo sin errores y carga el catálogo. *(Ajuste: el proyecto no usa Docker; las migraciones y el seed se aplican al proyecto en la nube con `pnpm db:push`, y las pruebas corren el esquema en PGlite. Ver `AGENTS.md`.)*
- Una prueba confirma que un usuario con otro correo no puede leer `accounts` (prueba de integración contra Supabase local, o prueba de la función SQL de autorización).

#### T02 — Login de un solo usuario y layout
- Supabase Auth con magic link. `/login` con un campo de correo.
- Middleware: si no hay sesión, redirige a `/login`. Si el correo no es `ALLOWED_EMAIL`, cierra la sesión y muestra "Acceso no autorizado".
- Layout del dashboard: barra lateral con Resumen, YouTube, Instagram, Facebook, TikTok y Configuración; selector de periodo (7, 28, 90 y 365 días) guardado en la URL (`?range=28`).
- Modo claro y oscuro.

**Criterios de aceptación**
- Sin sesión, cualquier ruta del dashboard redirige a `/login`.
- Otro correo no puede entrar aunque complete el magic link.
- El selector de periodo cambia `?range=` y se conserva al navegar.

#### T03 — Cifrado, tokens y marco de conexiones
- `src/lib/crypto.ts`: AES-256-GCM con `TOKEN_ENCRYPTION_KEY`; formato `iv:authTag:ciphertext` en base64. Pruebas de ida y vuelta y de manipulación (un texto alterado debe fallar).
- `src/lib/oauth/`: genera `state` aleatorio y `code_verifier` PKCE (S256) guardados en `oauth_states`; valida y borra el state en el callback; rechaza states de más de 10 minutos.
- `tokenStore`: `saveTokens(accountId, tokens)`, `getValidAccessToken(accountId)` (renueva si faltan menos de 5 minutos para caducar, usando un `refresh` inyectable por plataforma) y `markReauthRequired(accountId)`.
- Interfaz `PlatformConnector` con `buildAuthUrl`, `handleCallback` y `refresh`. Rutas genéricas `/api/connect/[platform]` y `/api/connect/[platform]/callback` que delegan al conector.
- Página `/settings/connections`: tarjeta por plataforma con estado (Sin conectar, Conectada, Reconectar), último sync y botones Conectar o Reconectar.

**Criterios de aceptación**
- Pruebas de `crypto`, del flujo de state (válido, caducado, reutilizado) y de `getValidAccessToken` con un refresh simulado.
- Ningún token aparece en logs ni en respuestas: hay una prueba que revisa que el JSON de las rutas no contiene campos de token.

#### T04 — Runner de sincronización y crons
- `src/lib/sync/runner.ts`: `runSync({ platform, job, accountId? })` crea un registro en `sync_runs`, ejecuta el sincronizador de la plataforma por cuenta, captura errores por cuenta (una cuenta que falla no detiene las demás), guarda `stats` (filas escritas, advertencias) y cierra con `success`, `partial` o `error`.
- Límite de tiempo: el runner recibe un `deadline` (por ejemplo 240 s) y, si se acerca, guarda un `cursor` en `sync_runs` y termina con `partial`; la siguiente ejecución continúa desde ahí.
- Rutas `GET /api/cron/sync-youtube`, `sync-meta` y `sync-tiktok`: verifican `Authorization: Bearer ${CRON_SECRET}` y responden 401 si no coincide.
- `vercel.json` con un cron por plataforma a horas distintas, en UTC: `0 9 * * *` (YouTube), `0 10 * * *` (Meta), `0 11 * * *` (TikTok). Es decir, 3:00, 4:00 y 5:00 en Ciudad de México.
- `POST /api/sync/backfill` (requiere sesión): procesa un bloque y devuelve `{ done, cursor }`; la UI lo llama en bucle hasta `done`, con barra de progreso.
- Botón "Sincronizar ahora" por cuenta en `/settings/connections`.

**Criterios de aceptación**
- Pruebas del runner con un sincronizador falso: éxito, error en una cuenta (`partial`), corte por deadline y reanudación con cursor.
- Las rutas de cron rechazan peticiones sin el secreto.

### Fase 1 — YouTube

#### T05 — Conectar YouTube
**Requiere:** P2.
- Conector de Google: `access_type=offline`, `prompt=consent` (para recibir refresh token), scopes según `YOUTUBE_MONETARY`.
- En el callback: `channels.list?mine=true&part=snippet,statistics,contentDetails` → crea o actualiza `accounts` (id del canal, título, handle, avatar) y guarda tokens.
- Si la cuenta de Google tiene varios canales o una cuenta de marca, usar el canal que Google devuelva para el consentimiento elegido y mostrar su nombre en la tarjeta.

**Criterios de aceptación**
- Conectar desde `/settings/connections` deja la tarjeta en "Conectada" con el nombre del canal.
- Si Google no devuelve refresh token, se muestra un error claro con la instrucción de revocar el acceso en la cuenta de Google y reconectar.

#### T06 — Sincronizar YouTube
Fuentes: YouTube Data API v3 y YouTube Analytics API (`reports.query` con `ids=channel==MINE`).

**Diario (cron):**
- Canal, por día: `views`, `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`, `subscribersGained`, `subscribersLost`, `likes`, `comments`, `shares` con `dimensions=day`. **Volver a pedir los últimos 7 días en cada corrida**, porque los datos de Analytics llegan con retraso y se ajustan; el upsert los corrige.
- Snapshot de `subscriberCount`, `viewCount` y `videoCount` de `channels.list` como métricas del día.
- Videos: listar la playlist de subidas (`contentDetails.relatedPlaylists.uploads`) con `playlistItems.list`; para los nuevos, `videos.list` (lotes de 50) con `snippet,statistics,contentDetails` → `posts`. Marcar como `short` los videos de 3 minutos o menos y como `video` el resto, y dejar una nota en el PR de que es una heurística.
- `post_metric_snapshots` diarios con `viewCount`, `likeCount` y `commentCount` de todos los videos (es barato: 1 unidad de cuota por lote de 50).

**Semanal (los lunes, dentro del cron diario):**
- Audiencia del canal, últimos 28 días: `ageGroup,gender` → `viewerPercentage`; `country` → `views`; `deviceType` → `views`; `insightTrafficSourceType` → `views` → `audience_snapshots`.
- Por video publicado en los últimos 90 días: `estimatedMinutesWatched`, `averageViewDuration` y `averageViewPercentage` acumulados.

**Backfill al conectar:** métricas diarias del canal desde la fecha de creación del canal, en bloques de 1 año, y todos los videos.

**Bajo demanda:** curva de retención de un video (`dimensions=elapsedVideoTimeRatio`, `metrics=audienceWatchRatio`, `filters=video==ID`), pedida al abrir el detalle del video y guardada en caché en `posts.raw`.

**Notas**
- Ingresos (`estimatedRevenue`) solo si `YOUTUBE_MONETARY=true`.
- Impresiones y CTR de miniaturas: no implementarlo. Si la documentación actual de la Analytics API las expone para canales, menciónalo en el PR como mejora posible.
- Fixtures en `tests/fixtures/youtube/` y pruebas de los parsers.

**Criterios de aceptación**
- Después del backfill, `account_metrics_daily` tiene una fila por día y métrica desde la creación del canal.
- Correr el sync diario dos veces seguidas no duplica filas.
- El uso de cuota estimado por corrida queda en `sync_runs.stats` y está muy por debajo de 10,000 unidades.

#### T07 — Dashboard de YouTube
- Tarjetas de KPI del periodo con variación contra el periodo anterior: suscriptores netos, vistas, horas vistas, duración media y engagement rate.
- Gráficas de línea: suscriptores totales y vistas diarias.
- Tabla de videos ordenable (vistas, likes, comentarios, engagement, fecha) con filtro Video / Short.
- Detalle de video: crecimiento de vistas por día (desde `post_metric_snapshots`) y curva de retención.
- Audiencia: barras de edad y género, top 10 países, dispositivos y fuentes de tráfico.
- Estado vacío claro mientras no haya datos.

**Criterios de aceptación**
- Todas las cifras salen de la base, nunca de la API en vivo.
- El selector de periodo cambia KPIs y gráficas.

### Fase 2 — Facebook + Instagram

#### T08 — Conectar Meta (Página + Instagram)
**Requiere:** P3.
- Diálogo `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth` con `config_id=META_LOGIN_CONFIG_ID` si existe; si no, con `scope=pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights` (más `business_management` si hace falta).
- Callback: código → token de usuario → token de larga duración (`grant_type=fb_exchange_token`) → `GET /me/accounts?fields=id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}`.
- Por cada Página: crear `accounts` de tipo `facebook` con el **token de Página**, que no caduca si sale de un token de usuario de larga duración. Por cada `instagram_business_account`: crear `accounts` de tipo `instagram` con `parent_account_id` apuntando a la Página.
- Llamadas de Instagram por `graph.facebook.com` con el token de la Página. Si una llamada de Instagram lo rechaza, usar el token de usuario de larga duración (60 días) y registrar su `expires_at` para avisar 10 días antes.
- Si hay varias Páginas, permitir elegir cuáles conectar.

**Criterios de aceptación**
- Conectar deja dos tarjetas: la Página de Facebook y **casiquiebra** en Instagram.
- Los tokens quedan cifrados y el estado de ambas cuentas es "Conectada".

#### T09 — Sincronizar Instagram
Fuente: `GET /{ig-user-id}/insights` y `GET /{ig-media-id}/insights` en `graph.facebook.com/${META_GRAPH_VERSION}`.

**Cuenta, diario:**
- Snapshot de `followers_count` y `media_count` (`GET /{ig-user-id}?fields=followers_count,media_count`).
- Métricas del día anterior, pidiendo un día por llamada (`period=day`, `since`/`until` de ese día) y `metric_type=total_value` donde la API lo exija: `views`, `reach`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`, `saves`, `replies`, `profile_links_taps`, `follows_and_unfollows`, `reposts`.
- **Antes de escribir el código, confirma cada nombre de métrica, `period`, `metric_type` y `breakdown` válidos en la referencia oficial de IG User Insights.** Si alguno no existe, quítalo del catálogo y anótalo en el PR.

**Cuenta, semanal:** `follower_demographics` con `breakdown` `age`, `gender`, `country` y `city` → `audience_snapshots` (requiere 100 o más seguidores; si viene vacío, no escribir nada).

**Publicaciones, diario:**
- `GET /{ig-user-id}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp` con paginación → `posts` (`REELS` → `reel`, `CAROUSEL_ALBUM` → `carousel`, `IMAGE` → `image`, `VIDEO` del feed → `video`).
- Insights de cada post publicado en los últimos 30 días (y semanalmente de todos los demás):
  - Feed: `views`, `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`, `reposts`.
  - Reels: lo anterior más `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` y `reels_skip_rate`.
  - Si está disponible: `total_likes`, `total_comments` y `total_views` (incluyen promociones; solo con Facebook Login).
- Las piezas dentro de un carrusel no tienen insights: pide solo el del carrusel.

**Historias, diario:** `GET /{ig-user-id}/stories` → `posts` tipo `story` e insights `views`, `reach`, `replies`, `navigation`, `shares` y `link_clicks`. Los valores finales llegan por el webhook (T11).

**Backfill al conectar:** métricas de cuenta de los últimos 90 días (el máximo que guarda Instagram), todas las publicaciones y sus insights actuales.

**Criterios de aceptación**
- Una métrica inválida genera una advertencia en `sync_runs.stats.warnings` y el resto se guarda.
- Las respuestas vacías no se guardan como 0.
- Respeta los encabezados `X-App-Usage` y `X-Business-Use-Case-Usage`: si el uso pasa de 80 %, pausa y deja el resto para la siguiente corrida.

#### T10 — Sincronizar Facebook (Página)
Fuente: `GET /{page-id}/insights` y `GET /{post-id}/insights`.
- Snapshot diario de `followers_count` de la Página.
- Métricas diarias de Página: `page_follows`, `page_total_media_view_unique`, `page_post_engagements` y `page_video_views`. Desde Graph API v25 ya no existen las métricas de alcance (`page_impressions_unique` y similares) ni las de vistas únicas de video; **no las uses**. Confirma cada nombre en la referencia de Page Insights antes de implementarla.
- Posts: `GET /{page-id}/published_posts?fields=id,message,created_time,permalink_url,full_picture,shares,comments.summary(true),reactions.summary(true)` → `posts`.
- Insights de posts de los últimos 30 días: `post_total_media_view_unique`, `post_reactions_by_type_total`, `post_clicks` y métricas de video o Reels si aplica.
- Backfill: lo que permita la API, en bloques de 90 días hasta que deje de devolver datos.

**Criterios de aceptación**
- Mismos criterios de robustez que T09.
- `metric_catalog` marca con `deprecated_at` cualquier métrica que la API rechace como retirada.

#### T11 — Webhook de Meta (historias)
**Requiere:** P3 paso 7.
- `GET /api/webhooks/meta`: verificación con `hub.mode`, `hub.verify_token` y `hub.challenge`.
- `POST /api/webhooks/meta`: valida la firma `X-Hub-Signature-256` (HMAC SHA-256 del cuerpo sin modificar con `META_APP_SECRET`) y responde 200 rápido. Guarda el evento en `webhook_events` y procésalo: para `story_insights`, actualiza las métricas finales de la historia en `post_metric_snapshots`.
- Firma inválida → 401 y nada se guarda.

**Criterios de aceptación**
- Pruebas con un payload de ejemplo firmado correctamente, uno con firma inválida y uno duplicado (el proceso es idempotente).

#### T12 — Dashboards de Instagram y Facebook
- Instagram: KPIs (seguidores netos, vistas, alcance, interacciones, engagement rate), seguidores por día, tabla de publicaciones con filtro por tipo (Reel, carrusel, imagen, historia), detalle con crecimiento por día, demografía de seguidores y un aviso de que el historial empieza en la fecha de conexión menos 90 días.
- Facebook: KPIs (seguidores, espectadores únicos, interacciones, reproducciones de video), gráficas diarias y tabla de posts.
- Reutiliza los componentes de T07.

**Criterios de aceptación**
- Mismos criterios que T07.

### Fase 3 — TikTok

#### T13 — Conectar y sincronizar TikTok
**Requiere:** P4.
- Páginas públicas `/legal/privacy` y `/legal/terms` (texto simple: uso personal, solo lectura y cómo revocar el acceso), sin login.
- OAuth: `https://www.tiktok.com/v2/auth/authorize/` con `client_key`, `scope=user.info.basic,user.info.profile,user.info.stats,video.list`, `response_type=code`, `redirect_uri`, `state` y PKCE. Token en `POST https://open.tiktokapis.com/v2/oauth/token/`.
- El access token dura unas 24 horas: `refresh` con `grant_type=refresh_token` antes de cada sync y guarda el nuevo refresh token si cambia.
- **Revisa los scopes concedidos** en la respuesta del token: el usuario puede aprobar solo algunos. Pide solo los campos permitidos y muestra en la tarjeta qué falta.
- Diario:
  - `GET /v2/user/info/?fields=open_id,display_name,avatar_url,username,follower_count,following_count,likes_count,video_count` → snapshot en `account_metrics_daily`.
  - `POST /v2/video/list/?fields=id,title,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count` con `max_count=20` y paginación por `cursor` → `posts` y `post_metric_snapshots`.
- TikTok no da series diarias: el historial empieza el día en que se conecta.

**Criterios de aceptación**
- Conectar deja la tarjeta en "Conectada" y muestra los scopes faltantes, si los hay.
- Pruebas de parsers con fixtures y del refresh de token.

#### T14 — Dashboard de TikTok
- KPIs: seguidores netos, likes totales ganados en el periodo y vistas nuevas del periodo (diferencia entre snapshots).
- Gráfica de seguidores por día y tabla de videos con crecimiento diario de vistas.
- Aviso: "TikTok no entrega tiempo de visualización ni audiencia para cuentas personales".

### Fase 4 — Vista unificada y extras

#### T15 — Resumen unificado
- Página `/`: una fila de KPIs por red con seguidores, vistas y engagement del periodo, más su variación.
- Gráfica de seguidores de las cuatro redes (eje por red o índice base 100, con selector).
- Top 10 publicaciones de todas las redes por vistas y por engagement rate, con icono de plataforma.
- Mapa de calor de mejores horas para publicar: engagement medio por día de la semana y hora de `published_at` (en `America/Mexico_City`), con filtro por red. Requiere al menos 10 publicaciones; si no, muestra un estado vacío.
- Todo sale de `metric_catalog.unified_metric`.

**Criterios de aceptación**
- Una red sin conectar no rompe la página: muestra un botón para conectarla.
- Pruebas de los cálculos de variación y engagement.

#### T16 — Salud y alertas
- Página `/settings/health`: últimas 30 corridas de `sync_runs` por plataforma con estado, duración, filas escritas y advertencias.
- Correo (Resend) cuando una cuenta pasa a `reauth_required`, cuando una corrida termina en `error` o cuando un token de Meta caduca en menos de 10 días. Como máximo un correo por cuenta al día.

#### T17 — Exportación y pulido
- Exportar a CSV las métricas diarias y las publicaciones de cualquier red y periodo.
- Revisión de accesibilidad básica (contraste, foco y etiquetas de gráficas).
- README con instrucciones de instalación, despliegue y prerrequisitos.

#### T18 — Opcional: métricas avanzadas de TikTok
Solo si David vincula su cuenta a TikTok for Business (Acceso avanzado) y obtiene acceso a los endpoints orgánicos de TikTok API for Business. Agregar tiempo de visualización, porcentaje visto completo, fuentes de impresión, países de espectadores y audiencia por género, país y hora. Abrir antes una tarea de investigación para confirmar los endpoints vigentes.

---

## 6. Orden y dependencias

```
P1 → T00 → T01 → T02 → T03 → T04
                              ├─ P2 → T05 → T06 → T07
                              ├─ P3 → T08 → T09 → T10 → T11 → T12
                              └─ P4 → T13 → T14
T07 + T12 + T14 → T15 → T16 → T17 → (T18)
```

Las ramas de YouTube, Meta y TikTok son independientes después de T04; se pueden hacer en cualquier orden.

---

## 7. Referencias oficiales

- Instagram Insights: https://developers.facebook.com/documentation/instagram-platform/insights
- Instagram Media Insights: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights
- Changelog de Instagram Platform: https://developers.facebook.com/docs/instagram-platform/changelog
- Page Insights: https://developers.facebook.com/docs/graph-api/reference/page/insights/
- Métricas de Page Insights retiradas: https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics
- YouTube Analytics API, dimensiones: https://developers.google.com/youtube/analytics/dimensions
- TikTok Display API: https://developers.tiktok.com/doc/display-api-overview/
- TikTok scopes: https://developers.tiktok.com/docs/en/tiktok-api-scopes
- Vercel Cron, límites: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Cron, administración y CRON_SECRET: https://vercel.com/docs/cron-jobs/manage-cron-jobs
