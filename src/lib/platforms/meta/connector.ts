import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import type { OAuthTokens } from "@/lib/oauth/types";
import { errorCode, fetchWithRetry, HttpError, parseJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { createMetaClient, GRAPH_HOST } from "./client";
import { businessSchema, metaTokenSchema, pageSchema, permissionsSchema, type MetaToken, type Page } from "./schemas";

/** Read-only permissions: Page list and insights, Instagram profile and insights. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
] as const;

/**
 * Requested but not required: Pages owned by a business portfolio (Meta Business
 * Suite) are only listed with it. Used read-only to find those Pages.
 */
export const META_OPTIONAL_SCOPES = ["business_management"] as const;

/** Publishing phase (optional): Instagram Reels and Facebook Page posts. */
export const META_PUBLISH_SCOPES = ["instagram_content_publish", "pages_manage_posts"] as const;

const PAGE_FIELDS = "id,name,username,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}";

export type MetaConnectorConfig = {
  appId: string;
  appSecret: string;
  version: string;
  /** Facebook Login for Business configuration; when set it replaces `scope`. */
  loginConfigId?: string;
  /** Extra permissions, e.g. business_management for Pages inside a Business portfolio. */
  extraScopes?: string[];
  fetch?: FetchFn;
  retry?: RetryOptions;
  now?: () => Date;
};

export function createMetaConnector(config: MetaConnectorConfig): PlatformConnector {
  const fetchFn = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  /** POST so the app secret and codes never sit in a URL. */
  async function tokenRequest(params: Record<string, string>): Promise<MetaToken> {
    const response = await fetchWithRetry(
      fetchFn,
      `${GRAPH_HOST}/${config.version}/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, ...params }),
      },
      config.retry,
    );
    if (!response.ok) {
      const reason = await errorCode(response);
      throw new ConnectorError("token_exchange_failed", `Meta token exchange failed (${response.status} ${reason})`);
    }
    return parseJson(response, metaTokenSchema, "meta.oauth.access_token").catch(() => {
      throw new ConnectorError("token_exchange_failed", "Meta token response had an unexpected shape");
    });
  }

  return {
    platform: "meta",

    buildAuthUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
      url.searchParams.set("client_id", config.appId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      if (config.loginConfigId) {
        url.searchParams.set("config_id", config.loginConfigId);
      } else {
        url.searchParams.set("scope", [...META_SCOPES, ...META_OPTIONAL_SCOPES, ...META_PUBLISH_SCOPES, ...(config.extraScopes ?? [])].join(","));
      }
      return url.toString();
    },

    async handleCallback({ code, codeVerifier, redirectUri }) {
      const short = await tokenRequest({ code, redirect_uri: redirectUri, code_verifier: codeVerifier });
      // Page tokens derived from a long-lived user token do not expire.
      const long = await tokenRequest({ grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
      const userExpiresAt = long.expires_in ? new Date(now().getTime() + long.expires_in * 1000) : null;

      const graph = createMetaClient({ version: config.version, accessToken: long.access_token, fetch: fetchFn, retry: config.retry });

      let pages: Page[];
      const diagnostics = { accounts: 0, businesses: 0, businessPages: 0, businessManagement: false };
      try {
        const permissions = await graph.get("me/permissions", {}, permissionsSchema, "meta.me.permissions");
        const granted = new Set(permissions.data.filter((p) => p.status === "granted").map((p) => p.permission));
        if (META_SCOPES.some((scope) => !granted.has(scope))) throw new ConnectorError("missing_scopes");
        diagnostics.businessManagement = granted.has("business_management");

        pages = await graph.getAll("me/accounts", { fields: PAGE_FIELDS, limit: "100" }, pageSchema, "meta.me.accounts");
        diagnostics.accounts = pages.length;

        // Pages of a business portfolio do not show up in /me/accounts; look them up there.
        if (!pages.some((page) => page.access_token) && diagnostics.businessManagement) {
          const businesses = await graph.getAll("me/businesses", { fields: "id", limit: "100" }, businessSchema, "meta.me.businesses");
          diagnostics.businesses = businesses.length;
          for (const business of businesses) {
            for (const edge of ["owned_pages", "client_pages"]) {
              const found = await graph.getAll(`${business.id}/${edge}`, { fields: PAGE_FIELDS, limit: "100" }, pageSchema, `meta.business.${edge}`);
              diagnostics.businessPages += found.length;
              pages.push(...found);
            }
          }
          pages = [...new Map(pages.map((page) => [page.id, page])).values()];
        }
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        const reason = error instanceof HttpError ? `${error.status} ${error.code}` : error instanceof Error ? error.name : "unknown";
        throw new ConnectorError("accounts_lookup_failed", `Meta accounts lookup failed (${reason})`);
      }

      // The user picks which Pages to share in Meta's own dialog; only those come back.
      const usable = pages.filter((page) => page.access_token);
      if (usable.length === 0) {
        // Counts only: enough to tell "nothing shared" from "shared but no Page token".
        const d = diagnostics;
        throw new ConnectorError(
          "no_pages",
          `no usable Pages (accounts=${d.accounts}, without_token=${pages.length}, business_management=${d.businessManagement}, businesses=${d.businesses}, business_pages=${d.businessPages})`,
        );
      }

      return usable.flatMap<ConnectedAccount>((page) => {
        // The long-lived user token rides along as the "refresh" slot: Instagram calls
        // fall back to it, and its expiry (60 days) drives the reconnect reminder.
        const tokens: OAuthTokens = {
          accessToken: page.access_token!,
          refreshToken: long.access_token,
          expiresAt: null,
          refreshExpiresAt: userExpiresAt,
          scopes: [...META_SCOPES],
        };
        const facebook: ConnectedAccount = {
          platform: "facebook",
          externalId: page.id,
          name: page.name ?? null,
          handle: page.username ?? null,
          avatarUrl: page.picture?.data?.url ?? null,
          tokens,
        };
        const ig = page.instagram_business_account;
        if (!ig) return [facebook];
        return [
          facebook,
          {
            platform: "instagram",
            externalId: ig.id,
            name: ig.username ?? null,
            handle: ig.username ?? null,
            avatarUrl: ig.profile_picture_url ?? null,
            parentExternalId: page.id,
            tokens,
          },
        ];
      });
    },

    async refresh() {
      // Meta has no refresh grant: Page tokens do not expire and the user token is
      // renewed by connecting again.
      throw new RefreshRejectedError("Meta tokens are renewed by reconnecting");
    },
  };
}
