import { useState } from "react";
import { Button, Card, Field, Input, Notice, cx } from "../components/ui";
import { lastServerUrl } from "./session";

export function ConnectForm({
  onSignIn,
  onToken,
}: {
  onSignIn: (url: string, username: string, password: string) => Promise<void>;
  onToken: (url: string, token: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(lastServerUrl);
  const [method, setMethod] = useState<"password" | "token">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = url.trim() && (method === "password" ? username.trim() && password : token.trim());

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Organizations and groups</h1>
        <p className="text-sm text-muted">
          Manage the organizations, members, groups, and invitations on a server that implements the GeoLibre
          projects API, such as the reference server in <code>backend/geolibre_server_api</code>.
        </p>
      </div>
      <Card title="Connect to a projects server">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!ready) return;
            setBusy(true);
            setError(null);
            try {
              if (method === "password") await onSignIn(url, username.trim(), password);
              else await onToken(url, token);
              setPassword("");
              setToken("");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Server URL" hint="The same URL GeoLibre uses for GEOLIBRE_SHARE_URL.">
            {(id) => (
              <Input
                id={id}
                value={url}
                autoComplete="url"
                placeholder="https://projects.example.org"
                onChange={(event) => setUrl(event.target.value)}
              />
            )}
          </Field>
          <div role="tablist" aria-label="Sign-in method" className="flex gap-1 rounded-md bg-surface-2 p-1">
            {(["password", "token"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={method === option}
                onClick={() => setMethod(option)}
                className={cx(
                  "flex-1 rounded px-3 py-1.5 text-sm",
                  method === option ? "bg-surface font-medium shadow-sm" : "text-muted",
                )}
              >
                {option === "password" ? "Username and password" : "Personal API token"}
              </button>
            ))}
          </div>
          {method === "password" ? (
            <>
              <Field label="Username">
                {(id) => (
                  <Input id={id} value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
                )}
              </Field>
              <Field
                label="Password"
                hint="Exchanged for a one-day token with read and write scopes only. Signing out revokes it."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            </>
          ) : (
            <Field
              label="Token"
              hint="Needs read:projects, plus write:projects to make changes. Kept for this tab only and never revoked here."
            >
              {(id) => (
                <Input id={id} type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
              )}
            </Field>
          )}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div>
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </form>
      </Card>
      <p className="text-xs text-muted">
        This page talks to the server straight from your browser. The server must allow this page's origin in
        <code> GEOLIBRE_CORS_ORIGINS</code>, and should sit behind a rate-limiting proxy before you sign in over the
        internet.
      </p>
    </div>
  );
}
