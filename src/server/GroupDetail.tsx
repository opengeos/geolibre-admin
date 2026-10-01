import { useState } from "react";
import {
  GROUP_ROLES,
  JOIN_POLICIES,
  type GeoLibreServer,
  type Group,
  type GroupRole,
  type JoinPolicy,
  type Organization,
} from "../api/client";
import { Badge, Button, Card, Checkbox, ConfirmButton, Field, Input, Notice, Select, Textarea, cx } from "../components/ui";
import { InvitationsPanel, LoadState, MembersPanel, ProjectsPanel } from "./panels";
import { useAction, useAsync } from "./useAsync";

export const JOIN_TEXT: Record<JoinPolicy, string> = {
  invite: "Invitation only",
  request: "Anyone eligible may request to join; a manager approves",
  open: "Anyone eligible joins immediately",
};

export function GroupSettingsForm({
  initial,
  organizations,
  submitLabel,
  onSubmit,
}: {
  initial?: Group;
  organizations: Organization[];
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    description: string;
    organizationId: string | null;
    joinPolicy: JoinPolicy;
    sharedUpdate: boolean;
  }) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [organizationId, setOrganizationId] = useState<string>(initial?.organizationId ?? "");
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(initial?.joinPolicy ?? "invite");
  const [sharedUpdate, setSharedUpdate] = useState(initial?.sharedUpdate ?? false);
  const { run, busy, error } = useAction();
  const [saved, setSaved] = useState(false);
  // A viewer can't create organization content, so it can't own an org group.
  const eligible = organizations.filter((org) => org.role && org.role !== "viewer");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        const ok = await run(() =>
          onSubmit({ name: name.trim(), description, organizationId: organizationId || null, joinPolicy, sharedUpdate }),
        );
        if (ok) setSaved(true);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          {(id) => <Input id={id} value={name} maxLength={100} placeholder="Field team" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Join policy" hint={JOIN_TEXT[joinPolicy]}>
          {(id) => (
            <Select id={id} value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as JoinPolicy)}>
              {JOIN_POLICIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {!initial ? (
          <Field label="Organization" hint="An organization group admits only that organization's members. Fixed at creation.">
            {(id) => (
              <Select id={id} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                <option value="">None (standalone group)</option>
                {eligible.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>
      <Field label="Description">
        {(id) => (
          <Textarea id={id} rows={3} maxLength={2000} className="font-sans text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </Field>
      {!initial ? (
        <Checkbox
          checked={sharedUpdate}
          onChange={setSharedUpdate}
          label="Members can update projects shared with the group"
          description="Shared update can't be changed after the group is created."
        />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved && initial ? <Notice tone="ok">Saved.</Notice> : null}
      <div>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

type Tab = "members" | "invitations" | "projects" | "settings";

export function GroupDetail({
  server,
  group,
  organizations,
  selfUsername,
  onChanged,
  onDeleted,
}: {
  server: GeoLibreServer;
  group: Group;
  organizations: Organization[];
  selfUsername: string | null;
  onChanged: (group: Group) => void;
  onDeleted: () => void;
}) {
  const isOwner = group.role === "owner";
  const canManage = isOwner || group.role === "manager";
  const tabs: Tab[] = canManage ? ["members", "invitations", "projects", "settings"] : ["members", "projects"];
  const [tab, setTab] = useState<Tab>("members");
  const members = useAsync(() => server.groupMembers(group.id), [server, group.id]);
  const invitations = useAsync(
    () => (canManage ? server.groupInvitations(group.id) : Promise.resolve([])),
    [server, group.id, canManage],
  );
  const projects = useAsync(() => server.groupProjects(group.id), [server, group.id]);
  const remove = useAction();
  const leave = useAction();
  const organization = organizations.find((org) => org.id === group.organizationId);
  const pendingCount = members.data?.filter((member) => member.status === "pending").length ?? 0;
  const assignable: GroupRole[] = isOwner ? GROUP_ROLES : ["member"];

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {group.name} <Badge tone="accent">{group.role}</Badge>
          {group.sharedUpdate ? <Badge tone="warning">shared update</Badge> : null}
        </span>
      }
      description={
        <>
          {organization ? `${organization.name} group` : group.organizationId ? "Organization group" : "Standalone group"} ·{" "}
          {JOIN_TEXT[group.joinPolicy].toLowerCase()}
          {group.description ? <span className="mt-1 block">{group.description}</span> : null}
        </>
      }
    >
      <div role="tablist" aria-label="Group sections" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm capitalize",
              tab === option ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {option}
            {option === "members" && pendingCount ? (
              <span className="ms-1.5 rounded bg-warning-soft px-1.5 text-xs text-warning">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "members" ? (
        <>
          <LoadState loading={members.loading && !members.data} error={members.error} onRetry={members.reload} />
          {members.data ? (
            <MembersPanel<GroupRole>
              members={members.data}
              roles={GROUP_ROLES}
              assignableRoles={assignable}
              canManage={canManage}
              selfUsername={selfUsername}
              protectedRole="owner"
              onSetRole={async (username, role) => {
                await server.setGroupMember(group.id, username, role);
                await members.reload();
                // Transferring ownership demotes the caller to manager.
                if (role === "owner") onChanged({ ...group, role: "manager" });
              }}
              onRemove={async (username) => {
                await server.removeGroupMember(group.id, username);
                await members.reload();
              }}
              onDecide={async (username, decision) => {
                await server.decideJoinRequest(group.id, username, decision);
                await members.reload();
              }}
            />
          ) : null}
          {isOwner ? (
            <p className="mt-3 text-xs text-muted">
              To transfer ownership, add or change a member with the owner role; you become a manager.
            </p>
          ) : null}
          {!isOwner ? (
            <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
              {leave.error ? <Notice tone="danger">{leave.error}</Notice> : null}
              <div>
                <ConfirmButton
                  confirmLabel="Leave? Click again"
                  disabled={leave.busy}
                  onConfirm={() =>
                    leave.run(async () => {
                      await server.removeGroupMember(group.id, "me");
                      onDeleted();
                    })
                  }
                >
                  Leave group
                </ConfirmButton>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "invitations" && canManage ? (
        <>
          <LoadState loading={invitations.loading && !invitations.data} error={invitations.error} onRetry={invitations.reload} />
          {invitations.data ? (
            <InvitationsPanel<Exclude<GroupRole, "owner">>
              invitations={invitations.data}
              roles={isOwner ? ["manager", "member"] : ["member"]}
              acceptPath="/api/groups/invitations/{token}/accept"
              onInvite={async (target, role) => {
                const invitation = await server.inviteToGroup(group.id, target, role);
                await invitations.reload();
                return invitation;
              }}
              onRevoke={async (id) => {
                await server.revokeGroupInvitation(group.id, id);
                await invitations.reload();
              }}
            />
          ) : null}
        </>
      ) : null}

      {tab === "projects" ? (
        <>
          <LoadState loading={projects.loading && !projects.data} error={projects.error} onRetry={projects.reload} />
          {projects.data ? (
            <ProjectsPanel
              projects={projects.data}
              emptyText="No projects are shared with this group."
              onRemove={
                canManage
                  ? async (id) => {
                      await server.removeGroupProject(group.id, id);
                      await projects.reload();
                    }
                  : undefined
              }
            />
          ) : null}
        </>
      ) : null}

      {tab === "settings" && canManage ? (
        <div className="flex flex-col gap-8">
          <GroupSettingsForm
            initial={group}
            organizations={organizations}
            submitLabel="Save settings"
            onSubmit={async (values) => {
              const updated = await server.updateGroup(group.id, {
                name: values.name,
                description: values.description,
                joinPolicy: values.joinPolicy,
              });
              onChanged(updated);
            }}
          />
          {isOwner ? (
            <section className="flex flex-col gap-3 rounded-md border border-danger/40 p-4">
              <h3 className="font-semibold text-danger">Delete group</h3>
              <p className="text-sm text-muted">
                Deletes the group with its memberships, invitations, and thumbnail. Shared projects are kept and only lose
                this group as a target.
              </p>
              {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}
              <div>
                <ConfirmButton
                  confirmLabel="Delete permanently?"
                  disabled={remove.busy}
                  onConfirm={() =>
                    remove.run(async () => {
                      await server.deleteGroup(group.id);
                      onDeleted();
                    })
                  }
                >
                  Delete group
                </ConfirmButton>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
