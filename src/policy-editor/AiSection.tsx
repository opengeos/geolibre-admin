import { Card, Checkbox, Field, Input, Notice } from "../components/ui";
import type { AiPolicy, DeploymentPolicy } from "../policy/types";
import type { Issue } from "../policy/validate";
import { issueAt, type SetPolicy } from "./SharingSection";

export function AiSection({
  policy,
  setPolicy,
  issues,
}: {
  policy: DeploymentPolicy;
  setPolicy: SetPolicy;
  issues: Issue[];
}) {
  const setAi = (patch: Partial<AiPolicy>) =>
    setPolicy((current) => ({ ...current, ai: { ...current.ai, ...patch } }));

  return (
    <Card
      title="AI assistant"
      description="Whether the app offers the assistant and which model it uses (deployment.json ai)."
    >
      <div className="flex flex-col gap-5">
        <Checkbox
          checked={policy.ai?.enabled === true}
          onChange={(on) => setAi({ enabled: on ? true : undefined })}
          label="Enable the AI assistant"
          description="ai.enabled configures the deployment proxy. Server proxy requires GEOLIBRE_AI_URL=/ai, GEOLIBRE_AI_PROXY_URL, and GEOLIBRE_AI_PROXY_TOKEN."
        />
        <Field
          label="Model"
          hint="Empty uses the configured runtime, build-time, or GeoLibre default model."
          error={issueAt(issues, "/ai/model")}
        >
          {(id) => (
            <Input
              id={id}
              value={policy.ai?.model ?? ""}
              placeholder="Configured model"
              onChange={(event) => setAi({ model: event.target.value || undefined })}
            />
          )}
        </Field>
        <Notice tone="warning">
          Final <code>ai.enabled</code> false disables the server proxy; true requires all three server variables
          above. <code>GEOLIBRE_AI_URL=/ai</code> overrides a mounted false value to enable it; upstream URL/token
          alone do not enable the route. <code>processing:run</code> governs client assistant affordances, not the
          server <code>/ai</code> decision. Explicit client false removes an operator-configured proxy, while
          omission uses the next source; it does not remove a provider entered in Settings. Secrets stay server-only.
        </Notice>
      </div>
    </Card>
  );
}
