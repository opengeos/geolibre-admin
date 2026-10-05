import { catalog } from "../catalog/catalog";
import { Badge, Card, Checkbox, Field, Input, Notice, TagInput, cx } from "../components/ui";
import type { DeploymentPolicy, PluginsPolicy } from "../policy/types";
import type { Issue } from "../policy/validate";
import { issueAt, type SetPolicy } from "./SharingSection";

const TIER_TONE = { basic: "ok", intermediate: "accent", advanced: "warning" } as const;
const BUILT_IN = new Set(catalog.plugins.map((plugin) => plugin.id));

const ALLOWED_OPTIONS = [
  { value: "any", label: "Any", text: "Any external plugin may load unless explicitly blocked." },
  { value: "only", label: "Only these", text: "Only listed external plugins may load; blocked IDs take precedence." },
] as const;

export function PluginsSection({
  policy,
  setPolicy,
  issues,
}: {
  policy: DeploymentPolicy;
  setPolicy: SetPolicy;
  issues: Issue[];
}) {
  const plugins = policy.plugins;
  const allowMode = plugins?.allowed ? "only" : "any";
  const active = plugins?.defaultActive ?? [];
  const externalActive = active.filter((id) => !BUILT_IN.has(id));

  const setPlugins = (patch: Partial<PluginsPolicy>) =>
    setPolicy((current) => ({ ...current, plugins: { ...current.plugins, ...patch } }));
  const setActive = (builtIn: string[], external: string[]) => {
    const ids = [...catalog.plugins.map((p) => p.id).filter((id) => builtIn.includes(id)), ...external];
    setPlugins({ defaultActive: ids.length ? ids : undefined });
  };

  return (
    <Card
      title="Plugins"
      description="External plugin marketplace and which plugins may load (deployment.json plugins)."
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Registry URL"
          hint="Empty keeps the runtime or image default registry. Absolute, or relative to the app."
          error={issueAt(issues, "/plugins/registryUrl")}
        >
          {(id) => (
            <Input
              id={id}
              value={plugins?.registryUrl ?? ""}
              placeholder="https://plugins.example.com/registry.json"
              onChange={(event) => setPlugins({ registryUrl: event.target.value || undefined })}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">External plugins that may load</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALLOWED_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cx(
                  "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2",
                  allowMode === option.value ? "border-accent bg-accent-soft" : "border-border",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="plugins-allowed"
                    checked={allowMode === option.value}
                    onChange={() =>
                      setPolicy((current) => ({
                        ...current,
                        plugins: {
                          ...current.plugins,
                          allowed: option.value === "only" ? (current.plugins?.allowed ?? []) : undefined,
                        },
                      }))
                    }
                  />
                  {option.label}
                </span>
                <span className="text-xs text-muted">{option.text}</span>
              </label>
            ))}
          </div>
          {allowMode === "only" ? (
            <TagInput
              values={plugins?.allowed ?? []}
              placeholder="plugin-id"
              onChange={(values) => setPlugins({ allowed: values })}
            />
          ) : null}
          {allowMode === "only" && issueAt(issues, "/plugins/allowed") ? (
            <p className="text-xs text-danger">{issueAt(issues, "/plugins/allowed")}</p>
          ) : null}
        </fieldset>

        <Field
          label="Blocked plugins"
          hint="Blocked IDs take precedence over allowed IDs. Built-in plugins are outside external load restrictions; bundled public/plugins drop-ins bypass allowed/sideload rules but still honor blocked IDs."
          error={issueAt(issues, "/plugins/blocked")}
        >
          {(id) => (
            <TagInput
              id={id}
              values={plugins?.blocked ?? []}
              placeholder="plugin-id"
              onChange={(values) => setPlugins({ blocked: values.length ? values : undefined })}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Active in a new project</legend>
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.plugins.map((plugin) => (
              <Checkbox
                key={plugin.id}
                checked={active.includes(plugin.id)}
                onChange={(on) =>
                  setActive(
                    on
                      ? [...active.filter((id) => BUILT_IN.has(id)), plugin.id]
                      : active.filter((id) => BUILT_IN.has(id) && id !== plugin.id),
                    externalActive,
                  )
                }
                label={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {plugin.label}
                    <Badge tone={TIER_TONE[plugin.tier]}>{plugin.tier}</Badge>
                  </span>
                }
                description={<code className="font-mono">{plugin.id}</code>}
              />
            ))}
          </div>
          <Field label="External plugin ids" error={issueAt(issues, "/plugins/defaultActive")}>
            {(id) => (
              <TagInput
                id={id}
                values={externalActive}
                placeholder="plugin-id"
                onChange={(values) => setActive(active.filter((i) => BUILT_IN.has(i)), values)}
              />
            )}
          </Field>
        </fieldset>

        <Checkbox
          checked={plugins?.sideload !== false}
          onChange={(on) => setPlugins({ sideload: on ? undefined : false })}
          label="Allow sideloading"
          description="Off disables URL, zip, directory and project-manifest installs/trust. Existing archives and extra directories cannot load; saved URLs remain removable."
        />

        <Notice tone="accent">
          Blocked IDs override allowed IDs. An omitted <code>allowed</code> field permits external plugins by
          default; an explicit empty list permits none. Built-in plugins are not gated by these external-plugin
          rules. Bundled <code>public/plugins/</code> drop-ins bypass allowed and sideload restrictions but still
          honor blocked IDs. With sideloading off, new URL/zip/directory/project-manifest installs are disabled;
          previously installed URLs require a current permitted registry entry, and an unavailable registry fails
          closed for those URLs. Existing installed URLs remain removable. <code>defaultActive</code> seeds permitted
          loaded plugins in fresh projects only; it does not change saved project activation or authorize denied IDs.
          Client checks on main can be bypassed by a modified client; they are not signing, sandboxing, or server
          authorization.
        </Notice>
      </div>
    </Card>
  );
}
