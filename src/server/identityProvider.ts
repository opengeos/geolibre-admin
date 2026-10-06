import {
  type GroupMapping,
  type IdentityProvider,
  type IdentityProviderBody,
  type OrganizationRole,
  type RoleMapping,
  type TokenEndpointAuthMethod,
} from "../api/client";

export type PresetId = "generic" | "entra" | "okta" | "google" | "keycloak" | "adfs";

export interface Preset {
  label: string;
  issuerPlaceholder: string;
  scopes: string[];
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  setup: string[];
}

const REGISTRATION_STEP =
  "Register a confidential web client using the authorization code flow with PKCE (S256) and add the redirect URI shown here.";

export const PRESET_IDS: PresetId[] = ["generic", "entra", "okta", "google", "keycloak", "adfs"];

export const PRESETS: Record<PresetId, Preset> = {
  generic: {
    label: "Other OpenID Connect provider",
    issuerPlaceholder: "https://login.example.org",
    scopes: ["openid", "email", "profile"],
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    setup: [REGISTRATION_STEP, "Map group membership into an ID token claim if you use role or group mappings."],
  },
  entra: {
    label: "Microsoft Entra ID",
    issuerPlaceholder: "https://login.microsoftonline.com/{tenant-id}/v2.0",
    scopes: ["openid", "email", "profile"],
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    setup: [
      REGISTRATION_STEP,
      "Under Token configuration, add the optional email claim and a groups claim (Entra sends group object IDs, so map those IDs).",
      "Entra doesn't send email_verified, so GeoLibre accounts get no email address.",
    ],
  },
  okta: {
    label: "Okta",
    issuerPlaceholder: "https://{your-domain}.okta.com/oauth2/default",
    scopes: ["openid", "email", "profile", "groups"],
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    setup: [REGISTRATION_STEP, "Add a groups claim to the ID token (the app's Sign On settings or the authorization server's Claims)."],
  },
  google: {
    label: "Google",
    issuerPlaceholder: "https://accounts.google.com",
    scopes: ["openid", "email", "profile"],
    usernameClaim: "email",
    emailClaim: "email",
    groupsClaim: "",
    setup: [
      REGISTRATION_STEP,
      "Google sends no groups claim, so only the default role applies.",
      "Set the OAuth consent screen's user type to Internal, or any Google account can sign in.",
    ],
  },
  keycloak: {
    label: "Keycloak",
    issuerPlaceholder: "https://{host}/realms/{realm}",
    scopes: ["openid", "email", "profile"],
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    setup: [
      REGISTRATION_STEP,
      "Add a Group Membership mapper with token claim name groups and Add to ID token on; turn Full group path off to map plain group names.",
    ],
  },
  adfs: {
    label: "AD FS 2016+",
    issuerPlaceholder: "https://{host}/adfs",
    scopes: ["openid", "email", "profile", "allatclaims"],
    usernameClaim: "upn",
    emailClaim: "email",
    groupsClaim: "group",
    setup: [
      REGISTRATION_STEP,
      "Add issuance transform rules that emit upn, email, and group; the allatclaims scope puts them in the ID token.",
    ],
  },
};

export function detectPreset(issuer: string): PresetId {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return "generic";
  }
  if (url.protocol !== "https:" || url.search || url.hash) return "generic";

  const hostname = url.hostname.toLowerCase();
  const path = url.pathname;
  if (hostname === "login.microsoftonline.com" && !url.port && /^\/[^/]+\/v2\.0\/?$/.test(path)) return "entra";
  if (hostname === "accounts.google.com" && !url.port && path === "/") return "google";
  if (/^.+\.(okta|oktapreview|okta-emea)\.com$/.test(hostname) && (/^\/oauth2\/[^/]+\/?$/.test(path) || path === "/")) {
    return "okta";
  }
  if (/\/realms\/[^/]+\/?$/.test(path)) return "keycloak";
  if (/\/adfs\/?$/i.test(path)) return "adfs";
  return "generic";
}

export type EndpointMode = "discovery" | "manual";
let nextMappingDraftId = 0;

export function createMappingDraftId(): string {
  return `mapping-${++nextMappingDraftId}`;
}

type DraftRoleMapping = RoleMapping & { id: string };
type DraftGroupMapping = GroupMapping & { id: string };

export interface IdentityProviderDraft {
  preset: PresetId;
  issuer: string;
  clientId: string;
  clientSecret: string;
  endpointMode: EndpointMode;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  scopes: string[];
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  defaultRole: OrganizationRole;
  roleMappings: DraftRoleMapping[];
  groupMappings: DraftGroupMapping[];
  requireMfa: boolean;
  allowBuiltinAccounts: boolean;
  breakGlassUsername: string;
  enabled: boolean;
}

export type DraftField =
  | "issuer"
  | "clientId"
  | "clientSecret"
  | "endpoints"
  | "scopes"
  | "usernameClaim"
  | "emailClaim"
  | "groupsClaim"
  | "roleMappings"
  | "groupMappings"
  | "breakGlassUsername";

