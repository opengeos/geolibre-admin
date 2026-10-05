import { useCallback, useEffect, useState } from "react";
import type { ExportTarget } from "../policy/export";
import { structuralIssues } from "../policy/validate";
import {
  DEFAULT_OPERATOR_SETTINGS,
  emptyPolicy,
  type DeploymentPolicy,
  type OperatorSettings,
} from "../policy/types";

const STORAGE_KEY = "geolibre-admin:policy-draft";

interface Draft {
  policy: DeploymentPolicy;
  operator: OperatorSettings;
  target: ExportTarget;
}

function load(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Draft>;
      // A draft saved mid-typing (say `https://`) fails the schema's URL
      // patterns but must not be thrown away; the editor shows those as
      // issues. Wrong types or unknown keys (an older build) are discarded.
      const saved = parsed.policy;
      if (saved && structuralIssues(saved).length === 0) {
        return {
          policy: saved,
          operator: { ...DEFAULT_OPERATOR_SETTINGS, ...parsed.operator },
          target:
            parsed.target === "deployment" || parsed.target === "legacy" ? parsed.target : "legacy",
        };
      }
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return {
    policy: emptyPolicy(),
    operator: { ...DEFAULT_OPERATOR_SETTINGS },
    target: "legacy",
  };
}

/**
 * The policy being edited, kept in this browser's localStorage so a reload
 * does not lose work. Nothing is sent anywhere.
 *
 * @returns The draft and its setters.
 */
export function usePolicyDraft() {
  const [draft, setDraft] = useState<Draft>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Private mode or storage disabled: the draft lives for this tab only.
    }
  }, [draft]);

  const setPolicy = useCallback(
    (update: (policy: DeploymentPolicy) => DeploymentPolicy) =>
      setDraft((current) => ({ ...current, policy: update(current.policy) })),
    [],
  );
  const setOperator = useCallback(
    (update: Partial<OperatorSettings>) =>
      setDraft((current) => ({ ...current, operator: { ...current.operator, ...update } })),
    [],
  );
  const setTarget = useCallback(
    (target: ExportTarget) => setDraft((current) => ({ ...current, target })),
    [],
  );
  const replace = useCallback(
    (next: Pick<Draft, "policy" | "operator">) =>
      setDraft((current) => ({ ...current, ...next })),
    [],
  );
  const reset = useCallback(
    () =>
      setDraft({
        policy: emptyPolicy(),
        operator: { ...DEFAULT_OPERATOR_SETTINGS },
        target: "legacy",
      }),
    [],
  );

  return { ...draft, setPolicy, setOperator, setTarget, replace, reset };
}
