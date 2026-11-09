/**
 * Phase C reports (pure functions): the same video across networks, hook
 * retention and YouTube SEO. Inputs come from the database; nothing calls an API.
 */

const STOPWORDS = new Set(
  "de la el en y a los las un una unos unas que por con para del se su sus al lo es como mas más o u pero sin sobre este esta esto estos estas ese esa eso tu tus te mi mis yo le les ya no si sí ni muy hay fue son ser era the of to and in for is on with you your".split(
    " ",
  ),
);

/** Lowercase words without accents, hashtags, links, punctuation or stopwords. */
export function keywords(text: string | null | undefined, limit = 20): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]\S+/g, " ")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .slice(0, limit);
}

/**
 * Overlap of two keyword sets (0..1): shared words over the smaller set, so a
 * short YouTube title still matches the long caption of the same video.
 */
export function similarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

export type ReportPost = {
  id: string;
  platform: "youtube" | "instagram" | "facebook";
  title: string;
  caption: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  href: string;
  views: number | null;
  engagement: number | null;
  /** Average watch time in seconds. */
  avgWatchSeconds: number | null;
  /** Share of viewers still watching at 3 s (0..100). */
  hook3s: number | null;
};

export type CrossGroup = { key: string; title: string; posts: Partial<Record<ReportPost["platform"], ReportPost>>; score: number };

export const MATCH_MIN_SIMILARITY = 0.4;
export const MATCH_MAX_DAYS = 3;

function daysApart(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/**
 * Groups the same video published on several networks: same words in the
 * title/caption and published within 3 days. Each post joins one group at most;
 * YouTube videos anchor groups, then unmatched Instagram posts.
 */
export function matchAcrossNetworks(posts: ReportPost[]): CrossGroup[] {
  const words = new Map(posts.map((post) => [post.id, keywords(`${post.title} ${post.caption ?? ""}`)]));
  const used = new Set<string>();
  const groups: CrossGroup[] = [];
  const anchors = [...posts.filter((post) => post.platform === "youtube"), ...posts.filter((post) => post.platform === "instagram")];

  for (const anchor of anchors) {
    if (used.has(anchor.id)) continue;
    const group: CrossGroup = { key: anchor.id, title: anchor.title, posts: { [anchor.platform]: anchor }, score: 1 };
    const scores: number[] = [];
    for (const platform of ["youtube", "instagram", "facebook"] as const) {
      if (platform === anchor.platform || group.posts[platform]) continue;
      let best: { post: ReportPost; score: number } | null = null;
      for (const candidate of posts) {
        if (candidate.platform !== platform || used.has(candidate.id)) continue;
        if (daysApart(anchor.publishedAt, candidate.publishedAt) > MATCH_MAX_DAYS) continue;
        const score = similarity(words.get(anchor.id)!, words.get(candidate.id)!);
        if (score >= MATCH_MIN_SIMILARITY && (!best || score > best.score)) best = { post: candidate, score };
      }
      if (best) {
        group.posts[platform] = best.post;
        scores.push(best.score);
      }
    }
    if (scores.length === 0) continue;
    for (const post of Object.values(group.posts)) used.add(post!.id);
    group.score = scores.reduce((a, b) => a + b, 0) / scores.length;
    groups.push(group);
  }
  return groups.sort((a, b) => (b.posts.youtube?.publishedAt ?? "").localeCompare(a.posts.youtube?.publishedAt ?? ""));
}

export type RetentionPoint = { ratio: number; audienceWatchRatio: number };

/**
 * Share of the starting audience still watching at `seconds` (0..100), from a
 * retention curve. The curve is divided by its first point because Shorts start
 * above 100 % with replays.
 */
export function retentionAt(points: RetentionPoint[], durationSeconds: number | null, seconds = 3): number | null {
  if (points.length === 0 || !durationSeconds || durationSeconds <= 0) return null;
  const target = Math.min(1, seconds / durationSeconds);
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio);
  const start = sorted[0].audienceWatchRatio;
  if (start <= 0) return null;
  const nearest = sorted.reduce((best, point) => (Math.abs(point.ratio - target) < Math.abs(best.ratio - target) ? point : best), sorted[0]);
  return Math.min(100, (nearest.audienceWatchRatio / start) * 100);
}

/** Instagram's skip rate is the share of plays that skipped in the first 3 s. */
export function hookFromSkipRate(skipRate: number | null): number | null {
  return skipRate === null ? null : Math.max(0, Math.min(100, 100 - skipRate));
}

export type SearchTermRow = { term: string; views: number; videos: number; relatedToTitles: boolean; videoTitles: string[] };

/**
 * YouTube search terms summed across videos. A term counts as related when it
 * shares a keyword with the title of a video it brought views to.
 */
export function aggregateSearchTerms(videos: { title: string; terms: { term: string; views: number }[] }[]): SearchTermRow[] {
  const rows = new Map<string, SearchTermRow>();
  for (const video of videos) {
    const titleWords = new Set(keywords(video.title));
    for (const { term, views } of video.terms) {
      const row = rows.get(term) ?? { term, views: 0, videos: 0, relatedToTitles: false, videoTitles: [] };
      row.views += views;
      row.videos += 1;
      row.videoTitles.push(video.title);
      if (keywords(term).some((word) => titleWords.has(word))) row.relatedToTitles = true;
      rows.set(term, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.views - a.views);
}

/** Share of a video's views that came from YouTube search (0..100). */
export function searchShare(trafficSources: { key: string; value: number }[]): number | null {
  const total = trafficSources.reduce((sum, row) => sum + row.value, 0);
  if (!total) return null;
  return ((trafficSources.find((row) => row.key === "YT_SEARCH")?.value ?? 0) / total) * 100;
}
