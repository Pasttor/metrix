import type { AccountPlatform, ConnectPlatform, OAuthTokens } from "./types";

/** An account returned by a provider after consent, with its tokens. */
export type ConnectedAccount = {
  platform: AccountPlatform;
  externalId: string;
  name: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  /** External id of the parent account in the same result (Instagram -> its Facebook Page). */
  parentExternalId?: string | null;
  tokens: OAuthTokens;
};

export interface PlatformConnector {
  readonly platform: ConnectPlatform;
  buildAuthUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  handleCallback(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    searchParams: URLSearchParams;
  }): Promise<ConnectedAccount[]>;
  /** Throws RefreshRejectedError when the refresh token is no longer valid. */
  refresh(refreshToken: string): Promise<OAuthTokens>;
}

/** Error a connector raises with a code that is safe to show (never provider payloads). */
export class ConnectorError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "ConnectorError";
  }
}
