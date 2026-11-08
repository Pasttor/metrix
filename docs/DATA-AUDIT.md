# Auditoría de datos disponibles (8 nov 2026)

Qué más entregan las APIs ya conectadas (YouTube, Instagram, Facebook) además de lo que Metrix guarda hoy. Todo se probó contra las cuentas reales (canal Empresas al Filo, @casiquiebra y la Página Casiquiebra) con Graph API v26 y YouTube Analytics v2, solo con lecturas y sin guardar nada.

Valor: **A** = alto para reportes, **B** = útil, **C** = menor. Esfuerzo: **S** = chico (agregar métricas a una llamada que ya existe), **M** = mediano (llamada o tabla nueva), **L** = grande (nueva función).

## YouTube

| Dato | Estado | Valor | Esfuerzo | Para qué sirve |
|---|---|---|---|---|
| **Términos de búsqueda por video** (`insightTrafficSourceDetail` con `YT_SEARCH`) | Disponible (ej. "hombre camino 28 años": 2 vistas) | A | M | SEO: qué busca la gente para encontrarte; ideas de títulos |
| **Serie diaria por video** (`dimensions=day` + `filters=video==ID`) | Disponible, con historial completo | A | M | Vistas, minutos y suscriptores por día de cada video desde su publicación (mejor que restar fotos diarias, y se puede rellenar hacia atrás) |
| **Fuentes de tráfico, países y edad/género por video** | Disponibles | A | M | De dónde viene cada video y quién lo ve |
| **`engagedViews`** (vistas comprometidas) | Disponible (ej. 345 el 1 nov) | A | S | En Shorts, YouTube cuenta "vistas" desde el primer cuadro; las vistas comprometidas son la cifra comparable con la antigua |
| **Vistas por tipo de contenido** (`creatorContentType`: Shorts / videos / directos) | Disponible | A | S | Separar el rendimiento de Shorts y videos largos |
| Agregados a playlists, quitados de playlists | Disponible | B | S | Señal de valor del contenido |
| Compartidos por servicio (`sharingService`: WhatsApp…) | Disponible | B | S | Dónde se comparte |
| Sistema operativo, ciudades | Disponibles (ej. Mexico City 254, Lima 89) | B | S | Audiencia más fina que país |
| No me gusta | Disponible (0) | C | S | |
| Tarjetas / pantallas finales | Disponible (0, no las usas) | C | S | |
| Impresiones de miniatura y CTR | **No disponible**: la API responde "query is not supported" para canal y para video | — | — | Solo en YouTube Studio |
| Suscritos vs no suscritos (`subscribedStatus`) | **Falla** con error 500 de Google en este canal | — | — | Reintentar más adelante |
| Texto de comentarios | **Requiere otro permiso** (`youtube.force-ssl`, que incluye escritura) o una API key | B | M | Una API key de solo lectura evita pedir permisos de escritura |
| Etiquetas, categoría, temas del video | Disponible (tus videos no tienen etiquetas) | C | S | |

## Instagram

| Dato | Estado | Valor | Esfuerzo | Para qué sirve |
|---|---|---|---|---|
| **Alcance, vistas e interacciones por tipo** (`breakdown=media_product_type`: Reels / publicaciones / historias) | Disponible (hoy todo es REEL) | A | S | Qué formato rinde más, día por día |
| **Alcance de seguidores vs no seguidores** (`breakdown=follow_type`) | Disponible (hoy 100 % no seguidores) | A | S | Cuánto descubrimiento genera la cuenta |
| **Benchmark de competidores** (`business_discovery`) | Disponible: seguidores, número de publicaciones y me gusta/comentarios públicos de cualquier cuenta de empresa o creador | A | M | Comparar tu crecimiento contra cuentas de tu nicho |
| `like_count` / `comments_count` en la lista de medios | Disponible | B | S | Contadores sin llamadas extra |
| Texto de comentarios | Disponible (hoy sin comentarios) | B | M | Comentarios destacados y temas recurrentes |
| Búsqueda de hashtags (publicaciones top / recientes) | Disponible | B | M | Investigación de temas |
| Horas en que tus seguidores están en línea (`online_followers`) | Disponible desde 100 seguidores (hoy vacío) | A | S | Mejores horas para publicar |
| Demografía de audiencia que interactúa (`engaged_audience_demographics`) | Disponible desde 100 interacciones; `last_30_days` ya no se acepta, se usa `this_month` / `this_week` | B | S | Quién interactúa, no solo quién sigue |
| Toques en botones de contacto (`contact_button_type`) | Disponible (0) | C | S | |
| Vistas en Facebook de Reels compartidos (`facebook_views`, `crossposted_views`) | **Falla** ("Fatal" 2207086) en tus Reels | — | — | |
| Visitas al perfil y follows por Reel | **No existe para Reels** (solo publicaciones de feed e historias) | — | — | |

