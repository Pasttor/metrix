/** Video table, video growth and audience breakdowns for the YouTube dashboard. */

export type PostRecord = {
  id: string;
  type: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};
export type SnapshotRecord = { postId: string; capturedOn: string; metric: string; value: number };

export type VideoRow = {
  id: string;
  title: string;
  type: "video" | "short";
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** (likes + comments) / views, in percent. */
  engagement: number | null;
};

/** Latest value of each counter per post (snapshots are cumulative). */
function latestValues(snapshots: SnapshotRecord[]) {
  const latest = new Map<string, { capturedOn: string; value: number }>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.postId}|${snapshot.metric}`;
    const current = latest.get(key);
    if (!current || snapshot.capturedOn > current.capturedOn) latest.set(key, snapshot);
  }
  return (postId: string, metric: string) => latest.get(`${postId}|${metric}`)?.value ?? null;
}

export function buildVideoRows(posts: PostRecord[], snapshots: SnapshotRecord[]): VideoRow[] {
  const value = latestValues(snapshots);
  return posts.map((post) => {
    const views = value(post.id, "viewCount");
    const likes = value(post.id, "likeCount");
    const comments = value(post.id, "commentCount");
    const engagement = views && (likes !== null || comments !== null) ? (((likes ?? 0) + (comments ?? 0)) / views) * 100 : null;
    return {
      id: post.id,
      title: post.caption ?? "Sin título",
      type: post.type === "short" ? "short" : "video",
      permalink: post.permalink,
      thumbnailUrl: post.thumbnailUrl,
      publishedAt: post.publishedAt,
      durationSeconds: post.durationSeconds,
      views,
      likes,
      comments,
      engagement,
    };
  });
}

export type GrowthPoint = { date: string; total: number; gained: number | null };

/** Daily cumulative views of one video and the views gained since the previous snapshot. */
export function viewGrowth(snapshots: { capturedOn: string; value: number }[]): GrowthPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));
  return sorted.map((snapshot, i) => ({
    date: snapshot.capturedOn,
    total: snapshot.value,
    gained: i === 0 ? null : Math.max(0, snapshot.value - sorted[i - 1].value),
  }));
}

export type AudienceRecord = { dimension: string; key: string; value: number };
export type ShareRow = { key: string; label: string; value: number; share: number };
export type AgeGenderRow = { age: string; label: string; male: number; female: number; other: number };

export type Audience = {
  ageGender: AgeGenderRow[];
  countries: ShareRow[];
  devices: ShareRow[];
  trafficSources: ShareRow[];
};

const AGE_ORDER = ["age13-17", "age18-24", "age25-34", "age35-44", "age45-54", "age55-64", "age65-"];

export function ageLabel(key: string): string {
  if (key === "age65-") return "65+";
  return key.replace(/^age/, "").replace("-", "–");
}

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Celular",
  DESKTOP: "Computadora",
  TABLET: "Tableta",
  TV: "TV",
  GAME_CONSOLE: "Consola",
  UNKNOWN_PLATFORM: "Desconocido",
};

const TRAFFIC_LABELS: Record<string, string> = {
  ADVERTISING: "Publicidad",
  ANNOTATION: "Anotaciones",
  CAMPAIGN_CARD: "Tarjetas de campaña",
  END_SCREEN: "Pantallas finales",
  EXT_URL: "Sitios externos",
  HASHTAGS: "Hashtags",
  LIVE_REDIRECT: "Redirección de directos",
  NO_LINK_EMBEDDED: "Insertado sin enlace",
  NO_LINK_OTHER: "Directo o desconocido",
  NOTIFICATION: "Notificaciones",
  PLAYLIST: "Listas de reproducción",
  PRODUCT_PAGE: "Páginas de producto",
  PROMOTED: "Promoción",
  RELATED_VIDEO: "Videos sugeridos",
  SHORTS: "Feed de Shorts",
  SHORTS_CONTENT_LINKS: "Enlaces en Shorts",
  SOUND_PAGE: "Páginas de sonido",
  SUBSCRIBER: "Inicio y suscripciones",
  VIDEO_REMIXES: "Remixes",
  YT_CHANNEL: "Páginas de canal",
  YT_OTHER_PAGE: "Otras páginas de YouTube",
  YT_PLAYLIST_PAGE: "Páginas de listas",
  YT_SEARCH: "Búsqueda de YouTube",
  IMMERSIVE_LIVE: "Directos inmersivos",
};

let regionNames: Intl.DisplayNames | null = null;
export function countryLabel(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["es-MX"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function shares(records: AudienceRecord[], label: (key: string) => string, limit?: number): ShareRow[] {
  const total = records.reduce((sum, record) => sum + record.value, 0);
  const rows = records
    .map((record) => ({ key: record.key, label: label(record.key), value: record.value, share: total ? record.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
  return limit ? rows.slice(0, limit) : rows;
}

export function buildAudience(records: AudienceRecord[]): Audience {
  const of = (dimension: string) => records.filter((record) => record.dimension === dimension);

  const ages = new Map<string, AgeGenderRow>();
  for (const record of of("age_gender")) {
    const [age, gender] = record.key.split("|");
    const row = ages.get(age) ?? { age, label: ageLabel(age), male: 0, female: 0, other: 0 };
    if (gender === "male") row.male += record.value;
    else if (gender === "female") row.female += record.value;
    else row.other += record.value;
    ages.set(age, row);
  }
  const ageGender = [...ages.values()].sort((a, b) => AGE_ORDER.indexOf(a.age) - AGE_ORDER.indexOf(b.age));

  return {
    ageGender,
    countries: shares(of("country"), countryLabel, 10),
    devices: shares(of("device"), (key) => DEVICE_LABELS[key] ?? key),
    trafficSources: shares(of("traffic_source"), (key) => TRAFFIC_LABELS[key] ?? key),
  };
}
