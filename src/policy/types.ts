/**
 * The deployment policy document (`deployment.json`, version 1, draft).
 *
 * Everything in it is published to every visitor of the deployment, so it
 * holds only client-facing settings. Secrets and infrastructure settings
 * (proxy tokens, conversion roots, PostGIS hosts) live in {@link OperatorSettings},
 * which is exported as environment variables only.
 */

export const CAPABILITIES = [
  "project:edit",
  "data:add",
  "processing:run",
  "export:data",
  "plugins:install",
  "settings:manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SERVICE_KINDS = ["wms", "wfs", "wmts", "xyz", "arcgis", "csw"] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number];

/** The `admin-profile.json` settings GeoLibre reads today. */
export interface InterfacePolicy {
  enabled?: boolean;
  level?: ExperienceLevel;
  lock?: boolean;
  hiddenDataSources?: string[];
  hiddenPlugins?: string[];
  hiddenMenus?: string[];
  hiddenMenuItems?: string[];
}

/** One entry of the curated service library (`GEOLIBRE_SERVICES_FILE`). */
export interface ServiceEntry {
  id: string;
  name: string;
  kind: ServiceKind;
  category?: string;
  fields: Record<string, string | number | boolean>;
}

export interface ServicesPolicy {
  /** `false` hides GeoLibre's built-in starter services. */
  builtins?: boolean;
  catalog?: ServiceEntry[];
}

export interface SharingPolicy {
  /** A projects server URL, or `"off"` to remove Share and the Gallery. */
  shareUrl?: string;
  /** A `wss://` live-collaboration relay. */
  collabUrl?: string;
  /** Origins allowed to drive a framed app over the embed API. */
  embedOrigins?: string[];
}

export interface GeoLensPolicy {
  /** A GeoLens server root, `"same-origin"`, or `"off"`. */
  url?: string;
}

export interface BrandingPolicy {
  appName?: string;
  /** `false` skips the first-launch welcome wizard (a build-time setting). */
  welcome?: boolean;
}

export interface DeploymentPolicy {
  $schema?: string;
  version: 1;
  /** Omitted grants every capability; an empty list grants none. */
  capabilities?: Capability[];
  interface?: InterfacePolicy;
  services?: ServicesPolicy;
  sharing?: SharingPolicy;
  geolens?: GeoLensPolicy;
  branding?: BrandingPolicy;
}

/** Server-side settings that never belong in the published policy document. */
export interface OperatorSettings {
  sidecar: boolean;
  conversionRoots: string;
  postgisHosts: string;
}

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  sidecar: true,
  conversionRoots: "",
  postgisHosts: "",
};

export const SCHEMA_URL =
  "https://raw.githubusercontent.com/opengeos/geolibre-admin/main/schema/deployment.schema.json";

/**
 * Create an empty policy, which leaves every GeoLibre default in place.
 *
 * @returns A version 1 policy with no settings.
 */
export function emptyPolicy(): DeploymentPolicy {
  return { $schema: SCHEMA_URL, version: 1 };
}
