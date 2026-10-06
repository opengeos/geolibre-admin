import { describe, expect, it, vi } from "vitest";
import type { IdentityProvider } from "../src/api/client";
import {
  PRESETS,
  applyPreset,
  checkDiscovery,
  detectPreset,
  discoveryUrl,
  emptyDraft,
  draftFromProvider,
  toRequestBody,
  validateDraft,
} from "../src/server/identityProvider";

describe("identity provider drafts", () => {
  it("mirrors server validation for required secrets, issuer, endpoints, scopes, and break-glass", () => {
    const draft = emptyDraft();
    draft.issuer = "https://idp.example.org";
    draft.clientId = "geolibre";
    expect(validateDraft(draft, { creating: true }).clientSecret).toBe("clientSecret is required");
    expect(validateDraft(draft, { creating: false }).clientSecret).toBeUndefined();

    draft.issuer = "https://idp.example.org/?x=1";
    expect(validateDraft(draft, { creating: true }).issuer).toBe(
      "issuer must be an https URL without query or fragment",
    );
    draft.issuer = "https://login.microsoftonline.com/{tenant-id}/v2.0";
    expect(validateDraft(draft, { creating: true }).issuer).toBe("Replace the {placeholders} with your provider's values.");

    draft.issuer = "https://idp.example.org";
    draft.clientSecret = "secret";
    draft.endpointMode = "manual";
    draft.authorizationEndpoint = "https://idp.example.org/authorize";
    expect(validateDraft(draft, { creating: true }).endpoints).toBe("set all three endpoints");
    draft.endpointMode = "discovery";
    draft.scopes = ["email"];
    expect(validateDraft(draft, { creating: true }).scopes).toBe(
      "scopes must include openid and use simple scope tokens",
    );
    draft.scopes = ["openid", "email"];
    draft.allowBuiltinAccounts = false;
    expect(validateDraft(draft, { creating: true }).breakGlassUsername).toBe(
      "a break-glass administrator is required when built-in accounts are disallowed",
    );
  });
  it("enforces upper bounds for scopes, mappings, issuer, and client secret", () => {
    const draft = emptyDraft();
    const issuerPrefix = "https://idp.example.org/";
    draft.issuer = issuerPrefix + "a".repeat(512 - issuerPrefix.length);
    draft.clientId = "client";
    draft.clientSecret = "s".repeat(512);
    draft.scopes = ["openid", ...Array.from({ length: 19 }, (_, index) => `scope${index}`)];
    draft.roleMappings = Array.from({ length: 100 }, (_, index) => ({
      id: `role-${index}`,
      value: `role-${index}`,
      role: "member" as const,
    }));
    draft.groupMappings = Array.from({ length: 100 }, (_, index) => ({
      id: `group-${index}`,
      value: `group-${index}`,
      groupId: `group-${index}`,
    }));
    expect(validateDraft(draft, { creating: true })).toEqual({});

    const errors = validateDraft(
      {
        ...draft,
        issuer: `${draft.issuer}x`,
        clientSecret: `${draft.clientSecret}x`,
        scopes: [...draft.scopes, "scope-extra"],
        roleMappings: [...draft.roleMappings, { id: "role-100", value: "role-100", role: "member" }],
        groupMappings: [...draft.groupMappings, { id: "group-100", value: "group-100", groupId: "group-100" }],
      },
      { creating: true },
    );
    expect(errors).toMatchObject({
      issuer: "Up to 512 characters.",
      clientSecret: "Up to 512 characters.",
      scopes: "Up to 20 scopes.",
      roleMappings: "Up to 100 mappings.",
      groupMappings: "Up to 100 mappings.",
    });
  });

  it("accepts a complete draft and applies preset claim defaults without replacing connection data", () => {
    const draft = emptyDraft();
    draft.issuer = "https://idp.example.org";
    draft.clientId = "geolibre";
    draft.clientSecret = "secret";
    expect(validateDraft(draft, { creating: true })).toEqual({});

    const updated = applyPreset({ ...draft, roleMappings: [{ id: "role-1", value: "admins", role: "administrator" }] }, "google");
    expect(updated.issuer).toBe(draft.issuer);
    expect(updated.clientId).toBe(draft.clientId);
    expect(updated.clientSecret).toBe(draft.clientSecret);
    expect(updated.roleMappings).toEqual([{ id: "role-1", value: "admins", role: "administrator" }]);
    expect(updated.scopes).toEqual(PRESETS.google.scopes);
    expect(updated.usernameClaim).toBe("email");
    expect(updated.groupsClaim).toBe("");
  });

  it("serializes only API fields and preserves a trailing issuer slash", () => {
    const draft = emptyDraft();
    draft.issuer = " https://idp.example.org/realms/a/ ";
    draft.clientId = " client ";
    draft.usernameClaim = " preferred_username ";
    draft.emailClaim = " email ";
    draft.groupsClaim = "";
    draft.roleMappings = [{ id: "role-1", value: " admins ", role: "administrator" }];
    draft.groupMappings = [{ id: "group-1", value: " team ", groupId: "org-group" }];
    const body = toRequestBody(draft);
    expect(body.issuer).toBe("https://idp.example.org/realms/a/");
    expect(body.clientId).toBe("client");
    expect(body.usernameClaim).toBe("preferred_username");
    expect(body.emailClaim).toBe("email");
    expect(body.roleMappings).toEqual([{ value: "admins", role: "administrator" }]);
    expect(body.groupMappings).toEqual([{ value: "team", groupId: "org-group" }]);
    expect(body.groupsClaim).toBeNull();
    expect("clientSecret" in body).toBe(false);
    expect("authorizationEndpoint" in body).toBe(false);
    expect("tokenEndpoint" in body).toBe(false);
    expect("jwksUri" in body).toBe(false);
    expect("preset" in body).toBe(false);
    expect("endpointMode" in body).toBe(false);
  });
  it("keeps saved endpoints and strips mapping IDs without secure-context crypto", () => {
    const provider: IdentityProvider = {
      issuer: "https://idp.example.org/realms/acme",
      clientId: "geolibre",
      tokenEndpointAuthMethod: "client_secret_basic",
      scopes: ["openid", "email"],
      usernameClaim: "preferred_username",
      emailClaim: "email",
      groupsClaim: "groups",
      defaultRole: "member",
      roleMappings: [
        { value: "admins", role: "administrator" },
        { value: "editors", role: "publisher" },
      ],
      groupMappings: [{ value: "engineering", groupId: "group-1" }],
      requireMfa: false,
      allowBuiltinAccounts: true,
      breakGlassUsername: null,
      enabled: true,
      protocol: "oidc",
      clientSecretSet: true,
      authorizationEndpoint: "https://idp.example.org/authorize",
      tokenEndpoint: "https://idp.example.org/token",
      jwksUri: "https://idp.example.org/jwks",
      redirectUri: null,
      updatedAt: "2026-10-04T00:00:00Z",
    };
    const draft = (() => {
      vi.stubGlobal("crypto", {} as Crypto);
      try {
        return draftFromProvider(provider);
      } finally {
        vi.unstubAllGlobals();
      }
    })();
    const body = toRequestBody(draft);
    const rowIds = [...draft.roleMappings, ...draft.groupMappings].map((mapping) => mapping.id);
    expect(draft.endpointMode).toBe("manual");
    expect(body.authorizationEndpoint).toBe(provider.authorizationEndpoint);
    expect(body.tokenEndpoint).toBe(provider.tokenEndpoint);
    expect(body.jwksUri).toBe(provider.jwksUri);
    expect(new Set(rowIds).size).toBe(rowIds.length);
    expect(body.roleMappings).toEqual(provider.roleMappings);
    expect(body.groupMappings).toEqual(provider.groupMappings);
    expect(body.roleMappings.every((mapping) => !("id" in mapping))).toBe(true);
    expect(body.groupMappings.every((mapping) => !("id" in mapping))).toBe(true);
  });


  it("detects each provider preset and otherwise uses the generic preset", () => {
    expect(detectPreset("https://login.microsoftonline.com/tenant/v2.0")).toBe("entra");
    expect(detectPreset("https://accounts.google.com")).toBe("google");
    expect(detectPreset("https://example.okta.com/oauth2/default")).toBe("okta");
    expect(detectPreset("https://TENANT.OKTA.COM/oauth2/default")).toBe("okta");
    expect(detectPreset("https://idp.example.org/realms/acme")).toBe("keycloak");
    expect(detectPreset("https://adfs.example.org/adfs")).toBe("adfs");
    expect(detectPreset("https://login.example.org")).toBe("generic");
    expect(detectPreset("not-a-url/realms/acme")).toBe("generic");
    expect(detectPreset("http://adfs.example.org/adfs")).toBe("generic");
  });

  it("checks discovery endpoints, exact issuer matching, and PKCE support", async () => {
    const draft = emptyDraft();
    draft.issuer = "https://idp.example.org/";
    let requestedUrl = "";
    const result = await checkDiscovery(draft, async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        issuer: "https://different.example.org",
        authorization_endpoint: "https://idp.example.org/authorize",
        token_endpoint: "https://idp.example.org/token",
        jwks_uri: "https://idp.example.org/jwks",
        code_challenge_methods_supported: ["plain"],
      }), { status: 200 });
    });

    expect(requestedUrl).toBe("https://idp.example.org/.well-known/openid-configuration");
    expect(discoveryUrl(draft.issuer)).toBe(requestedUrl);
    expect(result).toMatchObject({ ok: true, authorizationEndpoint: "https://idp.example.org/authorize" });
    if (result.ok) {
      expect(result.problems).toEqual([
        'The document\'s issuer is "https://different.example.org". GeoLibre compares it exactly, so use that value.',
      ]);
      expect(result.warnings).toContain("The provider doesn't list S256 PKCE, which GeoLibre requires.");
    }
  });
  it("reports a missing discovery issuer without rendering undefined", async () => {
    const draft = emptyDraft();
    draft.issuer = "https://idp.example.org";
    const result = await checkDiscovery(draft, async () => new Response(JSON.stringify({
      authorization_endpoint: "https://idp.example.org/authorize",
      token_endpoint: "https://idp.example.org/token",
      jwks_uri: "https://idp.example.org/jwks",
    }), { status: 200 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problems).toContain(
        "The document's issuer is missing or not a string. GeoLibre compares it exactly.",
      );
      expect(result.problems.some((problem) => problem.includes("undefined"))).toBe(false);
    }
  });

  it("reports browser fetch and HTTP discovery failures without blocking the save flow", async () => {
    const draft = emptyDraft();
    draft.issuer = "https://idp.example.org";
    const failedFetch = await checkDiscovery(draft, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(failedFetch).toEqual({
      ok: false,
      message: "Couldn't fetch the discovery document from this browser (CORS, a redirect, or the network). The server runs its own discovery when you save.",
    });

    const notFound = await checkDiscovery(draft, async () => new Response(null, { status: 404 }));
    expect(notFound).toEqual({ ok: false, message: "Discovery returned HTTP 404." });
  });
});
