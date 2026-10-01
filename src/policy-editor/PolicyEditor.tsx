import { useMemo, useRef, useState } from "react";
import { Button, ConfirmButton, Notice, Textarea, cx } from "../components/ui";
import { importText } from "../policy/import";
import { validatePolicy, type Issue } from "../policy/validate";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { ExportSection } from "./ExportSection";
import { InterfaceSection } from "./InterfaceSection";
import { ServicesSection } from "./ServicesSection";
import { BrandingSection, OperatorSection, SharingSection } from "./SharingSection";
import { usePolicyDraft } from "./usePolicyDraft";

const SECTIONS = [
  { id: "capabilities", label: "Capabilities", prefix: "/capabilities" },
  { id: "interface", label: "Interface", prefix: "/interface" },
  { id: "services", label: "Service library", prefix: "/services" },
  { id: "sharing", label: "Sharing", prefix: "/sharing|/geolens" },
  { id: "branding", label: "Branding", prefix: "/branding" },
  { id: "server", label: "Server settings", prefix: "operator/" },
  { id: "export", label: "Review and export", prefix: "" },
] as const;

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <Notice tone="ok">The policy is valid.</Notice>;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Validation issues">
      {issues.map((issue, index) => (
        <li
          key={index}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs",
            issue.severity === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
          )}
        >
          <span className="font-mono">{issue.path}</span> {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function PolicyEditor() {
  const { policy, operator, setPolicy, setOperator, replace, reset } = usePolicyDraft();
  const issues = useMemo(() => validatePolicy(policy, operator), [policy, operator]);
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const runImport = (text: string) => {
    try {
      const result = importText(text, policy, operator);
      replace({ policy: result.policy, operator: result.operator });
      setMessage({ tone: "ok", text: `Imported ${result.kind}.` });
      setImportOpen(false);
      setPasted("");
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const countFor = (prefix: string) =>
    prefix
      ? issues.filter((issue) => prefix.split("|").some((p) => issue.path.startsWith(p))).length
      : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <nav aria-label="Policy sections" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((section) => {
            const count = countFor(section.prefix);
            return (
              <a
                key={section.id}
                href={`#policy-${section.id}`}
                className="flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                {section.label}
                {count ? (
                  <span className="rounded bg-warning-soft px-1.5 text-xs text-warning">{count}</span>
                ) : null}
              </a>
            );
          })}
        </nav>
        <div className="mt-4 hidden flex-col gap-2 lg:flex">
          <Button onClick={() => setImportOpen((open) => !open)}>Import…</Button>
          <ConfirmButton confirmLabel="Discard the draft?" onConfirm={() => { reset(); setMessage(null); }}>
            Start over
          </ConfirmButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Deployment policy</h1>
              <p className="text-sm text-muted">
                Decide what a GeoLibre deployment offers, then export the files to deploy it. Your draft is saved in this
                browser only.
              </p>
            </div>
            <div className="flex gap-2 lg:hidden">
              <Button onClick={() => setImportOpen((open) => !open)}>Import…</Button>
              <ConfirmButton confirmLabel="Discard?" onConfirm={() => { reset(); setMessage(null); }}>
                Start over
              </ConfirmButton>
            </div>
          </div>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          {importOpen ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm">
                Import a <code>deployment.json</code>, an existing <code>admin-profile.json</code>, a services file, or an
                env file (<code>KEY=VALUE</code> lines or a <code>docker run</code> command).
              </p>
              <Textarea
                aria-label="Paste a file"
                rows={6}
                value={pasted}
                placeholder="Paste file content here"
                onChange={(event) => setPasted(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!pasted.trim()} onClick={() => runImport(pasted)}>
                  Import pasted text
                </Button>
                <Button onClick={() => fileInput.current?.click()}>Choose a file…</Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,.env,.sh,.txt,application/json,text/plain"
                  className="hidden"
                  aria-label="Import file"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) runImport(await file.text());
                  }}
                />
                <Button variant="ghost" onClick={() => setImportOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div id="policy-capabilities" className="scroll-mt-20">
          <CapabilitiesSection policy={policy} setPolicy={setPolicy} />
        </div>
        <div id="policy-interface" className="scroll-mt-20">
          <InterfaceSection policy={policy} setPolicy={setPolicy} />
        </div>
        <div id="policy-services" className="scroll-mt-20">
          <ServicesSection policy={policy} setPolicy={setPolicy} />
        </div>
        <div id="policy-sharing" className="scroll-mt-20">
          <SharingSection policy={policy} setPolicy={setPolicy} issues={issues} />
        </div>
        <div id="policy-branding" className="scroll-mt-20">
          <BrandingSection policy={policy} setPolicy={setPolicy} />
        </div>
        <div id="policy-server" className="scroll-mt-20">
          <OperatorSection operator={operator} setOperator={setOperator} />
        </div>
        <div id="policy-export" className="flex scroll-mt-20 flex-col gap-3">
          <IssueList issues={issues} />
          <ExportSection policy={policy} operator={operator} issues={issues} />
        </div>
      </div>
    </div>
  );
}
