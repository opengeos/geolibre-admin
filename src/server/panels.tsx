import { useState } from "react";
import type { Invitation, Member, Project } from "../api/client";
import { Badge, Button, ConfirmButton, CopyButton, Field, Input, Notice, Select, Spinner } from "../components/ui";
import { useAction } from "./useAsync";

/** Format an ISO timestamp for display in the viewer's locale. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Prefer the plain `member` role for new members and invitations. */
function defaultRole<Role extends string>(roles: Role[]): Role {
  return roles.find((role) => role === "member") ?? roles[roles.length - 1];
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <Notice tone="danger">
        {error}{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </Notice>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  return null;
}

export function MembersPanel<Role extends string>({
  members,
  roles,
  assignableRoles = roles,
  canManage,
  selfUsername,
  onSetRole,
  onRemove,
  onDecide,
  protectedRole,
}: {
  members: Member[];
  roles: Role[];
  /** Roles the caller may assign (a group manager can't make managers). */
  assignableRoles?: Role[];
  canManage: boolean;
  selfUsername: string | null;
  onSetRole: (username: string, role: Role) => Promise<unknown>;
  onRemove: (username: string) => Promise<unknown>;
  onDecide?: (username: string, decision: "accept" | "reject") => Promise<unknown>;
  /** A role that can't be changed or removed in place (the group owner). */
  protectedRole?: Role;
}) {
  const { run, busy, error } = useAction();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>(defaultRole(assignableRoles.length ? assignableRoles : roles));
  const accepted = members.filter((member) => member.status !== "pending");
  const pending = members.filter((member) => member.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {pending.length && onDecide ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Join requests</h3>
          <ul className="flex flex-col gap-1.5">
            {pending.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft px-3 py-2">
                <span className="font-medium">{member.username}</span>
                <span className="flex gap-1.5">
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => onDecide(member.username!, "accept"))}>
                    Accept
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => run(() => onDecide(member.username!, "reject"))}>
                    Reject
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-start text-xs text-muted">
            <tr className="border-b border-border">
              <th className="py-2 pe-3 text-start font-medium">Member</th>
              <th className="py-2 pe-3 text-start font-medium">Role</th>
              <th className="py-2 pe-3 text-start font-medium">Since</th>
              <th className="py-2 text-end font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accepted.map((member) => {
              const name = member.username ?? "(no username)";
              const locked = !canManage || !member.username || member.role === protectedRole;
              return (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="py-2 pe-3">
                    {name} {member.username === selfUsername ? <Badge tone="accent">you</Badge> : null}
                  </td>
                  <td className="py-2 pe-3">
                    {locked ? (
                      <Badge>{member.role}</Badge>
                    ) : (
                      <Select
                        aria-label={`Role for ${name}`}
                        className="h-8 w-40"
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => run(() => onSetRole(member.username!, event.target.value as Role))}
                      >
                        {roles
                          .filter((option) => option === member.role || assignableRoles.includes(option))
                          .map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                      </Select>
                    )}
                  </td>
                  <td className="py-2 pe-3 text-muted">{formatDate(member.createdAt)}</td>
                  <td className="py-2 text-end">
                    {!locked ? (
                      <ConfirmButton size="sm" confirmLabel="Remove?" disabled={busy} onConfirm={() => run(() => onRemove(member.username!))}>
                        Remove
                      </ConfirmButton>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <form
          className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => onSetRole(username.trim().toLowerCase(), role))) setUsername("");
          }}
        >
          <div className="flex-1">
            <Field label="Add an existing account">
              {(id) => <Input id={id} value={username} placeholder="username" onChange={(e) => setUsername(e.target.value)} />}
            </Field>
          </div>
          <Select aria-label="Role for the new member" className="sm:w-40" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {assignableRoles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" disabled={!username.trim() || busy}>
            Add member
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function InvitationsPanel<Role extends string>({
  invitations,
  roles,
  onInvite,
  onRevoke,
  acceptPath,
}: {
  invitations: Invitation[];
  roles: Role[];
  onInvite: (target: { username: string } | { email: string }, role: Role) => Promise<Invitation>;
  onRevoke: (id: string) => Promise<unknown>;
  /** The accept route, shown with the new token, e.g. `/api/groups/invitations/{token}/accept`. */
  acceptPath: string;
}) {
  const { run, busy, error } = useAction();
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<Role>(defaultRole(roles));
  const [created, setCreated] = useState<Invitation | null>(null);
  const isEmail = target.includes("@");
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  const past = invitations.filter((invitation) => invitation.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <form
        className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          const value = target.trim();
          await run(async () => {
            const invitation = await onInvite(isEmail ? { email: value } : { username: value.toLowerCase() }, role);
            setCreated(invitation);
            setTarget("");
          });
        }}
      >
        <div className="flex-1">
          <Field label="Invite by username or email">
            {(id) => <Input id={id} value={target} placeholder="ada or ada@example.org" onChange={(e) => setTarget(e.target.value)} />}
          </Field>
        </div>
        <Select aria-label="Invited role" className="sm:w-40" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" disabled={!target.trim() || busy}>
          Create invitation
        </Button>
      </form>

      {created?.token ? (
        <Notice tone="ok">
          <div className="flex flex-col gap-2">
            <span>
              Invitation created for <strong>{created.username ?? created.email}</strong>. Send them this token now: it
              isn't shown again. They accept it from this app's “Accept an invitation” box or by calling{" "}
              <code className="break-all">POST {acceptPath.replace("{token}", "…")}</code>.
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface px-2 py-1 font-mono text-xs break-all" data-testid="invitation-token">
                {created.token}
              </code>
              <CopyButton text={created.token} />
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </span>
          </div>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold">Pending</h3>
        {pending.length ? (
          <ul className="flex flex-col gap-1.5">
            {pending.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>
                  {invitation.username ?? invitation.email} <Badge>{invitation.role}</Badge>{" "}
                  <span className="text-xs text-muted">sent {formatDate(invitation.createdAt)}</span>
                </span>
                <ConfirmButton size="sm" confirmLabel="Revoke?" disabled={busy} onConfirm={() => run(() => onRevoke(invitation.id))}>
                  Revoke
                </ConfirmButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No pending invitations.</p>
        )}
      </div>
      {past.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">History ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {past.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap gap-2 text-xs">
                <span>{invitation.username ?? invitation.email}</span>
                <Badge tone={invitation.status === "accepted" ? "ok" : "neutral"}>{invitation.status}</Badge>
                <span className="text-muted">{formatDate(invitation.acceptedAt ?? invitation.revokedAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function ProjectsPanel({
  projects,
  onRemove,
  emptyText,
}: {
  projects: Project[];
  onRemove?: (id: string) => Promise<unknown>;
  emptyText: string;
}) {
  const { run, busy, error } = useAction();
  if (!projects.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-2">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ul className="flex flex-col gap-1.5">
        {projects.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <span className="min-w-0">
              {project.projectUrl ? (
                <a className="font-medium text-accent hover:underline" href={project.projectUrl} target="_blank" rel="noreferrer">
                  {project.title}
                </a>
              ) : (
                <span className="font-medium">{project.title}</span>
              )}{" "}
              <Badge>{project.visibility}</Badge>
              <span className="block text-xs text-muted">Updated {formatDate(project.updatedAt)}</span>
            </span>
            {onRemove ? (
              <ConfirmButton size="sm" confirmLabel="Unshare?" disabled={busy} onConfirm={() => run(() => onRemove(project.id))}>
                Remove from group
              </ConfirmButton>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