## Facebook

| Dato | Estado | Valor | Esfuerzo | Para qué sirve |
|---|---|---|---|---|
| **Curva de retención por video** (`post_video_retention_graph`) | **Ya agregado** | A | — | Dónde se cae el hook |
| Curva de retención de reproducción automática (`..._autoplayed`) | Disponible | B | S | Comparar autoplay vs clic |
| **Tiempo de visualización y vistas completas de la Página** (`page_video_view_time`, `page_video_complete_views_30s`) | Disponible (282,276 ms y 2 el último día) | A | S | Tiempo visto total por día |
| Vistas de seguidores vs no seguidores, orgánicas vs anuncios (`breakdown=is_from_followers` / `is_from_ads`) | Disponible | B | S | Descubrimiento y peso de anuncios |
| Follows y unfollows diarios, visitas a la Página | Disponibles (0) | B | S | |
| Vistas de video por distribución (Página propia vs compartidos) | Disponible | B | S | Cuánto vienen de shares |
| Texto de comentarios | Disponible (hoy sin comentarios) | B | M | |
| Demografía de seguidores por país (`page_follows_country`) | Responde vacío (probablemente por pocos seguidores) | B | S | |
| `page_fans_city` y demás métricas "fans" | **Retiradas** por Meta | — | — | |

## Reportes que se pueden armar con esto

1. **Mismo video en tres redes**: tus Shorts/Reels se publican en YouTube, Instagram y Facebook. Emparejándolos por fecha y texto se puede comparar vistas, retención al segundo 3, tiempo medio y engagement del mismo contenido en cada red.
2. **Reporte de hooks**: retención a los 3 s (curva de YouTube y Facebook) y tasa de salto (Instagram) por video, ordenados de mejor a peor.
3. **SEO de YouTube**: términos de búsqueda de cada video y su evolución.
4. **Formato y descubrimiento**: alcance de Reels vs publicaciones vs historias, y de seguidores vs no seguidores, por semana.
5. **Competencia**: seguidores y engagement público de cuentas de referencia contra los tuyos.
6. **Mejor momento para publicar**: por día de la semana con los datos diarios actuales; por hora cuando Instagram entregue `online_followers` (100+ seguidores).

## Recomendación de implementación

- **Fase A (alto valor, poco esfuerzo)**:
  - YouTube: `engagedViews` y el desglose por tipo de contenido.
  - Instagram: desgloses por formato y por seguidor / no seguidor.
  - Facebook: tiempo visto y vistas completas de la Página.
  - Contadores `like_count` / `comments_count`.
- **Fase B (alto valor, esfuerzo medio)**:
  - YouTube: serie diaria, fuentes, países, edad/género y términos de búsqueda por video, en el sync semanal.
  - Benchmark de competidores en Instagram, con una lista de cuentas configurable.
- **Fase C**:
  - Reporte "mismo video en tres redes" y reporte de hooks.
  - Comentarios: Instagram y Facebook sí; YouTube con una API key de solo lectura.
  - Horas en línea y demografía de quien interactúa, en cuanto Instagram las entregue (100+ seguidores).
