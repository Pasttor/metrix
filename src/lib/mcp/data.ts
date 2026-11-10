import "server-only";
import { addDays, dateInTimeZone } from "@/lib/dates";
import { createAdminClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/types";
import { getEnv } from "@/lib/env";
import { getCompetitorComparison } from "@/lib/metrics/competitors-data";
import { fail, getAccount, loadLatestAudience, loadMetricRows, loadPostAudience, loadPostDaily, loadPosts, loadRecentSnapshots, type Db } from "@/lib/metrics/data";
import { latestValuesByPost } from "@/lib/metrics/posts";
import { getOverview } from "@/lib/metrics/unified-data";
import type { AccountPlatform } from "@/lib/oauth/types";
import { getConnector } from "@/lib/platforms/registry";
import { youtubeRetentionDeps } from "@/lib/platforms/youtube/deps";
import { getRetentionCurve } from "@/lib/platforms/youtube/retention";
import { cancelPost, retryTarget, saveSchedule } from "@/lib/publishing/commands";
import { publishTokenGetter } from "@/lib/publishing/deps";
import { getDriveVideo, listDriveVideos, type DriveVideo } from "@/lib/publishing/drive";
import { buildSchedule, PUBLISH_PLATFORMS, type PublishAccount } from "@/lib/publishing/scheduling";
import type { PublishPlatform } from "@/lib/publishing/types";
import type { Range } from "@/lib/range";
import { getReports } from "@/lib/reports/reports-data";

/**
 * What the MCP tools read and write. The MCP endpoint has no Supabase
 * session, so it uses the service client after the bearer token was checked;
 * nothing here returns tokens or secrets.
 */

export type Platform = AccountPlatform;
export const DATA_PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;

const MAX_DAYS = 400;
const DETAIL_DAILY_DAYS = 120;
const TOP_PER_DIMENSION = 15;

function db(): Db {
  return createAdminClient() as unknown as Db;
}

export function today(): string {
  return dateInTimeZone(new Date(), getEnv().REPORT_TIMEZONE);
}

async function requireAccount(client: Db, platform: Platform) {
  const account = await getAccount(client, platform);
  if (!account) throw new Error(`${platform} no está conectado en Metrix.`);
  return account;
}

export async function listAccounts() {
  const { data, error } = await db().from("accounts").select("platform, name, handle, status, connected_at, last_synced_at").order("platform");
  if (error) fail("accounts.mcp", error);
  return data.map((row) => ({
    platform: row.platform,
    name: row.name,
    handle: row.handle,
    status: row.status,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
  }));
}

export async function metricCatalog(platform?: Platform) {
  let query = db().from("metric_catalog").select("platform, scope, metric, label_es, description_es, unit, unified_metric, deprecated_at").order("platform").order("scope").order("metric");
  if (platform) query = query.eq("platform", platform);
  const { data, error } = await query;
  if (error) fail("metric_catalog.mcp", error);
  return data.map((row) => ({
    platform: row.platform,
    scope: row.scope,
    metric: row.metric,
    label: row.label_es,
    description: row.description_es,
    unit: row.unit,
    unified: row.unified_metric,
    deprecated: row.deprecated_at !== null,
  }));
}

/** Breakdown metrics are stored as "<metric>.<label>.<value>"; the base name is the part before the first dot. */
function baseMetric(name: string): string {
  return name.split(".")[0];
}

export async function accountMetrics(platform: Platform, from: string, to: string, metrics?: string[]) {
  const client = db();
  const account = await requireAccount(client, platform);
  const start = from < addDays(to, -MAX_DAYS) ? addDays(to, -MAX_DAYS) : from;
  const rows = await loadMetricRows(client, account.id, start, to);
  const wanted = metrics && metrics.length > 0 ? new Set(metrics) : null;
  const byDate = new Map<string, Record<string, number>>();
  const names = new Set<string>();
  for (const row of rows) {
    if (wanted && !wanted.has(row.metric) && !wanted.has(baseMetric(row.metric))) continue;
    names.add(row.metric);
    const entry = byDate.get(row.date) ?? {};
    entry[row.metric] = row.value;
    byDate.set(row.date, entry);
  }
  return {
    account: { name: account.name, handle: account.handle, lastSyncedAt: account.lastSyncedAt },
    from: start,
    to,
    metrics: [...names].sort(),
    days: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
  };
}

async function postMetricNames(client: Db, platform: Platform): Promise<string[]> {
  const { data, error } = await client.from("metric_catalog").select("metric").eq("platform", platform).eq("scope", "post").is("deprecated_at", null);
  if (error) fail("metric_catalog.post", error);
  return data.map((row) => row.metric);
}

export async function listPosts(platform: Platform, options: { from?: string; to?: string; type?: string; orderBy?: string; limit: number }) {
  const client = db();
  const account = await requireAccount(client, platform);
  const [records, names] = await Promise.all([loadPosts(client, account.id), postMetricNames(client, platform)]);
  const values = latestValuesByPost(await loadRecentSnapshots(client, account.id, names));

  let posts = records
    .filter((post) => (!options.type || post.type === options.type) && post.type !== "story")
    .filter((post) => {
      const day = post.publishedAt?.slice(0, 10) ?? "";
      return (!options.from || day >= options.from) && (!options.to || day <= options.to);
    })
    .map((post) => ({
      id: post.id,
      type: post.type,
      title: post.caption?.split("\n")[0]?.slice(0, 150) ?? null,
      publishedAt: post.publishedAt,
      durationSeconds: post.durationSeconds,
      permalink: post.permalink,
      metrics: Object.fromEntries(values.get(post.id) ?? []),
    }));

  if (options.orderBy) {
    const key = options.orderBy;
    posts = posts.sort((a, b) => (b.metrics[key] ?? -Infinity) - (a.metrics[key] ?? -Infinity));
  }
  return { platform, total: posts.length, metricNames: names, posts: posts.slice(0, options.limit) };
}

type RetentionPoint = { ratio: number; watchRatio: number; relative?: number | null };

/** Keeps the whole first 10 % (the hook) and every 5th point after it. */
function compactCurve(points: RetentionPoint[]): RetentionPoint[] {
  return points.filter((point, index) => point.ratio <= 0.1 || index % 5 === 0 || index === points.length - 1);
}

function rawObject(raw: Json): Record<string, Json | undefined> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function retentionFor(postId: string, platform: string, raw: Json): Promise<{ points: RetentionPoint[] | null; note?: string }> {
  if (platform === "youtube") {
    const connector = getConnector("youtube");
    if (!connector) return { points: null, note: "Faltan las credenciales de Google." };
    try {
      const curve = await getRetentionCurve(postId, youtubeRetentionDeps(connector));
      return {
        points: curve ? compactCurve(curve.map((point) => ({ ratio: point.ratio, watchRatio: point.audienceWatchRatio, relative: point.relativePerformance ?? null }))) : null,
      };
    } catch (error) {
      return { points: null, note: `YouTube no entregó la retención (${error instanceof Error ? error.name : "error"}).` };
    }
  }
  if (platform === "facebook") {
    // Cached by the sync as { points: [{ ratio, audienceWatchRatio }] } (41 points, each 1/40 of the video).
    const list = rawObject(rawObject(raw).retention ?? null).points;
    if (Array.isArray(list)) {
      const points = list.flatMap((value) => {
        const point = rawObject(value ?? null);
        return typeof point.ratio === "number" && typeof point.audienceWatchRatio === "number" ? [{ ratio: point.ratio, watchRatio: point.audienceWatchRatio }] : [];
      });
      return { points: points.length > 0 ? points : null };
    }
    return { points: null, note: "Facebook todavía no tiene la curva de este video." };
  }
  if (platform === "instagram") return { points: null, note: "Instagram no da curva de retención; usa reels_skip_rate (salto en los primeros 3 s) y ig_reels_avg_watch_time." };
  return { points: null, note: "TikTok no da retención para cuentas personales." };
}

export async function postDetail(postId: string) {
  const client = db();
  const { data: post, error } = await client
    .from("posts")
    .select("id, type, caption, permalink, published_at, duration_seconds, raw, accounts!inner(platform, name)")
    .eq("id", postId)
    .maybeSingle();
  if (error) fail("posts.mcp", error);
  if (!post) return null;
  const account = Array.isArray(post.accounts) ? post.accounts[0] : post.accounts;
  const platform = account?.platform ?? "";

  const [snapshots, daily, audience, retention] = await Promise.all([
    client.from("post_metric_snapshots").select("captured_on, metric, value").eq("post_id", postId).order("captured_on"),
    loadPostDaily(client, postId),
    loadPostAudience(client, postId),
    retentionFor(postId, platform, post.raw),
  ]);
  if (snapshots.error) fail("post_metric_snapshots.mcp", snapshots.error);

  const latest: Record<string, number> = {};
  const firstSeen: Record<string, { date: string; value: number }> = {};
  for (const row of snapshots.data) {
    latest[row.metric] = Number(row.value);
    firstSeen[row.metric] ??= { date: row.captured_on, value: Number(row.value) };
  }

  const since = addDays(today(), -DETAIL_DAILY_DAYS);
  const dailyByDate = new Map<string, Record<string, number>>();
  for (const row of daily) {
    if (row.date < since) continue;
    const entry = dailyByDate.get(row.date) ?? {};
    entry[row.metric] = row.value;
    dailyByDate.set(row.date, entry);
  }

  const breakdowns: Record<string, { key: string; value: number }[]> = {};
  for (const record of audience.records) (breakdowns[record.dimension] ??= []).push({ key: record.key, value: record.value });
  for (const dimension of Object.keys(breakdowns)) breakdowns[dimension] = breakdowns[dimension].sort((a, b) => b.value - a.value).slice(0, TOP_PER_DIMENSION);

  return {
    id: post.id,
    platform,
    type: post.type,
    caption: post.caption,
    permalink: post.permalink,
    publishedAt: post.published_at,
    durationSeconds: post.duration_seconds,
    latestMetrics: latest,
    firstSnapshot: firstSeen,
    daily: [...dailyByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
    breakdowns: { capturedOn: audience.date, ...breakdowns },
    retention: retention.points
      ? { explanation: "ratio = fracción del video (0–1); watchRatio = parte de la audiencia que sigue viendo en ese punto (puede pasar de 1 con repeticiones).", points: retention.points }
      : { note: retention.note ?? "Sin datos de retención." },
  };
}

export async function accountAudience(platform: Platform) {
  const client = db();
  const account = await requireAccount(client, platform);
  const audience = await loadLatestAudience(client, account.id);
  const byDimension: Record<string, { key: string; value: number }[]> = {};
  for (const record of audience.records) (byDimension[record.dimension] ??= []).push({ key: record.key, value: record.value });
  for (const dimension of Object.keys(byDimension)) byDimension[dimension] = byDimension[dimension].sort((a, b) => b.value - a.value).slice(0, 25);
  return { platform, capturedOn: audience.date, dimensions: byDimension };
}

export async function overview(range: Range) {
  const data = await getOverview(range, db());
  // Only the hours with posts (weekday 0 = lunes, hours in the report time zone); the empty cells waste context.
  const bestTimes = (data.heatmap.all ?? []).filter((cell) => cell.posts > 0);
  return { range, networks: data.networks, topByViews: data.topByViews, topByEngagement: data.topByEngagement, bestTimes };
}

export async function contentReports() {
  return getReports(db());
}

export async function competitors() {
  return getCompetitorComparison(db());
}

export async function alerts(limit: number, unreadOnly: boolean) {
  let query = db().from("notifications").select("kind, severity, title, message, href, created_at, read_at").order("created_at", { ascending: false }).limit(limit);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) fail("notifications.mcp", error);
  return data.map((row) => ({ kind: row.kind, severity: row.severity, title: row.title, message: row.message, createdAt: row.created_at, read: row.read_at !== null }));
}

export async function scheduledPosts(limit: number) {
  const { data, error } = await db()
    .from("scheduled_posts")
    .select("id, caption, drive_file_name, scheduled_at, status, scheduled_post_targets(id, platform, status, attempts, error, permalink, published_at)")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) fail("scheduled_posts.mcp", error);
  return data.map((row) => ({
    id: row.id,
    caption: row.caption,
    file: row.drive_file_name,
    scheduledAt: row.scheduled_at,
    status: row.status,
    targets: row.scheduled_post_targets.map((target) => ({
      targetId: target.id,
      platform: target.platform,
      status: target.status,
      attempts: target.attempts,
      error: target.error,
      permalink: target.permalink,
      publishedAt: target.published_at,
    })),
  }));
}

