/**
 * Contract test of the API client against a live projects server.
 *
 * Skipped unless GEOLIBRE_TEST_SERVER_URL names a disposable server (it
 * creates accounts, organizations, and groups), e.g. the reference server:
 *
 *   GEOLIBRE_TEST_SERVER_URL=http://127.0.0.1:8000 npm test
 */
import { describe, expect, it } from "vitest";
import { GeoLibreServer, type IdentityProviderBody } from "../src/api/client";

const baseUrl = process.env.GEOLIBRE_TEST_SERVER_URL;
const suffix = Math.random().toString(36).slice(2, 8);

async function createAccount(username: string, email?: string): Promise<GeoLibreServer> {
  const response = await fetch(`${baseUrl}/api/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "correct horse battery staple", email }),
  });
  expect(response.status).toBe(201);
  const server = new GeoLibreServer(baseUrl!);
  await server.signIn(username, "correct horse battery staple");
  return server;
}

describe.skipIf(!baseUrl)("projects server contract", () => {
  it("manages an organization end to end", async () => {
    const admin = await createAccount(`admin-${suffix}`);
    const ada = await createAccount(`ada-${suffix}`, `ada-${suffix}@example.org`);
    const bob = await createAccount(`bob-${suffix}`);

    const me = await admin.me();
    expect(me.user.username).toBe(`admin-${suffix}`);
    expect(me.scopes.sort()).toEqual(["read:projects", "write:projects"]);

    const org = await admin.createOrganization({
      slug: `lab-${suffix}`,
      name: "Lab",
      publicSharingPolicy: "publishers",
      defaultVisibility: "organization",
      categories: ["hydrology"],
    });
    expect(org.role).toBe("administrator");
    expect((await admin.myOrganizations()).map((item) => item.id)).toContain(org.id);

    const updated = await admin.updateOrganization(org.id, { name: "Lab Two", categories: [] });
    expect(updated.name).toBe("Lab Two");

    // Direct add, role change, and the last-administrator guard.
    await admin.setOrganizationMember(org.id, `bob-${suffix}`, "viewer");
    await admin.setOrganizationMember(org.id, `bob-${suffix}`, "publisher");
    const members = await admin.organizationMembers(org.id);
    expect(members.find((member) => member.username === `bob-${suffix}`)?.role).toBe("publisher");
    await expect(admin.setOrganizationMember(org.id, `admin-${suffix}`, "member")).rejects.toMatchObject({ status: 409 });

    // Invitation by email, accepted by the invitee.
    const invitation = await admin.inviteToOrganization(org.id, { email: `ada-${suffix}@example.org` }, "member");
    expect(invitation.token).toBeTruthy();
    expect((await admin.organizationInvitations(org.id)).find((item) => item.id === invitation.id)?.token).toBeUndefined();
    await ada.acceptOrganizationInvitation(invitation.token!);
    expect((await ada.myOrganizations()).find((item) => item.id === org.id)?.role).toBe("member");

    // A revoked invitation can't be accepted.
    const third = await createAccount(`cy-${suffix}`);
    const revoked = await admin.inviteToOrganization(org.id, { username: `cy-${suffix}` }, "viewer");
    await admin.revokeOrganizationInvitation(org.id, revoked.id);
    await expect(third.acceptOrganizationInvitation(revoked.token!)).rejects.toMatchObject({ status: 404 });

    // Non-administrators can't manage.
    await expect(ada.organizationInvitations(org.id)).rejects.toMatchObject({ status: 403 });

    await bob.removeOrganizationMember(org.id, "me");
    await admin.removeOrganizationMember(org.id, `ada-${suffix}`);
    expect((await admin.organizationMembers(org.id)).map((member) => member.username)).toEqual([`admin-${suffix}`]);
    expect(await admin.organizationProjects(org.id)).toEqual([]);

    await admin.deleteOrganization(org.id);
    expect((await admin.myOrganizations()).map((item) => item.id)).not.toContain(org.id);

    await Promise.all([admin.signOut(), ada.signOut(), bob.signOut(), third.signOut()]);
  });

  it("configures an organization identity provider", async () => {
    const admin = await createAccount(`sso-admin-${suffix}`);
    const pat = await createAccount(`sso-member-${suffix}`);
    const org = await admin.createOrganization({
      slug: `sso-${suffix}`,
      name: "SSO organization",
      publicSharingPolicy: "publishers",
      defaultVisibility: "organization",
      categories: [],
    });
    await admin.setOrganizationMember(org.id, `sso-member-${suffix}`, "member");
    expect(await admin.identityProvider(org.id)).toBeNull();

    const body: IdentityProviderBody = {
      issuer: "https://idp.example.org/realms/acme",
      authorizationEndpoint: "https://idp.example.org/realms/acme/protocol/openid-connect/auth",
      tokenEndpoint: "https://idp.example.org/realms/acme/protocol/openid-connect/token",
      jwksUri: "https://idp.example.org/realms/acme/protocol/openid-connect/certs",
      clientId: "geolibre",
      clientSecret: "s3cret",
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
    const created = await admin.setIdentityProvider(org.id, body);
    expect(created).toMatchObject({
      protocol: "oidc",
      clientSecretSet: true,
      issuer: body.issuer,
      authorizationEndpoint: body.authorizationEndpoint,
      tokenEndpoint: body.tokenEndpoint,
      jwksUri: body.jwksUri,
    });
    expect(created).not.toHaveProperty("clientSecret");

    const updated = await admin.setIdentityProvider(org.id, {
      ...body,
      clientSecret: undefined,
      scopes: ["openid", "email"],
    });
    expect(updated.scopes).toEqual(["openid", "email"]);
    expect(updated.clientSecretSet).toBe(true);

    await expect(admin.setIdentityProvider(org.id, {
      ...body,
      clientSecret: undefined,
      allowBuiltinAccounts: false,
      breakGlassUsername: null,
    })).rejects.toMatchObject({ status: 422 });
    const withBreakGlass = await admin.setIdentityProvider(org.id, {
      ...body,
      clientSecret: undefined,
      allowBuiltinAccounts: false,
      breakGlassUsername: `sso-admin-${suffix}`,
    });
    expect(withBreakGlass.breakGlassUsername).toBe(`sso-admin-${suffix}`);

    await expect(admin.setIdentityProvider(org.id, {
      ...body,
      clientSecret: undefined,
      allowBuiltinAccounts: false,
      breakGlassUsername: `sso-admin-${suffix}`,
      groupMappings: [{ value: "x", groupId: "00000000-0000-0000-0000-000000000000" }],
    })).rejects.toMatchObject({
      status: 422,
      message: "group mapping must name a group in this organization",
    });
    await expect(pat.identityProvider(org.id)).rejects.toMatchObject({ status: 403 });

    await admin.deleteIdentityProvider(org.id);
    expect(await admin.identityProvider(org.id)).toBeNull();
    await admin.deleteOrganization(org.id);
    await Promise.all([admin.signOut(), pat.signOut()]);
  });

  it("manages a group end to end", async () => {
    const owner = await createAccount(`owner-${suffix}`);
    const kim = await createAccount(`kim-${suffix}`);
    const lee = await createAccount(`lee-${suffix}`);

    const group = await owner.createGroup({
      name: "Field team",
      description: "Survey crew",
      organizationId: null,
      joinPolicy: "request",
      sharedUpdate: true,
    });
    expect(group.role).toBe("owner");
    expect(group.sharedUpdate).toBe(true);

    expect((await owner.updateGroup(group.id, { joinPolicy: "request", description: "Crew" })).description).toBe("Crew");

    // Join request, then approval.
    const response = await fetch(`${baseUrl}/api/groups/${group.id}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kim.credential}` },
    });
    expect(response.status).toBe(204);
    expect((await owner.groupMembers(group.id)).find((member) => member.username === `kim-${suffix}`)?.status).toBe("pending");
    await owner.decideJoinRequest(group.id, `kim-${suffix}`, "accept");
    expect((await kim.myGroups()).map((item) => item.id)).toContain(group.id);

    // Invitation as manager, accepted.
    const invitation = await owner.inviteToGroup(group.id, { username: `lee-${suffix}` }, "manager");
    await lee.acceptGroupInvitation(invitation.token!);
    expect((await lee.myGroups()).find((item) => item.id === group.id)?.role).toBe("manager");

    // A manager can't promote to manager; the owner can't be removed.
    await expect(lee.setGroupMember(group.id, `kim-${suffix}`, "manager")).rejects.toMatchObject({ status: 403 });
    await expect(owner.removeGroupMember(group.id, `owner-${suffix}`)).rejects.toMatchObject({ status: 409 });

    // Ownership transfer demotes the previous owner to manager.
    await owner.setGroupMember(group.id, `lee-${suffix}`, "owner");
    const members = await lee.groupMembers(group.id);
    expect(members.find((member) => member.username === `owner-${suffix}`)?.role).toBe("manager");
    expect(await lee.groupProjects(group.id)).toEqual([]);

    await lee.deleteGroup(group.id);
    expect((await kim.myGroups()).map((item) => item.id)).not.toContain(group.id);

    await Promise.all([owner.signOut(), kim.signOut(), lee.signOut()]);
  });

  it("revokes the admin token on sign-out", async () => {
    const user = await createAccount(`gone-${suffix}`);
    const token = user.credential!;
    await user.signOut();
    const stale = new GeoLibreServer(baseUrl!, token);
    await expect(stale.me()).rejects.toMatchObject({ status: 401 });
  });
});