export function emptyDraft(): IdentityProviderDraft {
  const preset = PRESETS.generic;
  return {
    preset: "generic",
    issuer: "",
    clientId: "",
    clientSecret: "",
    endpointMode: "discovery",
    authorizationEndpoint: "",
    tokenEndpoint: "",
    jwksUri: "",
    tokenEndpointAuthMethod: "client_secret_basic",
    scopes: [...preset.scopes],
    usernameClaim: preset.usernameClaim,
    emailClaim: preset.emailClaim,
    groupsClaim: preset.groupsClaim,
    defaultRole: "member",
    roleMappings: [],
    groupMappings: [],
    requireMfa: false,
    allowBuiltinAccounts: true,
    breakGlassUsername: "",
    enabled: true,
  };
}

export function draftFromProvider(provider: IdentityProvider): IdentityProviderDraft {
  return {
    preset: detectPreset(provider.issuer),
    issuer: provider.issuer,
    clientId: provider.clientId,
    clientSecret: "",
    // The GET contract has no discovery/manual flag; resubmit the saved endpoints so edits don't unexpectedly rerun discovery.
    endpointMode: "manual",
    authorizationEndpoint: provider.authorizationEndpoint,
    tokenEndpoint: provider.tokenEndpoint,
    jwksUri: provider.jwksUri,
    tokenEndpointAuthMethod: provider.tokenEndpointAuthMethod,
    scopes: [...provider.scopes],
    usernameClaim: provider.usernameClaim,
    emailClaim: provider.emailClaim,
    groupsClaim: provider.groupsClaim ?? "",
    defaultRole: provider.defaultRole,
    roleMappings: provider.roleMappings.map((mapping) => ({ ...mapping, id: createMappingDraftId() })),
    groupMappings: provider.groupMappings.map((mapping) => ({ ...mapping, id: createMappingDraftId() })),
    requireMfa: provider.requireMfa,
    allowBuiltinAccounts: provider.allowBuiltinAccounts,
    breakGlassUsername: provider.breakGlassUsername ?? "",
    enabled: provider.enabled,
  };
}

export function applyPreset(draft: IdentityProviderDraft, id: PresetId): IdentityProviderDraft {
  const preset = PRESETS[id];
  return {
    ...draft,
    preset: id,
    scopes: [...preset.scopes],
    usernameClaim: preset.usernameClaim,
    emailClaim: preset.emailClaim,
    groupsClaim: preset.groupsClaim,
  };
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateDraft(
  draft: IdentityProviderDraft,
  { creating }: { creating: boolean },
): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {};
  const issuer = draft.issuer.trim();
  if (!isHttpsUrl(issuer) || issuer.includes("?") || issuer.includes("#")) {
    errors.issuer = "issuer must be an https URL without query or fragment";
  } else if (issuer.includes("{") || issuer.includes("}")) {
    errors.issuer = "Replace the {placeholders} with your provider's values.";
  } else if (issuer.length > 512) {
    errors.issuer = "Up to 512 characters.";
  }

  const clientId = draft.clientId.trim();
  if (!clientId) errors.clientId = "Required.";
  else if (clientId.length > 255) errors.clientId = "Up to 255 characters.";

  if (creating && !draft.clientSecret) errors.clientSecret = "clientSecret is required";
  else if (draft.clientSecret.length > 512) errors.clientSecret = "Up to 512 characters.";

  if (draft.endpointMode === "manual") {
    const endpoints = [draft.authorizationEndpoint.trim(), draft.tokenEndpoint.trim(), draft.jwksUri.trim()];
    if (endpoints.some((endpoint) => !endpoint)) errors.endpoints = "set all three endpoints";
    else if (endpoints.some((endpoint) => !isHttpsUrl(endpoint))) {
      errors.endpoints = "identity provider endpoints must be https URLs";
    }
  }

  if (!draft.scopes.includes("openid") || draft.scopes.some((scope) => !/^[A-Za-z0-9:._-]{1,64}$/.test(scope))) {
    errors.scopes = "scopes must include openid and use simple scope tokens";
  } else if (draft.scopes.length > 20) {
    errors.scopes = "Up to 20 scopes.";
  }

  const usernameClaim = draft.usernameClaim.trim();
  if (!usernameClaim) errors.usernameClaim = "Required.";
  else if (usernameClaim.length > 64) errors.usernameClaim = "Up to 64 characters.";
  const emailClaim = draft.emailClaim.trim();
  if (!emailClaim) errors.emailClaim = "Required.";
  else if (emailClaim.length > 64) errors.emailClaim = "Up to 64 characters.";
  if (draft.groupsClaim.trim().length > 64) errors.groupsClaim = "Up to 64 characters.";

  if (draft.roleMappings.length > 100) errors.roleMappings = "Up to 100 mappings.";
  else if (draft.roleMappings.some((mapping) => !mapping.value.trim() || mapping.value.trim().length > 255)) {
    errors.roleMappings = "Each value needs 1–255 characters.";
  }

  if (draft.groupMappings.length > 100) errors.groupMappings = "Up to 100 mappings.";
  else if (draft.groupMappings.some((mapping) => !mapping.value.trim() || mapping.value.trim().length > 255)) {
    errors.groupMappings = "Each value needs 1–255 characters.";
  } else if (draft.groupMappings.some((mapping) => !mapping.groupId)) {
    errors.groupMappings = "Pick a group for each mapping.";
  }

  if (!draft.allowBuiltinAccounts && !draft.breakGlassUsername) {
    errors.breakGlassUsername = "a break-glass administrator is required when built-in accounts are disallowed";
  }
  return errors;
}

