/**
 * Typed client for the organization, group, and identity routes of the
 * GeoLibre projects server contract (`docs/server-api.md`, version 1).
 */

export type OrganizationRole = "administrator" | "publisher" | "member" | "viewer";
export type PublicSharingPolicy = "yes" | "publishers" | "no";
export type Visibility = "public" | "unlisted" | "private" | "organization";
export type JoinPolicy = "invite" | "request" | "open";
export type GroupRole = "owner" | "manager" | "member";

export const ORGANIZATION_ROLES: OrganizationRole[] = ["administrator", "publisher", "member", "viewer"];
export const SHARING_POLICIES: PublicSharingPolicy[] = ["yes", "publishers", "no"];
export const VISIBILITIES: Visibility[] = ["public", "unlisted", "private", "organization"];
export const JOIN_POLICIES: JoinPolicy[] = ["invite", "request", "open"];
export const GROUP_ROLES: GroupRole[] = ["owner", "manager", "member"];

export interface Account {
  id: string;
  username: string | null;
  email?: string | null;
  createdAt: string;
}

export interface Me {
  user: Account;
  sessionId: string | null;
  scopes: string[];
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  publicSharingPolicy: PublicSharingPolicy;
  defaultVisibility: Visibility;
  categories: string[];
  role?: OrganizationRole;
}

export interface Member {
  id: string;
  username: string | null;
  role: string;
  status: "accepted" | "pending";
  createdAt: string;
}

export interface Invitation {
  id: string;
  username: string | null;
  email: string | null;
  role: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  organizationId?: string;
  groupId?: string;
  /** Present only in the creation response. */
  token?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  organizationId: string | null;
  ownerId: string;
  joinPolicy: JoinPolicy;
  sharedUpdate: boolean;
  thumbnailUrl: string | null;
  role: GroupRole | null;
  membershipStatus: "accepted" | "pending" | null;
  createdAt: string;
}

