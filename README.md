# GeoLibre Admin

A reference admin UI for self-hosted [GeoLibre](https://github.com/opengeos/GeoLibre)
deployments. Like GeoLibre's reference projects server, it is a correctness
baseline built against GeoLibre's published contracts, not a hardened product.
Background: [opengeos/GeoLibre#2775](https://github.com/opengeos/GeoLibre/discussions/2775).

It has two parts:

- **Deployment policy.** An offline editor for what a deployment offers:
  capabilities, the interface profile (experience level, lock, hidden menus,
  data sources and plugins), the organization service library, sharing and
  embedding, GeoLens, branding, and the container's server settings. It
  validates with the same rules GeoLibre's container applies at startup and
  exports the files current GeoLibre releases read: `admin-profile.json`, a
  services file, a `.env` file, `docker run` commands and `compose.yaml`. It
  also exports the whole policy as one `deployment.json` (draft schema, below).
- **Organizations and groups.** A console for any server implementing the
  [GeoLibre projects API](https://github.com/opengeos/GeoLibre/blob/main/docs/server-api.md),
  such as the reference server in `backend/geolibre_server_api`: create and
  configure organizations and groups, manage members and roles, issue and
  revoke invitations, approve join requests, accept invitations, transfer group
  ownership, and remove projects from a group.

## Use it

The latest build is published at <https://opengeos.org/geolibre-admin>.
The policy editor never sends anything anywhere: drafts stay in the browser's
localStorage and exports are downloads.

Or run it yourself:

```bash
docker build -t geolibre-admin .
docker run --rm -p 8080:80 geolibre-admin
```

The image serves the static build from nginx with a strict
Content-Security-Policy. Its `connect-src` allows any HTTPS origin plus
loopback; narrow it to your projects server in `docker/nginx.conf` for
production.

### Connecting to a projects server

- The server must allow this app's origin in `GEOLIBRE_CORS_ORIGINS` (the
  reference server allows `*` by default for API routes).
- Signing in with a username and password exchanges them for a personal token
  with only `read:projects` and `write:projects`, expiring after one day. The
  token is kept in `sessionStorage` for the tab and revoked on sign-out. A
  pasted token is used as is and never revoked here.
- The projects API has no server-wide administrator, so the console shows the
  organizations and groups your account belongs to, and what you can do follows
  your role in each.
- Put the server behind a rate-limiting proxy before signing in over the
  internet, as `docs/server-api.md` describes.

## What deploys how

| Setting | GeoLibre reads it from | When |
| --- | --- | --- |
| Interface profile | `admin-profile.json` at the app root | Page load |
| Service library | `GEOLIBRE_SERVICES_FILE`, `GEOLIBRE_BUILTIN_SERVICES` | Container start |
| Share, collaboration, embed origins, GeoLens, app name | `GEOLIBRE_*` env | Container start |
| Sidecar, conversion roots, PostGIS hosts | `GEOLIBRE_*` env | Container start |
| Capabilities, welcome wizard | `VITE_GEOLIBRE_CAPABILITIES`, `VITE_WELCOME_DISABLED` | **Build time** |

Capabilities still require building your own image
([GeoLibre#1673](https://github.com/opengeos/GeoLibre/issues/1673)); the export
says so and includes the `docker build` command when the policy needs it.
Capabilities and hidden items are client-side affordances, not a security
boundary: protect `/sidecar` and `/ai` on the server.

## `deployment.json`

[`schema/deployment.schema.json`](schema/deployment.schema.json) is a draft
JSON Schema for a single, versioned policy document, proposed in #2775 to
replace GeoLibre's scattered static settings. GeoLibre doesn't read it yet; the
editor imports and exports it so a policy can be kept in version control and
regenerated. Every value in it is published to visitors, so it never holds
secrets or infrastructure settings; those are exported as environment variables
only.

## Development

Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run typecheck
npm run build        # dist/
```

Contract tests run the API client against a live, disposable projects server:

```bash
pip install "geolibre-server-api @ git+https://github.com/opengeos/GeoLibre.git#subdirectory=backend/geolibre_server_api"
GEOLIBRE_PUBLIC_URL=http://127.0.0.1:8000 geolibre-server-api &
GEOLIBRE_TEST_SERVER_URL=http://127.0.0.1:8000 npx vitest run tests/server.integration.test.ts
```

Generated files:

- `src/catalog/geolibre-catalog.json` lists the ids GeoLibre lets a profile
  hide and their complexity tiers. They live in GeoLibre's source, so regenerate
  from a checkout with `npm run sync:catalog -- ../GeoLibre`. A weekly workflow
  fails when it falls behind GeoLibre `main`.
- `schema/deployment.schema.json` and `src/policy/schema-validator.generated.js`
  come from `src/policy/schema.ts` via `npm run sync:schema`. The validator is
  precompiled so the app needs no `eval` under a strict CSP; CI fails when
  either is stale.

## License

MIT
