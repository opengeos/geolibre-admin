import { useCallback, useEffect, useState } from "react";
import { GeoLibreServer, type Me } from "../api/client";

const SESSION_KEY = "geolibre-admin:session";
const LAST_URL_KEY = "geolibre-admin:last-server";

interface Stored {
  baseUrl: string;
  token: string;
  /** True when the token was minted here, so sign-out may revoke it. */
  minted: boolean;
}

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null): void {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: the session lasts until the page reloads.
  }
}

/** The server URL used last time, to prefill the connect form. */
export function lastServerUrl(): string {
  try {
    return localStorage.getItem(LAST_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export interface Session {
  server: GeoLibreServer;
  me: Me;
  minted: boolean;
}

/**
 * The signed-in projects-server session. The token is kept in
 * sessionStorage, so it ends with the tab; a token minted by signing in here
 * is revoked on sign-out and expires within a day regardless.
 *
 * @returns The session state and actions.
 */
export function useServerSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => readStored() !== null);

  const establish = useCallback(async (server: GeoLibreServer, minted: boolean) => {
    const me = await server.me();
    writeStored({ baseUrl: server.baseUrl, token: server.credential!, minted });
    try {
      localStorage.setItem(LAST_URL_KEY, server.baseUrl);
    } catch {
      // Ignore: only a convenience.
    }
    setSession({ server, me, minted });
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    establish(new GeoLibreServer(stored.baseUrl, stored.token), stored.minted)
      .catch(() => writeStored(null))
      .finally(() => setRestoring(false));
  }, [establish]);

  const signIn = useCallback(
    async (baseUrl: string, username: string, password: string) => {
      const server = new GeoLibreServer(baseUrl);
      await server.signIn(username, password);
      try {
        await establish(server, true);
      } catch (error) {
        await server.signOut().catch(() => undefined);
        throw error;
      }
    },
    [establish],
  );

  const connectWithToken = useCallback(
    (baseUrl: string, token: string) => establish(new GeoLibreServer(baseUrl, token.trim()), false),
    [establish],
  );

  const signOut = useCallback(async () => {
    const current = session;
    writeStored(null);
    setSession(null);
    // Only revoke a token this app minted; a pasted token belongs to the user.
    if (current?.minted) await current.server.signOut().catch(() => undefined);
  }, [session]);

  return { session, restoring, signIn, connectWithToken, signOut };
}