async function driveToken(): Promise<string> {
  const client = createAdminClient();
  const { data, error } = await client.from("accounts").select("id").eq("platform", "drive").eq("status", "active").order("connected_at").limit(1);
  if (error) fail("accounts.drive", error);
  const accountId = data[0]?.id;
  if (!accountId) throw new Error("Google Drive no está conectado en Metrix (Configuración → Conexiones).");
  return publishTokenGetter(client)(accountId);
}

export async function driveVideos(limit: number): Promise<DriveVideo[]> {
  return listDriveVideos(await driveToken(), fetch, limit);
}

async function publishAccounts(): Promise<PublishAccount[]> {
  const { data, error } = await db().from("accounts").select("id, platform, name, handle").in("platform", PUBLISH_PLATFORMS).eq("status", "active").order("connected_at");
  if (error) fail("accounts.publish_mcp", error);
  return data.map((row) => ({ id: row.id, platform: row.platform as PublishPlatform, name: row.name, handle: row.handle }));
}

export type ScheduleRequest = {
  driveFileId: string;
  caption: string;
  networks: PublishPlatform[];
  /** "now" or "YYYY-MM-DDTHH:mm" in the report time zone. */
  when: string;
  captions?: Partial<Record<PublishPlatform, string>>;
  youtubeTitle?: string;
  /** Raw TikTok choices (see publishing/options.ts); required when TikTok is a network. */
  tiktok?: unknown;
  /** Raw YouTube choices; required when YouTube is a network. */
  youtube?: unknown;
};

