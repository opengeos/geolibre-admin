import { describe, expect, it, vi } from "vitest";
import { ApiError, GeoLibreServer, normalizeBaseUrl, type IdentityProviderBody } from "../src/api/client";

function mockFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("GeoLibreServer", () => {
  it("normalizes base URLs", () => {
    expect(normalizeBaseUrl(" projects.example.org/ ")).toBe("https://projects.example.org");
    expect(normalizeBaseUrl("http://localhost:8000//")).toBe("http://localhost:8000");
  });

  it("signs in for a short-lived token with only the read and write scopes", async () => {
    const fetch = mockFetch(201, { token: "secret", expiresAt: "2026-10-01T00:00:00Z" });
    const server = new GeoLibreServer("http://localhost:8000", null, fetch);
    await server.signIn("ada", "pw");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/auth/token");
    expect(JSON.parse(init.body as string)).toEqual({
      username: "ada",
      password: "pw",
      name: "GeoLibre Admin",
      scopes: ["read:projects", "write:projects"],
      expiresInDays: 1,
    });
    expect(server.credential).toBe("secret");
  });

  it("sends the bearer token and encodes path segments", async () => {
    const fetch = mockFetch(204);
    const server = new GeoLibreServer("http://localhost:8000", "tok", fetch);
    await server.removeOrganizationMember("org/1", "a b");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/organizations/org%2F1/members/a%20b");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("surfaces the server's error string", async () => {
    const server = new GeoLibreServer("http://x.test", "tok", mockFetch(409, { error: "organization must have an administrator" }));
    await expect(server.setOrganizationMember("o", "ada", "member")).rejects.toMatchObject({
      status: 409,
      message: "organization must have an administrator",
    });
  });

  it("explains insufficient scope", async () => {
    const server = new GeoLibreServer(
      "http://x.test",
      "tok",
      mockFetch(403, { error: "insufficient_scope", requiredScope: "write:projects" }),
    );
    await expect(server.createGroup({ name: "g", description: "", organizationId: null, joinPolicy: "invite", sharedUpdate: false }))
      .rejects.toThrow("This token lacks the write:projects scope.");
  });

  it("reports network failures with a CORS hint", async () => {
    const server = new GeoLibreServer("http://x.test", "tok", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const error = await server.me().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/GEOLIBRE_CORS_ORIGINS/);
  });

  it("forgets the token on sign-out even when revocation fails", async () => {
    const server = new GeoLibreServer("http://x.test", "tok", mockFetch(500, { error: "boom" }));
    await expect(server.signOut()).rejects.toThrow("boom");
    expect(server.credential).toBeNull();
  });
  it("treats only an unconfigured provider 404 as an empty result", async () => {
    const server = new GeoLibreServer("http://x.test", "tok", mockFetch(404, { error: "identity provider not configured" }));
    await expect(server.identityProvider("org/1")).resolves.toBeNull();

    const missingOrganization = new GeoLibreServer("http://x.test", "tok", mockFetch(404, { error: "organization not found" }));
    await expect(missingOrganization.identityProvider("org/1")).rejects.toMatchObject({
      status: 404,
      message: "organization not found",
    });
  });

  it("encodes the organization ID and sends the identity-provider body", async () => {
    const fetch = mockFetch(200, { identityProvider: {} });
    const server = new GeoLibreServer("http://x.test", "tok", fetch);
    const body: IdentityProviderBody = {
      issuer: "https://idp.example.org",
      clientId: "geolibre",
      clientSecret: "secret",
      tokenEndpointAuthMethod: "client_secret_basic",
      scopes: ["openid", "email"],
      usernameClaim: "preferred_username",
      emailClaim: "email",
      groupsClaim: "groups",
      defaultRole: "member",
      roleMappings: [],
      groupMappings: [],
      requireMfa: false,
      allowBuiltinAccounts: true,
      breakGlassUsername: null,
      enabled: true,
    };
    await server.setIdentityProvider("org/1", body);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x.test/api/organizations/org%2F1/identity-provider");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("explains when an API request requires a recent sign-in", async () => {
    const server = new GeoLibreServer("http://x.test", "tok", mockFetch(401, { error: "reauthentication_required" }));
    await expect(server.deleteIdentityProvider("org/1")).rejects.toMatchObject({
      status: 401,
      message: "A recent sign-in is required for this request. Sign out and sign in again.",
    });
  });

  it("deletes an organization identity provider with the expected route", async () => {
    const fetch = mockFetch(204);
    const server = new GeoLibreServer("http://x.test", "tok", fetch);
    await server.deleteIdentityProvider("org/1");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x.test/api/organizations/org%2F1/identity-provider");
    expect(init.method).toBe("DELETE");
  });

});
