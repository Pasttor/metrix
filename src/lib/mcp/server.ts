import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { addDays } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { RANGE_OPTIONS, type Range } from "@/lib/range";
import * as data from "./data";

/**
 * The Metrix MCP server: read every metric Metrix stores and schedule posts.
 * Tool results are JSON text; errors come back as isError results with a
 * message the model can relay (never tokens or raw provider payloads).
 */

export const MCP_INSTRUCTIONS = `Metrix es el dashboard personal del creador: guarda a diario las métricas de sus cuentas de YouTube, Instagram, Facebook y TikTok (cuenta, publicaciones, retención, audiencia, competencia) y publica videos de su Google Drive.
- Empieza por resumen_general o listar_cuentas; usa catalogo_metricas para saber qué significa cada métrica.
- Para analizar hooks y guiones usa detalle_publicacion: trae la curva de retención (YouTube y Facebook), la tasa de salto de Instagram (reels_skip_rate), fuentes de tráfico y términos de búsqueda.
- Las fechas son días en zona ${"America/Mexico_City"} (YYYY-MM-DD). Los valores de publicaciones son acumulados a la última captura.
- Antes de programar_publicacion confirma con el usuario el video, el texto, las redes y la hora. YouTube sube como privado y TikTok como "Solo yo" mientras las apps no estén auditadas.`;

