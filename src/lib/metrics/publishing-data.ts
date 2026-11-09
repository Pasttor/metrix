import "server-only";
import { createClient } from "@/lib/db/server";
import type { PostStatus, TargetStatus } from "@/lib/publishing/runner";
import { PUBLISH_PLATFORMS, type PublishAccount } from "@/lib/publishing/scheduling";
import type { PublishPlatform } from "@/lib/publishing/types";
import { fail } from "./data";

/** Scheduled posts and the accounts that can publish, read with the user's session (RLS). */

export const SCHEDULED_SHOWN = 50;

export type ScheduledTarget = {
  id: string;
  platform: PublishPlatform;
  status: TargetStatus;
  attempts: number;
  error: string | null;
  permalink: string | null;
  publishedAt: string | null;
  note: string | null;
};

export type ScheduledPost = {
  id: string;
  caption: string;
  fileName: string | null;
  scheduledAt: string;
  status: PostStatus;
  targets: ScheduledTarget[];
};

export async function listPublishAccounts(): Promise<PublishAccount[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("accounts")
    .select("id, platform, name, handle")
    .in("platform", PUBLISH_PLATFORMS)
    .eq("status", "active")
    .order("connected_at");
  if (error) fail("accounts.publish", error);
  return data.map((row) => ({ id: row.id, platform: row.platform as PublishPlatform, name: row.name, handle: row.handle }));
}

export async function listScheduledPosts(): Promise<ScheduledPost[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id, caption, drive_file_name, scheduled_at, status, scheduled_post_targets(id, platform, status, attempts, error, permalink, published_at, state)")
    .order("scheduled_at", { ascending: false })
    .limit(SCHEDULED_SHOWN);
  if (error) fail("scheduled_posts.list", error);
  return data.map((row) => ({
    id: row.id,
    caption: row.caption,
    fileName: row.drive_file_name,
    scheduledAt: row.scheduled_at,
    status: row.status as PostStatus,
    targets: row.scheduled_post_targets
      .map((target) => {
        const state = target.state && typeof target.state === "object" && !Array.isArray(target.state) ? (target.state as Record<string, unknown>) : {};
        return {
          id: target.id,
          platform: target.platform as PublishPlatform,
          status: target.status as TargetStatus,
          attempts: target.attempts,
          error: target.error,
          permalink: target.permalink,
          publishedAt: target.published_at,
          note: typeof state.note === "string" ? state.note : null,
        };
      })
      .sort((a, b) => PUBLISH_PLATFORMS.indexOf(a.platform) - PUBLISH_PLATFORMS.indexOf(b.platform)),
  }));
}
