import { useCallback, useEffect, useState } from "react";
import { schemaIssues } from "../policy/validate";
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
}

function load(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Draft>;
      // A draft saved by an older build may no longer match the schema.
      if (parsed.policy && schemaIssues(parsed.policy).length === 0) {
        return {
          policy: parsed.policy,
          operator: { ...DEFAULT_OPERATOR_SETTINGS, ...parsed.operator },
        };
      }
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return { policy: emptyPolicy(), operator: { ...DEFAULT_OPERATOR_SETTINGS } };
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
  const replace = useCallback((next: Draft) => setDraft(next), []);
  const reset = useCallback(
    () => setDraft({ policy: emptyPolicy(), operator: { ...DEFAULT_OPERATOR_SETTINGS } }),
    [],
  );

  return { ...draft, setPolicy, setOperator, replace, reset };
}
