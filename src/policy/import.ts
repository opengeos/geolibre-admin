import { schemaIssues } from "./validate";
import {
  CAPABILITIES,
  DEFAULT_OPERATOR_SETTINGS,
  SCHEMA_URL,
  type Capability,
  type DeploymentPolicy,
  type InterfacePolicy,
  type OperatorSettings,
  type ServiceEntry,
} from "./types";

export interface ImportResult {
  policy: DeploymentPolicy;
  operator: OperatorSettings;
  /** What the input was recognized as, for the confirmation message. */
  kind: "deployment.json" | "admin-profile.json" | "services file" | "environment file";
}

const PROFILE_KEYS = [
  "enabled",
  "level",
  "lock",
  "hiddenDataSources",
  "hiddenPlugins",
  "hiddenMenus",
  "hiddenMenuItems",
];

/**
 * Parse `KEY=VALUE` lines, ignoring comments, blank lines, and `export`.
 *
 * @param text - Env file or shell snippet content.
 * @returns The variables found, unquoted.
 */
export function parseEnv(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "").replace(/^-e\s+/, "").replace(/\s*\\$/, "");
    const match = line.match(/^(?:--build-arg\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^'.*'$/.test(value) || /^".*"$/.test(value)) value = value.slice(1, -1);
    vars.set(match[1], value);
  }
  return vars;
}

/**
 * Turn environment variables into the equivalent policy and operator
 * settings. Variables the policy does not model are ignored.
 *
 * @param vars - Parsed environment variables.
 * @returns The policy and operator settings they describe.
 */
export function policyFromEnv(vars: Map<string, string>): {
  policy: DeploymentPolicy;
  operator: OperatorSettings;
} {
  const policy: DeploymentPolicy = { $schema: SCHEMA_URL, version: 1 };
  const operator = { ...DEFAULT_OPERATOR_SETTINGS };
  const get = (name: string) => vars.get(name)?.trim() || undefined;

  const capabilities = get("VITE_GEOLIBRE_CAPABILITIES");
  if (capabilities) {
    policy.capabilities =
      capabilities.toLowerCase() === "none"
        ? []
        : (capabilities
            .split(",")
            .map((item) => item.trim())
            .filter((item): item is Capability =>
              (CAPABILITIES as readonly string[]).includes(item),
            ) as Capability[]);
  }
  const embed = get("GEOLIBRE_EMBED_ORIGINS");
  const sharing = {
    shareUrl: get("GEOLIBRE_SHARE_URL"),
    collabUrl: get("GEOLIBRE_COLLAB_URL"),
    embedOrigins: embed ? embed.replace(/,/g, " ").split(/\s+/).filter(Boolean) : undefined,
  };
  if (Object.values(sharing).some(Boolean)) policy.sharing = sharing;
  if (get("GEOLIBRE_GEOLENS_URL")) policy.geolens = { url: get("GEOLIBRE_GEOLENS_URL") };
  const appName = get("GEOLIBRE_APP_NAME") ?? get("VITE_GEOLIBRE_APP_NAME");
  const welcomeDisabled = get("VITE_WELCOME_DISABLED") === "1";
  if (appName || welcomeDisabled) {
    policy.branding = { appName, welcome: welcomeDisabled ? false : undefined };
  }
  if (get("GEOLIBRE_BUILTIN_SERVICES")?.toLowerCase() === "off") {
    policy.services = { builtins: false };
  }
  operator.sidecar = get("GEOLIBRE_DISABLE_SIDECAR") !== "1";
  operator.conversionRoots = get("GEOLIBRE_CONVERSION_ROOTS") ?? "";
  operator.postgisHosts = get("GEOLIBRE_POSTGIS_HOSTS") ?? "";
  return { policy, operator };
}

/**
 * Recognize and import a `deployment.json`, `admin-profile.json`, services
 * file, or environment file.
 *
 * @param text - File content.
 * @param current - The policy being edited, merged with a partial import.
 * @param operator - The operator settings being edited.
 * @returns The merged result.
 * @throws Error when the content is not recognized or fails the schema.
 */
export function importText(
  text: string,
  current: DeploymentPolicy,
  operator: OperatorSettings,
): ImportResult {
  const result = recognize(text, current, operator);
  const problems = schemaIssues(result.policy);
  if (problems.length) {
    const detail = problems
      .slice(0, 3)
      .map((issue) => `${issue.path} ${issue.message}`)
      .join("; ");
    throw new Error(`The ${result.kind} doesn't match the schema: ${detail}`);
  }
  return result;
}

function recognize(
  text: string,
  current: DeploymentPolicy,
  operator: OperatorSettings,
): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const vars = parseEnv(text);
    if (vars.size === 0) throw new Error("Not JSON and no KEY=VALUE lines found.");
    const fromEnv = policyFromEnv(vars);
    return {
      policy: {
        ...current,
        ...fromEnv.policy,
        interface: current.interface,
        services: { ...current.services, ...fromEnv.policy.services },
      },
      operator: fromEnv.operator,
      kind: "environment file",
    };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Expected a JSON object.");
  }
  const object = data as Record<string, unknown>;
  if ("version" in object) {
    return { policy: object as unknown as DeploymentPolicy, operator, kind: "deployment.json" };
  }
  if (Array.isArray(object.services)) {
    return {
      policy: {
        ...current,
        services: { ...current.services, catalog: object.services as ServiceEntry[] },
      },
      operator,
      kind: "services file",
    };
  }
  if (Object.keys(object).some((key) => PROFILE_KEYS.includes(key))) {
    return {
      policy: { ...current, interface: object as InterfacePolicy },
      operator,
      kind: "admin-profile.json",
    };
  }
  throw new Error(
    "Unrecognized file: expected deployment.json, admin-profile.json, a services file, or an env file.",
  );
}