export async function schedulePost(request: ScheduleRequest) {
  const video = await getDriveVideo(request.driveFileId, await driveToken());
  if (!video) {
    return {
      ok: false as const,
      message: "Metrix no puede abrir ese archivo de Drive. Con el permiso drive.file solo ve los videos elegidos en el selector: ábrelo una vez desde Publicar → Elegir de Google Drive, o usa uno de videos_drive.",
    };
  }
  const accounts = await publishAccounts();
  const chosen = request.networks.map((platform) => accounts.find((account) => account.platform === platform));
  const missing = request.networks.filter((_, index) => !chosen[index]);
  if (missing.length > 0) return { ok: false as const, message: `No hay cuenta activa de: ${missing.join(", ")}.` };

  const later = request.when !== "now";
  const result = buildSchedule(
    {
      driveFileId: video.id,
      driveFileName: video.name,
      driveMimeType: video.mimeType,
      driveSizeBytes: video.sizeBytes ?? undefined,
      caption: request.caption.trim(),
      accountIds: chosen.map((account) => account!.id),
      when: later ? "later" : "now",
      scheduledAt: later ? request.when : undefined,
      youtubeTitle: request.youtubeTitle?.trim() || undefined,
      captions: Object.fromEntries(Object.entries(request.captions ?? {}).filter(([, value]) => value?.trim())) as Record<string, string>,
      tiktok: request.tiktok,
      youtube: request.youtube,
    },
    accounts,
    new Date(),
    getEnv().REPORT_TIMEZONE,
  );
  if (!result.ok) return result;
  const saved = await saveSchedule(createAdminClient(), result.rows);
  if (!saved.ok) return saved;
  return { ok: true as const, postId: saved.postId, scheduledAt: result.rows.post.scheduled_at, video: video.name, networks: request.networks };
}

export async function cancelScheduled(postId: string) {
  return cancelPost(createAdminClient(), postId);
}

export async function retryScheduledTarget(targetId: string) {
  return retryTarget(createAdminClient(), targetId);
}