export function toRequestBody(draft: IdentityProviderDraft): IdentityProviderBody {
  return {
    issuer: draft.issuer.trim(),
    clientId: draft.clientId.trim(),
    ...(draft.clientSecret ? { clientSecret: draft.clientSecret } : {}),
    ...(draft.endpointMode === "manual"
      ? {
          authorizationEndpoint: draft.authorizationEndpoint.trim(),
          tokenEndpoint: draft.tokenEndpoint.trim(),
          jwksUri: draft.jwksUri.trim(),
        }
      : {}),
    tokenEndpointAuthMethod: draft.tokenEndpointAuthMethod,
    scopes: [...draft.scopes],
    usernameClaim: draft.usernameClaim.trim(),
    emailClaim: draft.emailClaim.trim(),
    groupsClaim: draft.groupsClaim.trim() || null,
    defaultRole: draft.defaultRole,
    roleMappings: draft.roleMappings.map(({ value, role }) => ({ value: value.trim(), role })),
    groupMappings: draft.groupMappings.map(({ value, groupId }) => ({ value: value.trim(), groupId })),
    requireMfa: draft.requireMfa,
    allowBuiltinAccounts: draft.allowBuiltinAccounts,
    breakGlassUsername: draft.breakGlassUsername || null,
    enabled: draft.enabled,
  };
}

export function discoveryUrl(issuer: string): string {
  return `${issuer.trim().replace(/\/+$/, "")}/.well-known/openid-configuration`;
}

export type DiscoveryResult =
  | {
      ok: true;
      authorizationEndpoint: string | null;
      tokenEndpoint: string | null;
      jwksUri: string | null;
      problems: string[];
      warnings: string[];
    }
  | { ok: false; message: string };

const FETCH_FAILURE_MESSAGE =
  "Couldn't fetch the discovery document from this browser (CORS, a redirect, or the network). The server runs its own discovery when you save.";

export async function checkDiscovery(
  draft: IdentityProviderDraft,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<DiscoveryResult> {
  let response: Response;
  try {
    response = await fetchImpl(discoveryUrl(draft.issuer), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, message: FETCH_FAILURE_MESSAGE };
  }
  if (!response.ok) return { ok: false, message: `Discovery returned HTTP ${response.status}.` };

  let document: unknown;
  try {
    document = await response.json();
  } catch {
    return { ok: false, message: "The discovery document isn't a JSON object." };
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { ok: false, message: "The discovery document isn't a JSON object." };
  }

  const doc = document as Record<string, unknown>;
  const problems: string[] = [];
  const issuer = draft.issuer.trim();
  if (typeof doc.issuer !== "string") {
    problems.push("The document's issuer is missing or not a string. GeoLibre compares it exactly.");
  } else if (doc.issuer !== issuer) {
    problems.push(`The document's issuer is "${doc.issuer}". GeoLibre compares it exactly, so use that value.`);
  }
  const endpointKeys = ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const;
  for (const key of endpointKeys) {
    if (typeof doc[key] !== "string" || !isHttpsUrl(doc[key])) {
      problems.push(`${key} is missing or not an https URL.`);
    }
  }

  const warnings: string[] = [];
  if (Array.isArray(doc.code_challenge_methods_supported) && !doc.code_challenge_methods_supported.includes("S256")) {
    warnings.push("The provider doesn't list S256 PKCE, which GeoLibre requires.");
  }
  const method = draft.tokenEndpointAuthMethod;
  if (
    Array.isArray(doc.token_endpoint_auth_methods_supported) &&
    !doc.token_endpoint_auth_methods_supported.includes(method)
  ) {
    warnings.push(`The provider doesn't list ${method}; pick a supported client authentication.`);
  }
  if (Array.isArray(doc.claims_supported)) {
    for (const claim of [draft.usernameClaim, draft.emailClaim, draft.groupsClaim].filter(Boolean)) {
      if (!doc.claims_supported.includes(claim)) {
        warnings.push(`The provider doesn't advertise the ${claim} claim; check its claim mappings.`);
      }
    }
  }
  if (Array.isArray(doc.scopes_supported)) {
    for (const scope of draft.scopes) {
      if (!doc.scopes_supported.includes(scope)) warnings.push(`The provider doesn't advertise the ${scope} scope.`);
    }
  }

  return {
    ok: true,
    authorizationEndpoint:
      typeof doc.authorization_endpoint === "string" ? doc.authorization_endpoint : null,
    tokenEndpoint: typeof doc.token_endpoint === "string" ? doc.token_endpoint : null,
    jwksUri: typeof doc.jwks_uri === "string" ? doc.jwks_uri : null,
    problems,
    warnings,
  };
}
