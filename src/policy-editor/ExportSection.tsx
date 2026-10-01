import { useState } from "react";
import { Button, Card, CopyButton, Notice, cx, downloadText } from "../components/ui";
import { buildArgs, exportFiles } from "../policy/export";
import type { DeploymentPolicy, OperatorSettings } from "../policy/types";
import type { Issue } from "../policy/validate";

export function ExportSection({
  policy,
  operator,
  issues,
}: {
  policy: DeploymentPolicy;
  operator: OperatorSettings;
  issues: Issue[];
}) {
  const files = exportFiles(policy, operator);
  const [selected, setSelected] = useState("deployment.json");
  const file = files.find((item) => item.name === selected) ?? files[0];
  const errors = issues.filter((issue) => issue.severity === "error");
  const needsBuild = buildArgs(policy).length > 0;

  return (
    <Card
      title="Review and export"
      description="Download the files for your deployment. Nothing leaves this browser."
      actions={
        <Button
          variant="primary"
          disabled={errors.length > 0}
          onClick={() => files.forEach((item) => downloadText(item.name, item.content))}
        >
          Download all
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {errors.length ? (
          <Notice tone="danger">Fix {errors.length === 1 ? "the error" : `the ${errors.length} errors`} above before exporting.</Notice>
        ) : null}
        {needsBuild ? (
          <Notice tone="warning">
            This policy uses build-time settings, so it needs a custom image built from a GeoLibre checkout. The
            other settings work with the published image.
          </Notice>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="flex flex-col gap-1" aria-label="Generated files">
            {files.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  aria-current={item.name === file.name}
                  onClick={() => setSelected(item.name)}
                  className={cx(
                    "w-full rounded-md px-3 py-2 text-start",
                    item.name === file.name ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                >
                  <span className="block font-mono text-sm">{item.name}</span>
                  <span className="block text-xs text-muted">{item.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 rounded-md border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="font-mono text-sm">{file.name}</span>
              <span className="flex gap-1.5">
                <CopyButton text={file.content} />
                <Button size="sm" onClick={() => downloadText(file.name, file.content)} disabled={errors.length > 0}>
                  Download
                </Button>
              </span>
            </div>
            <pre className="max-h-[32rem] overflow-auto p-3 font-mono text-xs leading-relaxed" data-testid="export-preview">
              {file.content}
            </pre>
          </div>
        </div>
        <p className="text-xs text-muted">
          <code>deployment.json</code> follows the draft schema proposed in opengeos/GeoLibre#2775. Until GeoLibre
          reads it directly, deploy the other files, which current GeoLibre releases already understand.
        </p>
      </div>
    </Card>
  );
}