export interface Project {
  id: string;
  username: string | null;
  slug: string;
  title: string;
  visibility: Visibility;
  updatedAt: string;
  projectUrl?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Scopes the admin token asks for: read and manage, never `share:public`. */
export const ADMIN_SCOPES = ["read:projects", "write:projects"];

/**
 * Normalize a server URL the user typed: trim, add `https://` when no
 * scheme is given, and drop a trailing slash.
 *
 * @param value - The URL as typed.
 * @returns The base URL requests are resolved against.
 */
export function normalizeBaseUrl(value: string): string {
  let url = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export class GeoLibreServer {
  readonly baseUrl: string;
  private token: string | null;
  private readonly fetchImpl: typeof fetch;

  /**
   * @param baseUrl - The projects server root.
   * @param token - A Bearer token, or null before sign-in.
   * @param fetchImpl - Injected for tests; defaults to the global fetch.
   */
  constructor(baseUrl: string, token: string | null = null, fetchImpl?: typeof fetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.fetchImpl = fetchImpl ?? ((...args) => fetch(...args));
  }

  /** The current Bearer token, if signed in. */
  get credential(): string | null {
    return this.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
      });
    } catch {
      throw new ApiError(
        0,
        `Could not reach ${this.baseUrl}. Check the URL, and that the server allows this origin (GEOLIBRE_CORS_ORIGINS).`,
      );
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body; handled below.
    }
    if (!response.ok) {
      const error = (data as { error?: unknown; requiredScope?: string } | null) ?? {};
      let message = typeof error.error === "string" ? error.error : `HTTP ${response.status}`;
      if (message === "insufficient_scope" && error.requiredScope) {
        message = `This token lacks the ${error.requiredScope} scope.`;
      }
      throw new ApiError(response.status, message);
    }
    return data as T;
  }

  /**
   * Exchange a username and password for a short-lived personal token that
   * carries only the read and write scopes.
   *
   * @param username - Account username.
   * @param password - Account password.
   * @returns The token and its expiry.
   */
  async signIn(username: string, password: string): Promise<{ token: string; expiresAt: string | null }> {
    const result = await this.request<{ token: string; expiresAt: string | null }>(
      "POST",
      "/api/auth/token",
      { username, password, name: "GeoLibre Admin", scopes: ADMIN_SCOPES, expiresInDays: 1 },
    );
    this.token = result.token;
    return result;
  }

  /** Revoke the current token on the server. */
  async signOut(): Promise<void> {
    if (!this.token) return;
    try {
      await this.request<void>("DELETE", "/api/auth/token");
    } finally {
      this.token = null;
    }
  }

  me(): Promise<Me> {
    return this.request("GET", "/api/users/me");
  }

  // Organizations

  async myOrganizations(): Promise<Organization[]> {
    return (await this.request<{ organizations: Organization[] }>("GET", "/api/organizations/mine"))
      .organizations;
  }

  async createOrganization(body: {
    slug: string;
    name: string;
    publicSharingPolicy: PublicSharingPolicy;
    defaultVisibility: Visibility;
    categories: string[];
  }): Promise<Organization> {
    return (await this.request<{ organization: Organization }>("POST", "/api/organizations", body))
      .organization;
  }

  async updateOrganization(
    id: string,
    patch: Partial<Pick<Organization, "name" | "publicSharingPolicy" | "defaultVisibility" | "categories">>,
  ): Promise<Organization> {
    return (
      await this.request<{ organization: Organization }>(
        "PATCH",
        `/api/organizations/${encodeURIComponent(id)}`,
        patch,
      )
    ).organization;
  }

  deleteOrganization(id: string): Promise<void> {
    return this.request("DELETE", `/api/organizations/${encodeURIComponent(id)}`);
  }

  async organizationMembers(id: string): Promise<Member[]> {
    return (
      await this.request<{ members: Member[] }>("GET", `/api/organizations/${encodeURIComponent(id)}/members`)
    ).members;
  }

  async setOrganizationMember(id: string, username: string, role: OrganizationRole): Promise<Member> {
    return (
      await this.request<{ member: Member }>("PUT", `/api/organizations/${encodeURIComponent(id)}/members`, {
        username,
        role,
      })
    ).member;
  }

  removeOrganizationMember(id: string, username: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(username)}`,
    );
  }

  async organizationInvitations(id: string): Promise<Invitation[]> {
    return (
      await this.request<{ invitations: Invitation[] }>(
        "GET",
        `/api/organizations/${encodeURIComponent(id)}/invitations`,
      )
    ).invitations;
  }

  async inviteToOrganization(
    id: string,
    target: { username: string } | { email: string },
    role: OrganizationRole,
  ): Promise<Invitation> {
    return (
      await this.request<{ invitation: Invitation }>(
        "POST",
        `/api/organizations/${encodeURIComponent(id)}/invitations`,
        { ...target, role },
      )
    ).invitation;
  }

  revokeOrganizationInvitation(id: string, invitationId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/organizations/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`,
    );
  }

  acceptOrganizationInvitation(token: string): Promise<void> {
    return this.request("POST", `/api/organizations/invitations/${encodeURIComponent(token)}/accept`);
  }

  async organizationProjects(id: string): Promise<Project[]> {
    return (
      await this.request<{ projects: Project[] }>(
        "GET",
        `/api/organizations/${encodeURIComponent(id)}/projects?limit=100`,
      )
    ).projects;
  }

  // Groups

  async myGroups(): Promise<Group[]> {
    return (await this.request<{ groups: Group[] }>("GET", "/api/groups/mine")).groups;
  }

  async createGroup(body: {
    name: string;
    description: string;
    organizationId: string | null;
    joinPolicy: JoinPolicy;
    sharedUpdate: boolean;
  }): Promise<Group> {
    return (await this.request<{ group: Group }>("POST", "/api/groups", body)).group;
  }

  async updateGroup(
    id: string,
    patch: Partial<Pick<Group, "name" | "description" | "joinPolicy">>,
  ): Promise<Group> {
    return (await this.request<{ group: Group }>("PATCH", `/api/groups/${encodeURIComponent(id)}`, patch))
      .group;
  }

  deleteGroup(id: string): Promise<void> {
    return this.request("DELETE", `/api/groups/${encodeURIComponent(id)}`);
  }

  async groupMembers(id: string): Promise<Member[]> {
    return (await this.request<{ members: Member[] }>("GET", `/api/groups/${encodeURIComponent(id)}/members`))
      .members;
  }

  async setGroupMember(id: string, username: string, role: GroupRole): Promise<Member> {
    return (
      await this.request<{ member: Member }>("PUT", `/api/groups/${encodeURIComponent(id)}/members`, {
        username,
        role,
      })
    ).member;
  }

  removeGroupMember(id: string, username: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(username)}`,
    );
  }

  decideJoinRequest(id: string, username: string, decision: "accept" | "reject"): Promise<void> {
    return this.request(
      "POST",
      `/api/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(username)}/decide`,
      { decision },
    );
  }

  async groupInvitations(id: string): Promise<Invitation[]> {
    return (
      await this.request<{ invitations: Invitation[] }>("GET", `/api/groups/${encodeURIComponent(id)}/invitations`)
    ).invitations;
  }

  async inviteToGroup(
    id: string,
    target: { username: string } | { email: string },
    role: Exclude<GroupRole, "owner">,
  ): Promise<Invitation> {
    return (
      await this.request<{ invitation: Invitation }>(
        "POST",
        `/api/groups/${encodeURIComponent(id)}/invitations`,
        { ...target, role },
      )
    ).invitation;
  }

  revokeGroupInvitation(id: string, invitationId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/groups/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`,
    );
  }

  acceptGroupInvitation(token: string): Promise<void> {
    return this.request("POST", `/api/groups/invitations/${encodeURIComponent(token)}/accept`);
  }

  async groupProjects(id: string): Promise<Project[]> {
    return (
      await this.request<{ projects: Project[] }>("GET", `/api/groups/${encodeURIComponent(id)}/projects?limit=100`)
    ).projects;
  }

  removeGroupProject(id: string, projectId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/groups/${encodeURIComponent(id)}/projects/${encodeURIComponent(projectId)}`,
    );
  }
}