const platform = z.enum(data.DATA_PLATFORMS);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa YYYY-MM-DD");
const publishNetwork = z.enum(["instagram", "facebook", "youtube", "tiktok"]);

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Runs a tool body and turns thrown errors into a readable isError result. */
async function run(body: () => Promise<unknown>) {
  try {
    return result(await body());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    console.warn(`[mcp] tool failed: ${error instanceof Error ? error.name : "unknown"}`);
    return failure(message.startsWith("Database error") ? "Metrix no pudo leer la base de datos. Intenta de nuevo." : message);
  }
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export function registerMetrixTools(server: McpServer): void {
  server.registerTool(
    "resumen_general",
    {
      title: "Resumen general",
      description: "Resumen unificado de las 4 redes en un periodo: vistas, alcance, interacciones, seguidores ganados (con cambio vs. periodo anterior), top publicaciones por vistas y por engagement, y mejores horarios.",
      inputSchema: z.object({ dias: z.enum(RANGE_OPTIONS.map(String) as [string, ...string[]]).default("28").describe("Periodo en días: 7, 28, 90 o 365") }),
      annotations: READ,
    },
    async ({ dias }) => run(() => data.overview(Number(dias) as Range)),
  );

  server.registerTool(
    "listar_cuentas",
    { title: "Cuentas conectadas", description: "Cuentas conectadas en Metrix con su estado y la fecha de la última sincronización.", inputSchema: z.object({}), annotations: READ },
    async () => run(() => data.listAccounts()),
  );

  server.registerTool(
    "catalogo_metricas",
    {
      title: "Catálogo de métricas",
      description: "Qué métricas guarda Metrix por red y nivel (cuenta, publicación, audiencia), con su nombre en español, descripción y unidad.",
      inputSchema: z.object({ red: platform.optional() }),
      annotations: READ,
    },
    async ({ red }) => run(() => data.metricCatalog(red)),
  );

  server.registerTool(
    "metricas_cuenta",
    {
      title: "Métricas diarias de la cuenta",
      description: "Serie diaria de métricas de una cuenta (seguidores, vistas, alcance, tiempo visto, desgloses por formato…). Sin 'metricas' devuelve todas. Máximo 400 días.",
      inputSchema: z.object({
        red: platform,
        desde: day.optional().describe("Por defecto, hace 28 días"),
        hasta: day.optional().describe("Por defecto, hoy"),
        metricas: z.array(z.string()).optional().describe("Nombres exactos o base (p. ej. 'views' incluye 'views.format.reel')"),
      }),
      annotations: READ,
    },
    async ({ red, desde, hasta, metricas }) => {
      const to = hasta ?? data.today();
      return run(() => data.accountMetrics(red, desde ?? addDays(to, -28), to, metricas));
    },
  );

  server.registerTool(
    "listar_publicaciones",
    {
      title: "Publicaciones con métricas",
      description: "Publicaciones de una red con sus métricas más recientes (acumuladas). Ordena por cualquier métrica (p. ej. viewCount, views, post_media_view, view_count) y filtra por fecha o tipo.",
      inputSchema: z.object({
        red: platform,
        desde: day.optional(),
        hasta: day.optional(),
        tipo: z.enum(["video", "short", "reel", "image", "carousel", "post", "live"]).optional(),
        ordenar_por: z.string().optional().describe("Nombre de métrica para ordenar de mayor a menor"),
        limite: z.number().int().min(1).max(200).default(30),
      }),
      annotations: READ,
    },
    async ({ red, desde, hasta, tipo, ordenar_por, limite }) => run(() => data.listPosts(red, { from: desde, to: hasta, type: tipo, orderBy: ordenar_por, limit: limite })),
  );

  server.registerTool(
    "detalle_publicacion",
    {
      title: "Detalle de una publicación",
      description: "Todo sobre una publicación: texto, duración, métricas finales y primeras, serie diaria, curva de retención (YouTube/Facebook; hook = primeros puntos), fuentes de tráfico, países, edad/género y términos de búsqueda. Úsalo para mejorar guiones y hooks.",
      inputSchema: z.object({ id: z.uuid().describe("id de listar_publicaciones") }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) =>
      run(async () => {
        const detail = await data.postDetail(id);
        if (!detail) throw new Error("No existe esa publicación.");
        return detail;
      }),
  );

  server.registerTool(
    "audiencia",
    { title: "Audiencia de la cuenta", description: "Última foto de la audiencia de una cuenta: edad, género, países, ciudades, dispositivos y fuentes de tráfico.", inputSchema: z.object({ red: platform }), annotations: READ },
    async ({ red }) => run(() => data.accountAudience(red)),
  );

  server.registerTool(
    "reporte_contenido",
    {
      title: "Reporte de contenido entre redes",
      description: "El mismo video publicado en varias redes comparado lado a lado, hooks (retención al inicio y tasa de salto) y SEO de YouTube (términos de búsqueda por video y en total).",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => run(() => data.contentReports()),
  );

  server.registerTool(
    "competencia",
    { title: "Competencia en Instagram", description: "Tus métricas de Instagram contra las cuentas que sigues como competencia (seguidores, publicaciones, promedio de me gusta y comentarios).", inputSchema: z.object({}), annotations: READ },
    async () => run(() => data.competitors()),
  );

  server.registerTool(
    "alertas",
    {
      title: "Alertas y eventos",
      description: "Alertas de Metrix: sincronizaciones fallidas, cuentas por reconectar, publicaciones hechas o fallidas, métricas finales de historias.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(100).default(20), solo_sin_leer: z.boolean().default(false) }),
      annotations: READ,
    },
    async ({ limite, solo_sin_leer }) => run(() => data.alerts(limite, solo_sin_leer)),
  );

  server.registerTool(
    "publicaciones_programadas",
    {
      title: "Publicaciones programadas",
      description: "Publicaciones programadas y publicadas desde Metrix, con el estado de cada red (en cola, procesando, publicado, falló) y su enlace.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(50).default(20) }),
      annotations: READ,
    },
    async ({ limite }) => run(() => data.scheduledPosts(limite)),
  );

  server.registerTool(
    "videos_drive",
    {
      title: "Videos disponibles en Google Drive",
      description: "Videos de Google Drive que Metrix puede publicar. Por privacidad (permiso drive.file) solo aparecen los que el usuario ya eligió alguna vez en Publicar → Elegir de Google Drive.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(100).default(30) }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limite }) => run(() => data.driveVideos(limite)),
  );

  server.registerTool(
    "programar_publicacion",
    {
      title: "Programar o publicar un video",
      description: `Programa (o publica en los próximos 5 minutos) un video de Google Drive en una o varias redes. La hora va en ${getEnv().REPORT_TIMEZONE}. Confirma con el usuario antes de llamarla: publica en sus cuentas reales.`,
      inputSchema: z.object({
        drive_file_id: z.string().describe("id de videos_drive"),
        texto: z.string().max(2200).describe("Texto general con hashtags"),
        redes: z.array(publishNetwork).min(1),
        cuando: z.string().describe("'ahora' o fecha y hora local 'YYYY-MM-DDTHH:mm'"),
        texto_por_red: z.object({ instagram: z.string().max(2200), facebook: z.string().max(2200), youtube: z.string().max(2200), tiktok: z.string().max(2200) }).partial().optional(),
        titulo_youtube: z.string().max(100).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ drive_file_id, texto, redes, cuando, texto_por_red, titulo_youtube }) =>
      run(async () => {
        const outcome = await data.schedulePost({
          driveFileId: drive_file_id,
          caption: texto,
          networks: redes,
          when: cuando.trim().toLowerCase() === "ahora" || cuando.trim().toLowerCase() === "now" ? "now" : cuando.trim(),
          captions: texto_por_red,
          youtubeTitle: titulo_youtube,
        });
        if (!outcome.ok) throw new Error(outcome.message);
        return { ...outcome, seguimiento: "Usa publicaciones_programadas para ver el estado de cada red." };
      }),
  );

  server.registerTool(
    "cancelar_publicacion",
    {
      title: "Cancelar una publicación programada",
      description: "Cancela las redes que todavía no empiezan de una publicación programada. Las que ya están procesando no se pueden detener.",
      inputSchema: z.object({ id: z.uuid().describe("id de publicaciones_programadas") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => run(() => data.cancelScheduled(id)),
  );

  server.registerTool(
    "reintentar_publicacion",
    {
      title: "Reintentar una red fallida",
      description: "Vuelve a poner en cola una red que falló (targetId de publicaciones_programadas).",
      inputSchema: z.object({ target_id: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ target_id }) =>
      run(async () => {
        const retried = await data.retryScheduledTarget(target_id);
        if (!retried) throw new Error("Esa red no está fallida o no existe.");
        return { ok: true, mensaje: "Quedó en cola; se intentará en los próximos 5 minutos." };
      }),
  );

  server.registerPrompt(
    "reporte_semanal",
    { title: "Reporte semanal", description: "Reporte de la última semana en las 4 redes con conclusiones y acciones." },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "Con las herramientas de Metrix, arma mi reporte de los últimos 7 días: usa resumen_general (dias=7) y compáralo con 28 días, revisa las 5 mejores y las 3 peores publicaciones con detalle_publicacion, y alertas sin leer. Dame: qué funcionó y por qué (hook, retención, formato, horario), qué no, y 3 acciones concretas para la próxima semana.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "mejorar_hook",
    {
      title: "Mejorar el hook y el guion de un video",
      description: "Analiza la retención y la tasa de salto de un video y propone un hook y un guion mejores.",
      argsSchema: z.object({ id: z.string().describe("id de la publicación (de listar_publicaciones)") }),
    },
    ({ id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Usa detalle_publicacion con id ${id}. Mira la curva de retención (o reels_skip_rate en Instagram), dónde cae la audiencia y en qué segundos, las fuentes de tráfico y los términos de búsqueda. Compáralo con mis 5 videos con mejor retención de la misma red (listar_publicaciones). Dime por qué se fue la gente, y propón 3 hooks alternativos (primeros 3 s) y cambios al guion en los puntos donde cae la curva.`,
          },
        },
      ],
    }),
  );
}
