import { useState, type ReactNode } from "react";
import type { Group, Organization } from "../api/client";
import { Badge, Button, Card, Field, Input, Notice, Select, Spinner, cx } from "../components/ui";
import { ConnectForm } from "./ConnectForm";
import { GroupDetail, GroupSettingsForm } from "./GroupDetail";
import { OrganizationDetail, OrganizationSettingsForm } from "./OrganizationDetail";
import { LoadState } from "./panels";
import type { Session } from "./session";
import { useAction, useAsync } from "./useAsync";

type Selection =
  | { kind: "organization"; id: string }
  | { kind: "group"; id: string }
  | { kind: "new-organization" }
  | { kind: "new-group" }
  | { kind: "accept" }
  | null;

function AcceptInvitation({ session, onAccepted }: { session: Session; onAccepted: () => void }) {
  const [token, setToken] = useState("");
  const [type, setType] = useState<"organization" | "group">("organization");
  const { run, busy, error } = useAction();
  const [done, setDone] = useState(false);
  return (
    <Card title="Accept an invitation" description="Join an organization or group with the token an administrator sent you.">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setDone(false);
          const ok = await run(() =>
            type === "organization"
              ? session.server.acceptOrganizationInvitation(token.trim())
              : session.server.acceptGroupInvitation(token.trim()),
          );
          if (ok) {
            setDone(true);
            setToken("");
            onAccepted();
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Invitation to">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as "organization" | "group")}>
                <option value="organization">An organization</option>
                <option value="group">A group</option>
              </Select>
            )}
          </Field>
          <Field label="Token">
            {(id) => <Input id={id} value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />}
          </Field>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {done ? <Notice tone="ok">Invitation accepted.</Notice> : null}
        <div>
          <Button type="submit" variant="primary" disabled={!token.trim() || busy}>
            Accept invitation
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SidebarItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active}
      onClick={onClick}
      className={cx(
        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-start text-sm",
        active ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Console({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { server, me } = session;
  const organizations = useAsync(() => server.myOrganizations(), [server]);
  const groups = useAsync(() => server.myGroups(), [server]);
  const [selection, setSelection] = useState<Selection>(null);
  const canWrite = me.scopes.includes("write:projects");

  const reloadAll = () => {
    void organizations.reload();
    void groups.reload();
  };

  const orgList = organizations.data ?? [];
  const groupList = groups.data ?? [];
  const selectedOrg =
    selection?.kind === "organization" ? orgList.find((org) => org.id === selection.id) : undefined;
  const selectedGroup = selection?.kind === "group" ? groupList.find((group) => group.id === selection.id) : undefined;
  const authError = [organizations.error, groups.error].find(Boolean);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="truncate font-medium" title={server.baseUrl}>
            {server.baseUrl.replace(/^https?:\/\//, "")}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted">
            Signed in as <strong className="text-text">{me.user.username ?? me.user.email ?? me.user.id}</strong>
          </div>
          {!canWrite ? (
            <div className="mt-2">
              <Badge tone="warning">read-only token</Badge>
            </div>
          ) : null}
          <Button size="sm" className="mt-3 w-full" onClick={onSignOut}>
            Sign out
          </Button>
        </div>

        <nav aria-label="Organizations" className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Organizations</h2>
            {organizations.loading ? <Spinner /> : null}
          </div>
          {orgList.map((org) => (
            <SidebarItem
              key={org.id}
              active={selection?.kind === "organization" && selection.id === org.id}
              onClick={() => setSelection({ kind: "organization", id: org.id })}
            >
              <span className="truncate">{org.name}</span>
              <span className="shrink-0 text-xs">{org.role}</span>
            </SidebarItem>
          ))}
          {!organizations.loading && !orgList.length ? <p className="px-3 text-xs text-muted">None yet.</p> : null}
          {canWrite ? (
            <SidebarItem active={selection?.kind === "new-organization"} onClick={() => setSelection({ kind: "new-organization" })}>
              + New organization
            </SidebarItem>
          ) : null}
        </nav>

        <nav aria-label="Groups" className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Groups</h2>
            {groups.loading ? <Spinner /> : null}
          </div>
          {groupList.map((group) => (
            <SidebarItem
              key={group.id}
              active={selection?.kind === "group" && selection.id === group.id}
              onClick={() => setSelection({ kind: "group", id: group.id })}
            >
              <span className="truncate">{group.name}</span>
              <span className="shrink-0 text-xs">{group.role}</span>
            </SidebarItem>
          ))}
          {!groups.loading && !groupList.length ? <p className="px-3 text-xs text-muted">None yet.</p> : null}
          {canWrite ? (
            <SidebarItem active={selection?.kind === "new-group"} onClick={() => setSelection({ kind: "new-group" })}>
              + New group
            </SidebarItem>
          ) : null}
        </nav>

        {canWrite ? (
          <SidebarItem active={selection?.kind === "accept"} onClick={() => setSelection({ kind: "accept" })}>
            Accept an invitation
          </SidebarItem>
        ) : null}
      </aside>

      <div className="min-w-0">
        {authError ? (
          <div className="mb-4">
            <LoadState loading={false} error={authError} onRetry={reloadAll} />
          </div>
        ) : null}

        {selection === null ? (
          <Card title="Organizations and groups">
            <p className="text-sm text-muted">
              Pick an organization or group to manage its members, invitations, and settings. The list shows only the
              ones your account belongs to: the projects API has no server-wide administrator.
            </p>
          </Card>
        ) : null}

        {selectedOrg ? (
          <OrganizationDetail
            key={selectedOrg.id}
            server={server}
            organization={selectedOrg}
            groups={groupList.filter((group) => group.organizationId === selectedOrg.id)}
            selfUsername={me.user.username}
            onChanged={(updated: Organization) =>
              organizations.setData(orgList.map((org) => (org.id === updated.id ? updated : org)))
            }
            onDeleted={() => {
              setSelection(null);
              reloadAll();
            }}
          />
        ) : null}

        {selectedGroup ? (
          <GroupDetail
            key={selectedGroup.id}
            server={server}
            group={selectedGroup}
            organizations={orgList}
            selfUsername={me.user.username}
            onChanged={(updated: Group) =>
              groups.setData(groupList.map((group) => (group.id === updated.id ? updated : group)))
            }
            onDeleted={() => {
              setSelection(null);
              void groups.reload();
            }}
          />
        ) : null}

        {selection?.kind === "new-organization" ? (
          <Card title="New organization" description="You become its first administrator.">
            <OrganizationSettingsForm
              includeSlug
              submitLabel="Create organization"
              onSubmit={async (values) => {
                const created = await server.createOrganization(values);
                organizations.setData([...orgList, created].sort((a, b) => a.name.localeCompare(b.name)));
                setSelection({ kind: "organization", id: created.id });
              }}
            />
          </Card>
        ) : null}

        {selection?.kind === "new-group" ? (
          <Card title="New group" description="You become its owner.">
            <GroupSettingsForm
              organizations={orgList}
              submitLabel="Create group"
              onSubmit={async (values) => {
                const created = await server.createGroup(values);
                groups.setData([...groupList, created].sort((a, b) => a.name.localeCompare(b.name)));
                setSelection({ kind: "group", id: created.id });
              }}
            />
          </Card>
        ) : null}

        {selection?.kind === "accept" ? <AcceptInvitation session={session} onAccepted={reloadAll} /> : null}
      </div>
    </div>
  );
}

export function ServerConsole({
  session,
  restoring,
  onSignIn,
  onToken,
  onSignOut,
}: {
  session: Session | null;
  restoring: boolean;
  onSignIn: (url: string, username: string, password: string) => Promise<void>;
  onToken: (url: string, token: string) => Promise<void>;
  onSignOut: () => void;
}) {
  if (restoring) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Restoring session…
      </div>
    );
  }
  if (!session) return <ConnectForm onSignIn={onSignIn} onToken={onToken} />;
  return <Console session={session} onSignOut={onSignOut} />;
}
