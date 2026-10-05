# GeoLibre Admin

A reference admin UI for self-hosted [GeoLibre](https://github.com/opengeos/GeoLibre)
deployments. Like GeoLibre's reference projects server, it is a correctness
baseline built against GeoLibre's published contracts, not a hardened product.
Background: [opengeos/GeoLibre#2775](https://github.com/opengeos/GeoLibre/discussions/2775), whose `deployment.json` schema is now merged (#2785).

It has two parts:

- **Deployment policy.** An offline editor for what a deployment offers:
  capabilities, the interface profile (experience level, lock, hidden menus,
  data sources and plugins), the plugin registry and allow/block lists, the
  organization service library, sharing and embedding, GeoLens, the AI
  assistant, branding, and the container's server settings. It
  validates against GeoLibre's published schema with local cross-field checks
  and exports for one of two targets: *Legacy GeoLibre (<= v3.2.0)* gives
  files read by tagged releases and lists settings they cannot express;
  *GeoLibre with runtime deployment.json* gives policy and operator-only
  environment files; its generated `docker-run.sh` and `compose.yaml` mount the
  input read-only at `/etc/geolibre/deployment.json` and set
  `GEOLIBRE_DEPLOYMENT_FILE`.
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
docker run --rm -p 8080:80 ghcr.io/opengeos/geolibre-admin
```

Or run it with a local GeoLibre reference projects server:

```bash
docker compose up -d            # pull the admin image, build the server
docker compose up -d --build    # build the admin image from this checkout
```

Open <http://localhost:8080/#/server> and connect to `http://localhost:8000`.
The console has no sign-up, so create the first account on the server:

```bash
curl -X POST http://localhost:8000/api/accounts -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"correct horse battery staple"}'
```

The server port is bound to `127.0.0.1` and has no rate limiting, so this is a
local stack, not a production deployment. Override ports with
`GEOLIBRE_ADMIN_PORT` and `GEOLIBRE_SERVER_PORT`.

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

The legacy target supports tagged GeoLibre releases through v3.2.0. Capabilities
and welcome settings are build arguments (`VITE_GEOLIBRE_CAPABILITIES` and
`VITE_WELCOME_DISABLED`); settings not supported by that target are listed
instead of silently represented. See the
[latest tagged release](https://github.com/opengeos/GeoLibre/releases/latest),
checked 2026-10-04.

The runtime target requires a GeoLibre build containing merged policy delivery and enforcement. A main-line image is published as [`ghcr.io/opengeos/geolibre:sha-ffa8a2e`](https://github.com/opengeos/GeoLibre/pkgs/container/geolibre), from [source commit ffa8a2e](https://github.com/opengeos/GeoLibre/commit/ffa8a2e5ee1f5af2b4404072d5b74d0b6bf2c33a), checked 2026-10-04; the latest tagged release remains v3.2.0. This UI has not smoke-tested that image. Runtime builds validate policy during startup, abort on invalid or unreadable input, and enforce capabilities on protected sidecar routes. Client-side visibility controls alone are not a security boundary.

Mount an input policy separately from generated public output:

```yaml
volumes:
  - ./deployment.json:/etc/geolibre/deployment.json:ro
environment:
  GEOLIBRE_DEPLOYMENT_FILE: /etc/geolibre/deployment.json
```

The generated `docker-run.sh` and `compose.yaml` use this input contract: they
mount `./deployment.json` read-only at `/etc/geolibre/deployment.json` and set
`GEOLIBRE_DEPLOYMENT_FILE` to that path.

At each container boot, the input is validated; invalid or unreadable input
aborts startup. Nonblank `GEOLIBRE_*` environment values override matching
input fields before the container atomically generates public
`/usr/share/nginx/html/deployment.json`. Never put secrets in that public
policy. Client precedence is different: `deployment.json` >
`window.__GEOLIBRE_DEPLOYMENT_ENV__` > build-time settings. Missing, invalid,
blocked, or later-than-3-second client policy fetches fall through to the next
source/defaults; this is not invariably a full grant.

Container route enforcement applies only to these bundled sidecar routes:

| Route family | Required grant |
| --- | --- |
| `/sidecar/whitebox`, `/sidecar/raster`, `/sidecar/vector`, `/sidecar/pointcloud`, `/sidecar/ml`, `/sidecar/sql` | `processing:run` |
| `/sidecar/postgis` | `data:add` |
| `/sidecar/conversion` | `processing:run` **or** `data:add` |

Denied requests return JSON HTTP 403. Without either `data:add` or
`processing:run`, the bundled sidecar is not started; `/health`, `/algorithms`,
`/run`, and `/shutdown` are not capability-guarded while it runs. This is
container-only: browser WASM, desktop processing, and separately exposed
services are unaffected. Client policy and plugin checks can be bypassed; keep
authentication and conversion roots restricted.

The final `ai.enabled` value absent or false disables the server `/ai` proxy;
true requires `GEOLIBRE_AI_URL=/ai`, `GEOLIBRE_AI_PROXY_URL`, and
`GEOLIBRE_AI_PROXY_TOKEN`. `GEOLIBRE_AI_URL=/ai` overrides a mounted false
value; upstream URL/token alone do not enable the route. Server `/ai` is not
guarded by `processing:run`. Proxy credentials stay in the private server
environment.

Plugin restrictions apply to external plugins: blocked IDs override allowed
IDs; omitted `allowed` uses the permissive default, while `[]` permits none.
Built-in plugins are outside external load restrictions. Bundled
`public/plugins/` drop-ins bypass `allowed` and sideload restrictions but still
honor blocked IDs. With sideload disabled, URL/zip/directory/project-manifest
install and trust are disabled; previously installed URLs need a current
permitted registry entry and fail closed if the registry is unavailable.
Existing installed URLs remain removable. `defaultActive` seeds permitted
plugins in fresh projects only; it does not change saved activation or permit
denied IDs.

Desktop reads its policy from its app config directory and requires restart;
see [GeoLibre deployment policy docs](https://github.com/opengeos/GeoLibre/blob/main/docs/deployment-policy.md)
for OS-specific paths. The config is user-writable and is not a security
boundary. The editor stores its selected export target in browser-local draft
storage; importing a policy preserves that target, while **Start over** resets
the target to legacy.

## `deployment.json`

[`schema/deployment.schema.json`](schema/deployment.schema.json) is a synced
copy of GeoLibre's canonical schema for a single, versioned policy document.
`schema/SOURCE.json` records the upstream commit the schema came from. See the
[deployment policy docs](https://github.com/opengeos/GeoLibre/blob/main/docs/deployment-policy.md)
and [capability docs](https://github.com/opengeos/GeoLibre/blob/main/docs/deployment-capabilities.md).

## Development

Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run typecheck
npm run build        # dist/
```

Contract tests run the API client against a live, disposable projects server.
With Docker, use the compose server:

```bash
docker compose -p geolibre-admin-test up -d --wait geolibre-server
GEOLIBRE_TEST_SERVER_URL=http://127.0.0.1:8000 npx vitest run tests/server.integration.test.ts
docker compose -p geolibre-admin-test down -v
```

The separate project name keeps the tests' accounts out of your regular stack's
volume. Stop the regular stack first, since both use port 8000.

Or install it with pip:

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
- `schema/deployment.schema.json` is GeoLibre's own schema, copied (never edited
  by hand) with `npm run sync:schema -- ../GeoLibre`, which also records the
  GeoLibre commit in `schema/SOURCE.json` and regenerates
  `src/policy/schema-validator.generated.js`. Run `npm run sync:schema` with no
  argument to regenerate only the validator. The validator is precompiled so the
  app needs no `eval` under a strict CSP; CI fails when it is stale, and the
  weekly "GeoLibre contract drift" workflow fails when the schema or catalog
  falls behind GeoLibre `main`.

## License

MIT
