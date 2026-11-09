import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { insertNotifications } from "@/lib/notifications";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import { connectPlatformFor, type AccountPlatform } from "@/lib/oauth/types";
import { getConnector } from "@/lib/platforms/registry";
import { PUBLISHERS } from "./publishers";
import { postStatus, type ClaimedTarget, type PublishRunDeps, type PublishStore, type TargetStatus } from "./runner";
import type { PublishPlatform } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

function asState(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function supabasePublishStore(db: Admin): PublishStore {
  return {
    async claimDue(limit, leaseSeconds) {
      const claimed = await db.rpc("claim_publish_targets", { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (claimed.error) fail("claim_publish_targets", claimed.error);
      const targets = claimed.data ?? [];
      if (targets.length === 0) return [];

      const postIds = [...new Set(targets.map((target) => target.scheduled_post_id))];
      const accountIds = [...new Set(targets.flatMap((target) => (target.account_id ? [target.account_id] : [])))];
      const [posts, accounts] = await Promise.all([
        db.from("scheduled_posts").select("id, caption, drive_file_id, drive_file_name, drive_mime_type, drive_size_bytes").in("id", postIds),
        accountIds.length ? db.from("accounts").select("id, external_id, status").in("id", accountIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (posts.error) fail("scheduled_posts.claim", posts.error);
      if (accounts.error) fail("accounts.claim", accounts.error);
      const postById = new Map(posts.data.map((post) => [post.id, post]));
      const accountById = new Map(accounts.data.map((account) => [account.id, account]));

      return targets.flatMap<ClaimedTarget>((target) => {
        const post = postById.get(target.scheduled_post_id);
        if (!post) return [];
        const account = target.account_id ? accountById.get(target.account_id) : undefined;
        return [
          {
            id: target.id,
            postId: post.id,
            platform: target.platform as PublishPlatform,
            accountId: account ? account.id : null,
            externalAccountId: account?.external_id ?? null,
            caption: target.caption ?? post.caption,
            title: target.title,
            state: asState(target.state),
            attempts: target.attempts,
            video: { driveFileId: post.drive_file_id, name: post.drive_file_name, mimeType: post.drive_mime_type, sizeBytes: post.drive_size_bytes },
          },
        ];
      });
    },

    async saveTarget(targetId, update) {
      const { error } = await db
        .from("scheduled_post_targets")
        .update({ ...update, state: update.state as never, locked_until: null, updated_at: new Date().toISOString() })
        .eq("id", targetId);
      if (error) fail("scheduled_post_targets.save", error);
    },

    async settlePosts(postIds) {
      if (postIds.length === 0) return;
      const { data, error } = await db.from("scheduled_post_targets").select("scheduled_post_id, status").in("scheduled_post_id", postIds);
      if (error) fail("scheduled_post_targets.settle", error);
      for (const postId of postIds) {
        const status = postStatus(data.filter((row) => row.scheduled_post_id === postId).map((row) => row.status as TargetStatus));
        const update = await db
          .from("scheduled_posts")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", postId)
          .neq("status", "canceled");
        if (update.error) fail("scheduled_posts.settle", update.error);
      }
    },
  };
}

/** Tokens per account, refreshing Google/TikTok tokens (Meta Page tokens never expire). */
export function publishTokenGetter(db: Admin): PublishRunDeps["getAccessToken"] {
  const tokens = createTokenStoreForServer();
  const platforms = new Map<string, AccountPlatform | null>();
  return async (accountId, options) => {
    if (!platforms.has(accountId)) {
      const { data, error } = await db.from("accounts").select("platform").eq("id", accountId).maybeSingle();
      if (error) fail("accounts.platform", error);
      platforms.set(accountId, (data?.platform as AccountPlatform | undefined) ?? null);
    }
    const platform = platforms.get(accountId);
    const connector = platform && connectPlatformFor(platform) !== "meta" ? getConnector(connectPlatformFor(platform)) : null;
    return connector
      ? tokens.getValidAccessToken(accountId, (refreshToken) => connector.refresh(refreshToken), options)
      : tokens.getValidAccessToken(accountId);
  };
}

export function publishDeps(deadline: Date): PublishRunDeps {
  const db = createAdminClient();
  return {
    store: supabasePublishStore(db),
    publishers: PUBLISHERS,
    getAccessToken: publishTokenGetter(db),
    async getDriveAccountId() {
      const { data, error } = await db.from("accounts").select("id").eq("platform", "drive").eq("status", "active").order("connected_at").limit(1);
      if (error) fail("accounts.drive", error);
      return data[0]?.id ?? null;
    },
    notify: insertNotifications,
    graphVersion: getEnv().META_GRAPH_VERSION,
    deadline,
  };
}
