import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { cx } from "./components/ui";
import { PolicyEditor } from "./policy-editor/PolicyEditor";
import { ServerConsole } from "./server/ServerConsole";
import { useServerSession } from "./server/session";

type View = "policy" | "server";
type Theme = "system" | "light" | "dark";

const THEME_KEY = "geolibre-admin:theme";

function readView(): View {
  return window.location.hash.startsWith("#/server") ? "server" : "policy";
}

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function App() {
  const [view, setView] = useState<View>(readView);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const { session, restoring, signIn, connectWithToken, signOut } = useServerSession();

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not persisted; still applied for this page.
    }
  }, [theme]);

  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a href="#/" className="flex items-center gap-2 font-semibold">
            <img src="./favicon.svg" alt="" className="size-6" />
            GeoLibre Admin
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted">reference</span>
          </a>
          <nav aria-label="Main" className="flex gap-1">
            {(
              [
                ["policy", "#/", "Deployment policy"],
                ["server", "#/server", "Organizations and groups"],
              ] as const
            ).map(([id, href, label]) => (
              <a
                key={id}
                href={href}
                aria-current={view === id ? "page" : undefined}
                className={cx(
                  "rounded-md px-3 py-1.5 text-sm",
                  view === id ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {label}
              </a>
            ))}
          </nav>
          <button
            type="button"
            className="ms-auto rounded-md p-2 text-muted hover:bg-surface-2 hover:text-text"
            aria-label={`Theme: ${theme}. Switch to ${nextTheme[theme]}.`}
            title={`Theme: ${theme}`}
            onClick={() => setTheme(nextTheme[theme])}
          >
            <ThemeIcon className="size-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {view === "policy" ? (
          <PolicyEditor />
        ) : (
          <ServerConsole
            session={session}
            restoring={restoring}
            onSignIn={signIn}
            onToken={connectWithToken}
            onSignOut={() => void signOut()}
          />
        )}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted">
        A reference tool for{" "}
        <a className="underline" href="https://github.com/opengeos/GeoLibre">
          GeoLibre
        </a>
        , like the reference projects server: a correctness baseline, not a hardened product.{" "}
        <a className="underline" href="https://github.com/opengeos/geolibre-admin">
          Source
        </a>
      </footer>
    </div>
  );
}
