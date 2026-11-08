-- Initial metric_catalog for the four platforms (names taken from the sync
-- tasks in docs/PLAN.md). Idempotent: safe to run on every push.
-- Each sync task must confirm its names against the official docs and mark
-- retired metrics with deprecated_at instead of deleting rows.

insert into public.metric_catalog
  (platform, scope, metric, unified_metric, label_es, description_es, unit)
values
  -- YouTube: channel (YouTube Analytics, dimensions=day)
  ('youtube', 'account', 'views', 'views', 'Vistas', 'Vistas del canal en el día', 'count'),
  ('youtube', 'account', 'estimatedMinutesWatched', 'watch_time_minutes', 'Minutos vistos', 'Tiempo de visualización estimado', 'minutes'),
  ('youtube', 'account', 'averageViewDuration', 'avg_view_duration_seconds', 'Duración media de vista', 'Segundos promedio por vista', 'seconds'),
  ('youtube', 'account', 'averageViewPercentage', null, 'Porcentaje medio visto', 'Porcentaje promedio del video que se ve', 'percent'),
  ('youtube', 'account', 'subscribersGained', null, 'Suscriptores ganados', null, 'count'),
  ('youtube', 'account', 'subscribersLost', null, 'Suscriptores perdidos', null, 'count'),
  ('youtube', 'account', 'likes', 'likes', 'Me gusta', null, 'count'),
  ('youtube', 'account', 'comments', 'comments', 'Comentarios', null, 'count'),
  ('youtube', 'account', 'shares', 'shares', 'Compartidos', null, 'count'),
  ('youtube', 'account', 'estimatedRevenue', null, 'Ingresos estimados', 'Solo si YOUTUBE_MONETARY=true', 'currency'),
  -- YouTube: channel snapshot (Data API channels.list)
  ('youtube', 'account', 'subscriberCount', 'followers', 'Suscriptores', 'Total de suscriptores ese día', 'count'),
  ('youtube', 'account', 'viewCount', null, 'Vistas totales del canal', 'Acumulado histórico', 'count'),
  ('youtube', 'account', 'videoCount', null, 'Videos publicados', 'Acumulado histórico', 'count'),
  -- YouTube: video
  ('youtube', 'post', 'viewCount', 'views', 'Vistas', 'Acumulado del video', 'count'),
  ('youtube', 'post', 'likeCount', 'likes', 'Me gusta', 'Acumulado del video', 'count'),
  ('youtube', 'post', 'commentCount', 'comments', 'Comentarios', 'Acumulado del video', 'count'),
  ('youtube', 'post', 'estimatedMinutesWatched', 'watch_time_minutes', 'Minutos vistos', 'Acumulado del video', 'minutes'),
  ('youtube', 'post', 'averageViewDuration', 'avg_view_duration_seconds', 'Duración media de vista', null, 'seconds'),
  ('youtube', 'post', 'averageViewPercentage', null, 'Porcentaje medio visto', null, 'percent'),
  -- YouTube: audience (últimos 28 días)
  ('youtube', 'audience', 'viewerPercentage', null, 'Porcentaje de espectadores', 'Por edad y género', 'percent'),
  ('youtube', 'audience', 'views', null, 'Vistas', 'Por país, dispositivo o fuente de tráfico', 'count'),

  -- Instagram: account
  ('instagram', 'account', 'followers_count', 'followers', 'Seguidores', 'Total de seguidores ese día', 'count'),
  ('instagram', 'account', 'media_count', null, 'Publicaciones', 'Total de publicaciones', 'count'),
  ('instagram', 'account', 'views', 'views', 'Vistas', null, 'count'),
  ('instagram', 'account', 'reach', 'reach', 'Alcance', 'Cuentas únicas que vieron contenido', 'count'),
  ('instagram', 'account', 'accounts_engaged', null, 'Cuentas que interactuaron', null, 'count'),
  ('instagram', 'account', 'total_interactions', 'interactions', 'Interacciones', null, 'count'),
  ('instagram', 'account', 'likes', 'likes', 'Me gusta', null, 'count'),
  ('instagram', 'account', 'comments', 'comments', 'Comentarios', null, 'count'),
  ('instagram', 'account', 'shares', 'shares', 'Compartidos', null, 'count'),
  ('instagram', 'account', 'saves', 'saves', 'Guardados', null, 'count'),
  ('instagram', 'account', 'replies', null, 'Respuestas', 'Respuestas a historias', 'count'),
  ('instagram', 'account', 'profile_links_taps', null, 'Toques en enlaces del perfil', null, 'count'),
  ('instagram', 'account', 'follows_and_unfollows', null, 'Seguimientos y dejadas de seguir', null, 'count'),
  ('instagram', 'account', 'reposts', null, 'Reposts', null, 'count'),
  -- Instagram: posts, reels and stories
  ('instagram', 'post', 'views', 'views', 'Vistas', null, 'count'),
  ('instagram', 'post', 'reach', 'reach', 'Alcance', null, 'count'),
  ('instagram', 'post', 'likes', 'likes', 'Me gusta', null, 'count'),
  ('instagram', 'post', 'comments', 'comments', 'Comentarios', null, 'count'),
  ('instagram', 'post', 'shares', 'shares', 'Compartidos', null, 'count'),
  ('instagram', 'post', 'saved', 'saves', 'Guardados', null, 'count'),
  ('instagram', 'post', 'total_interactions', 'interactions', 'Interacciones', null, 'count'),
  ('instagram', 'post', 'reposts', null, 'Reposts', null, 'count'),
  ('instagram', 'post', 'ig_reels_avg_watch_time', null, 'Tiempo medio de visualización', 'Solo Reels; la API lo entrega en milisegundos', 'milliseconds'),
  ('instagram', 'post', 'ig_reels_video_view_total_time', null, 'Tiempo total de visualización', 'Solo Reels; la API lo entrega en milisegundos', 'milliseconds'),
  ('instagram', 'post', 'reels_skip_rate', null, 'Tasa de salto', 'Solo Reels', 'percent'),
  ('instagram', 'post', 'total_likes', null, 'Me gusta totales', 'Incluye promociones', 'count'),
  ('instagram', 'post', 'total_comments', null, 'Comentarios totales', 'Incluye promociones', 'count'),
  ('instagram', 'post', 'total_views', null, 'Vistas totales', 'Incluye promociones', 'count'),
  ('instagram', 'post', 'replies', null, 'Respuestas', 'Solo historias', 'count'),
  ('instagram', 'post', 'navigation', null, 'Navegación', 'Solo historias', 'count'),
  ('instagram', 'post', 'link_clicks', null, 'Clics en enlace', 'Solo historias', 'count'),
  -- Instagram: audience
  ('instagram', 'audience', 'follower_demographics', null, 'Demografía de seguidores', 'Requiere 100 o más seguidores', 'count'),

  -- Facebook: Page
  ('facebook', 'account', 'followers_count', 'followers', 'Seguidores', 'Total de seguidores ese día', 'count'),
  ('facebook', 'account', 'page_follows', null, 'Seguidores de la Página', null, 'count'),
  ('facebook', 'account', 'page_total_media_view_unique', 'reach', 'Espectadores únicos', null, 'count'),
  ('facebook', 'account', 'page_post_engagements', 'interactions', 'Interacciones con publicaciones', null, 'count'),
  ('facebook', 'account', 'page_video_views', null, 'Reproducciones de video', null, 'count'),
  ('facebook', 'account', 'page_media_view', 'views', 'Vistas', 'Veces que se vio contenido de la Página (reemplaza a las impresiones)', 'count'),
  -- Facebook: posts
  ('facebook', 'post', 'post_total_media_view_unique', 'reach', 'Espectadores únicos', null, 'count'),
  ('facebook', 'post', 'post_reactions_by_type_total', null, 'Reacciones por tipo', null, 'count'),
  ('facebook', 'post', 'post_clicks', null, 'Clics', null, 'count'),
  ('facebook', 'post', 'reactions', 'likes', 'Reacciones', 'Total de reacciones del post', 'count'),
  ('facebook', 'post', 'comments', 'comments', 'Comentarios', null, 'count'),
  ('facebook', 'post', 'shares', 'shares', 'Compartidos', null, 'count'),
  ('facebook', 'post', 'post_media_view', 'views', 'Vistas', 'Veces que se vio el post', 'count'),
  ('facebook', 'post', 'post_video_views', null, 'Reproducciones de video', 'Vistas de 3 segundos o más', 'count'),
  ('facebook', 'post', 'post_video_avg_time_watched', null, 'Tiempo medio de visualización', 'La API lo entrega en milisegundos', 'milliseconds'),

  -- TikTok: account (Display API user.info)
  ('tiktok', 'account', 'follower_count', 'followers', 'Seguidores', 'Total de seguidores ese día', 'count'),
  ('tiktok', 'account', 'following_count', null, 'Siguiendo', null, 'count'),
  ('tiktok', 'account', 'likes_count', null, 'Me gusta recibidos', 'Acumulado histórico', 'count'),
  ('tiktok', 'account', 'video_count', null, 'Videos publicados', null, 'count'),
  -- TikTok: video
  ('tiktok', 'post', 'view_count', 'views', 'Vistas', 'Acumulado del video', 'count'),
  ('tiktok', 'post', 'like_count', 'likes', 'Me gusta', 'Acumulado del video', 'count'),
  ('tiktok', 'post', 'comment_count', 'comments', 'Comentarios', 'Acumulado del video', 'count'),
  ('tiktok', 'post', 'share_count', 'shares', 'Compartidos', 'Acumulado del video', 'count')
on conflict (platform, scope, metric) do update set
  unified_metric = excluded.unified_metric,
  label_es = excluded.label_es,
  description_es = excluded.description_es,
  unit = excluded.unit;
