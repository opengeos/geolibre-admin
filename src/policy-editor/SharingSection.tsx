import { Card, Checkbox, Field, Input, Notice, Select, TagInput } from "../components/ui";
import type { DeploymentPolicy, OperatorSettings } from "../policy/types";
import type { Issue } from "../policy/validate";

export type SetPolicy = (update: (policy: DeploymentPolicy) => DeploymentPolicy) => void;

export function issueAt(issues: Issue[], path: string): string | undefined {
  return issues.find((issue) => issue.severity === "error" && issue.path.startsWith(path))?.message;
}

export function SharingSection({
  policy,
  setPolicy,
  issues,
}: {
  policy: DeploymentPolicy;
  setPolicy: SetPolicy;
  issues: Issue[];
}) {
  const share = policy.sharing?.shareUrl ?? "";
  const shareMode = share === "" ? "default" : share === "off" ? "off" : "custom";
  const geolens = policy.geolens?.url ?? "";
  const geolensMode =
    geolens === "" ? "default" : geolens === "off" || geolens === "same-origin" ? geolens : "custom";

  const setSharing = (patch: Partial<NonNullable<DeploymentPolicy["sharing"]>>) =>
    setPolicy((current) => ({ ...current, sharing: { ...current.sharing, ...patch } }));

  return (
    <Card title="Sharing and integrations" description="Where projects are published, live collaboration, embedding, and GeoLens.">
      <div className="flex flex-col gap-5">
        <Field
          label="Projects server"
          hint={
            shareMode === "default"
              ? "The image default publishes to share.geolibre.app."
              : shareMode === "off"
                ? "Removes the Share and Project Gallery client affordances; server-side publishing access is unchanged."
                : "Your own server implementing the GeoLibre projects API."
          }
        >
          {(id) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                id={id}
                className="sm:w-56"
                value={shareMode}
                onChange={(event) => {
                  const mode = event.target.value;
                  setSharing({ shareUrl: mode === "off" ? "off" : mode === "custom" ? "https://" : undefined });
                }}
              >
                <option value="default">Image default</option>
                <option value="off">Off</option>
                <option value="custom">Self-hosted server</option>
              </Select>
              {shareMode === "custom" ? (
                <Input
                  aria-label="Projects server URL"
                  value={share}
                  placeholder="https://projects.example.org"
                  onChange={(event) => setSharing({ shareUrl: event.target.value })}
                />
              ) : null}
            </div>
          )}
        </Field>
        {shareMode === "custom" && issueAt(issues, "/sharing/shareUrl") ? (
          <p className="-mt-3 text-xs text-danger">{issueAt(issues, "/sharing/shareUrl")}</p>
        ) : null}

        <Field
          label="Live collaboration relay"
          hint="A wss:// relay you run. Empty leaves collaboration off."
          error={issueAt(issues, "/sharing/collabUrl")}
        >
          {(id) => (
            <Input
              id={id}
              value={policy.sharing?.collabUrl ?? ""}
              placeholder="wss://collab.example.org"
              onChange={(event) => setSharing({ collabUrl: event.target.value || undefined })}
            />
          )}
        </Field>

        <Field
          label="Embed origins"
          hint="Pages allowed to drive a framed GeoLibre over the embed API. Empty keeps the API off."
          error={issueAt(issues, "/sharing/embedOrigins")}
        >
          {(id) => (
            <TagInput
              id={id}
              values={policy.sharing?.embedOrigins ?? []}
              placeholder="https://portal.example.com"
              onChange={(values) => setSharing({ embedOrigins: values.length ? values : undefined })}
            />
          )}
        </Field>

        <Field label="GeoLens catalog" error={geolensMode === "custom" ? issueAt(issues, "/geolens/url") : undefined}>
          {(id) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                id={id}
                className="sm:w-56"
                value={geolensMode}
                onChange={(event) => {
                  const mode = event.target.value;
                  setPolicy((current) => ({
                    ...current,
                    geolens: { url: mode === "default" ? undefined : mode === "custom" ? "https://" : mode },
                  }));
                }}
              >
                <option value="default">Image default</option>
                <option value="same-origin">Same origin</option>
                <option value="off">Off</option>
                <option value="custom">Server URL</option>
              </Select>
              {geolensMode === "custom" ? (
                <Input
                  aria-label="GeoLens server URL"
                  value={geolens}
                  placeholder="https://geolens.example.org"
                  onChange={(event) => setPolicy((current) => ({ ...current, geolens: { url: event.target.value } }))}
                />
              ) : null}
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}

export function BrandingSection({ policy, setPolicy }: { policy: DeploymentPolicy; setPolicy: SetPolicy }) {
  const setBranding = (patch: Partial<NonNullable<DeploymentPolicy["branding"]>>) =>
    setPolicy((current) => ({ ...current, branding: { ...current.branding, ...patch } }));
  return (
    <Card title="Branding" description="How the app introduces itself.">
      <div className="flex flex-col gap-4">
        <Field label="App name" hint="Replaces “GeoLibre” in the toolbar and browser tab. Up to 60 characters.">
          {(id) => (
            <Input
              id={id}
              maxLength={60}
              value={policy.branding?.appName ?? ""}
              placeholder="GeoLibre"
              onChange={(event) => setBranding({ appName: event.target.value || undefined })}
            />
          )}
        </Field>
        <Checkbox
          checked={policy.branding?.welcome !== false}
          onChange={(on) => setBranding({ welcome: on ? undefined : false })}
          label="Show the first-launch welcome wizard"
          description="Legacy builds use VITE_WELCOME_DISABLED at build time; runtime-capable builds use branding.welcome:false. An interface profile also skips the wizard."
        />
      </div>
    </Card>
  );
}

export function OperatorSection({
  operator,
  setOperator,
}: {
  operator: OperatorSettings;
  setOperator: (update: Partial<OperatorSettings>) => void;
}) {
  return (
    <Card
      title="Server settings"
      description="Container settings that never go into deployment.json: exported as environment variables only."
    >
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={operator.sidecar}
          onChange={(sidecar) => setOperator({ sidecar })}
          label="Run the processing sidecar"
          description="Backs Whitebox, conversion, and raster tools. In runtime-capable containers, GEOLIBRE_DISABLE_SIDECAR=1 skips uvicorn and bundled /sidecar/ requests receive JSON HTTP 403; other nginx routes remain served."
        />
        {operator.sidecar ? (
          <>
            <Field label="Conversion roots" hint="Directories the sidecar may read and write. Empty keeps the image default (/data).">
              {(id) => (
                <Input
                  id={id}
                  value={operator.conversionRoots}
                  placeholder="/data"
                  onChange={(event) => setOperator({ conversionRoots: event.target.value })}
                />
              )}
            </Field>
            <Field label="Allowed PostGIS hosts" hint="Databases the sidecar may connect to. Empty refuses every destination.">
              {(id) => (
                <Input
                  id={id}
                  value={operator.postgisHosts}
                  placeholder="db.internal:5432"
                  onChange={(event) => setOperator({ postgisHosts: event.target.value })}
                />
              )}
            </Field>
          </>
        ) : null}
        <Notice>
          Sign-in (Clerk, Auth0, Basic Auth), AI proxy tokens, and TLS stay in your deployment's secret store.
          This tool never asks for them.
        </Notice>
      </div>
    </Card>
  );
}
