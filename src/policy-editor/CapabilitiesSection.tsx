import { Card, Checkbox, Notice } from "../components/ui";
import { CAPABILITIES, type Capability, type DeploymentPolicy } from "../policy/types";

const DESCRIPTIONS: Record<Capability, string> = {
  "project:edit": "New, Open, Save, Import, Project History, Collaborate, StoryMap, Undo/Redo.",
  "data:add": "The Add Data menu, drag-and-drop, and the embed API's addLayer/addData.",
  "processing:run": "Processing tools including Model Builder, Whitebox, SQL, Python, AI assistant, geocoding and conversion.",
  "export:data": "Share, Export HTML, Print, Print Layout, Offline Basemap, embed exportImage.",
  "plugins:install": "Plugin activation/deactivation, plugin-registered menus, and the marketplace.",
  "settings:manage": "The Settings dialog and the Style Manager.",
};

export function CapabilitiesSection({
  policy,
  setPolicy,
}: {
  policy: DeploymentPolicy;
  setPolicy: (update: (policy: DeploymentPolicy) => DeploymentPolicy) => void;
}) {
  const restricted = policy.capabilities !== undefined;
  const granted = new Set(policy.capabilities ?? CAPABILITIES);

  const toggle = (capability: Capability, on: boolean) =>
    setPolicy((current) => {
      const next = new Set(current.capabilities ?? CAPABILITIES);
      if (on) next.add(capability);
      else next.delete(capability);
      return { ...current, capabilities: CAPABILITIES.filter((item) => next.has(item)) };
    });

  return (
    <Card
      title="Capabilities"
      description="Pin what the deployment is allowed to do: a read-only kiosk, a classroom, or the full app."
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Capability mode</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="capability-mode"
              checked={!restricted}
              onChange={() => setPolicy(({ capabilities: _omit, ...rest }) => rest)}
            />
            No policy override (use environment or GeoLibre defaults)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="capability-mode"
              checked={restricted}
              onChange={() => setPolicy((current) => ({ ...current, capabilities: [...CAPABILITIES] }))}
            />
            Grant only the capabilities checked below
          </label>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <Checkbox
              key={capability}
              disabled={!restricted}
              checked={granted.has(capability)}
              onChange={(on) => toggle(capability, on)}
              label={<code className="font-mono text-xs">{capability}</code>}
              description={DESCRIPTIONS[capability]}
            />
          ))}
        </div>
        <Notice tone="warning">
          In runtime-capable containers, <code>/sidecar/whitebox</code>, <code>/sidecar/raster</code>,{" "}
          <code>/sidecar/vector</code>, <code>/sidecar/pointcloud</code>, <code>/sidecar/ml</code>, and{" "}
          <code>/sidecar/sql</code> require <code>processing:run</code>; <code>/sidecar/postgis</code> requires{" "}
          <code>data:add</code>; <code>/sidecar/conversion</code> requires either. Without either
          grant the bundled sidecar is not started. Utility routes are outside these guards while it runs.
          These container route checks do not cover browser WASM, desktop processing, or separately exposed
          services; retain authentication and restrict conversion roots. Client policy can be unavailable or
          bypassed; do not treat it as a security boundary.
        </Notice>
      </div>
    </Card>
  );
}
