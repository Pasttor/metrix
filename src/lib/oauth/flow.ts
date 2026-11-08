import { NextResponse } from "next/server";
import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "./connector";
import { consumeOAuthState, createOAuthState, OAuthStateError, type OAuthStateStore } from "./state";
import { isConnectPlatform, type ConnectPlatform } from "./types";

/**
 * Generic OAuth start/callback, delegating provider specifics to a connector.
 * Responses are redirects to the connections page with a short status code;
 * tokens, codes and provider payloads never reach the response or the logs.
 */

export type ConnectDeps = {
  appUrl: string;
  isAuthorized: () => Promise<boolean>;
  getConnector: (platform: ConnectPlatform) => PlatformConnector | null;
  stateStore: OAuthStateStore;
  saveConnection: (accounts: ConnectedAccount[]) => Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
};

export const CONNECTIONS_PATH = "/settings/connections";

export function callbackUrl(appUrl: string, platform: ConnectPlatform): string {
  return new URL(`/api/connect/${platform}/callback`, appUrl).toString();
}

function toConnections(appUrl: string, params: Record<string, string>) {
  const url = new URL(CONNECTIONS_PATH, appUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function unknownPlatform() {
  return NextResponse.json({ error: "unknown_platform" }, { status: 404 });
}

export async function startConnect(platformParam: string, deps: ConnectDeps): Promise<Response> {
  if (!(await deps.isAuthorized())) {
    return NextResponse.redirect(new URL("/login", deps.appUrl));
  }
  if (!isConnectPlatform(platformParam)) return unknownPlatform();
  const platform = platformParam;

  const connector = deps.getConnector(platform);
  if (!connector) return toConnections(deps.appUrl, { error: "not_configured", platform });

  const { state, codeChallenge } = await createOAuthState(deps.stateStore, platform, deps.now?.());
  const authUrl = connector.buildAuthUrl({
    state,
    codeChallenge,
    redirectUri: callbackUrl(deps.appUrl, platform),
  });
  return NextResponse.redirect(authUrl);
}

export async function finishConnect(
  platformParam: string,
  searchParams: URLSearchParams,
  deps: ConnectDeps,
): Promise<Response> {
  const log = deps.log ?? ((message: string) => console.warn(message));

  if (!(await deps.isAuthorized())) {
    return NextResponse.redirect(new URL("/login", deps.appUrl));
  }
  if (!isConnectPlatform(platformParam)) return unknownPlatform();
  const platform = platformParam;

  const connector = deps.getConnector(platform);
  if (!connector) return toConnections(deps.appUrl, { error: "not_configured", platform });

  // The user cancelled or the provider refused consent.
  if (searchParams.get("error")) {
    await deps.stateStore.take(searchParams.get("state") ?? "").catch(() => null);
    return toConnections(deps.appUrl, { error: "denied", platform });
  }

  let codeVerifier: string;
  try {
    codeVerifier = await consumeOAuthState(deps.stateStore, searchParams.get("state"), platform, deps.now?.());
  } catch (error) {
    if (error instanceof OAuthStateError) {
      log(`[connect:${platform}] ${error.code}`);
      return toConnections(deps.appUrl, { error: "state", platform });
    }
    throw error;
  }

  const code = searchParams.get("code");
  if (!code) return toConnections(deps.appUrl, { error: "missing_code", platform });

  try {
    const accounts = await connector.handleCallback({
      code,
      codeVerifier,
      redirectUri: callbackUrl(deps.appUrl, platform),
      searchParams,
    });
    if (accounts.length === 0) return toConnections(deps.appUrl, { error: "no_accounts", platform });
    await deps.saveConnection(accounts);
  } catch (error) {
    // Log only a safe code: provider errors can echo codes or tokens.
    // ConnectorError messages are written by our connectors (status, codes, counts) and never
    // carry tokens or provider payloads; any other error logs only its name.
    const reason =
      error instanceof ConnectorError
        ? error.message === error.code
          ? error.code
          : `${error.code} (${error.message})`
        : error instanceof Error
          ? error.name
          : "unknown";
    log(`[connect:${platform}] callback failed: ${reason}`);
    return toConnections(deps.appUrl, {
      error: error instanceof ConnectorError ? error.code : "callback_failed",
      platform,
    });
  }

  return toConnections(deps.appUrl, { connected: platform });
}
