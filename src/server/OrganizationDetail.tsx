import { useState } from "react";
import {
  ORGANIZATION_ROLES,
  SHARING_POLICIES,
  VISIBILITIES,
  type GeoLibreServer,
  type Group,
  type Organization,
  type OrganizationRole,
  type PublicSharingPolicy,
  type Visibility,
} from "../api/client";
import { Badge, Button, Card, ConfirmButton, Field, Input, Notice, Select, TagInput, cx } from "../components/ui";
import { IdentityProviderPanel } from "./IdentityProviderPanel";
import { InvitationsPanel, LoadState, MembersPanel, ProjectsPanel } from "./panels";
import { useAction, useAsync } from "./useAsync";

const POLICY_TEXT: Record<PublicSharingPolicy, string> = {
  yes: "Members and publishers may publish publicly",
  publishers: "Only publishers and administrators may publish publicly",
  no: "Nobody may publish publicly",
};

/**
 * The visibilities a default may take under a sharing policy: a `public`
 * default requires the `yes` policy.
 */
export function allowedDefaults(policy: PublicSharingPolicy): Visibility[] {
  return VISIBILITIES.filter((visibility) => visibility !== "public" || policy === "yes");
}

export function OrganizationSettingsForm({
  initial,
  submitLabel,
  includeSlug,
  onSubmit,
}: {
  initial?: Organization;
  submitLabel: string;
  includeSlug: boolean;
  onSubmit: (values: {
    slug: string;
    name: string;
    publicSharingPolicy: PublicSharingPolicy;
    defaultVisibility: Visibility;
    categories: string[];
  }) => Promise<unknown>;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [policy, setPolicy] = useState<PublicSharingPolicy>(initial?.publicSharingPolicy ?? "publishers");
  const [visibility, setVisibility] = useState<Visibility>(initial?.defaultVisibility ?? "organization");
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const { run, busy, error } = useAction();
  const [saved, setSaved] = useState(false);
  const slugValid = /^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/.test(slug);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        if (await run(() => onSubmit({ slug, name: name.trim(), publicSharingPolicy: policy, defaultVisibility: visibility, categories }))) {
          setSaved(true);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {includeSlug ? (
          <Field
            label="Slug"
            hint="Used in project URLs (/org/<slug>/…). 3–100 lowercase letters, digits, or hyphens; can't change later."
            error={slug && !slugValid ? "3–100 lowercase letters, digits, or hyphens, not starting or ending with a hyphen." : undefined}
          >
            {(id) => <Input id={id} value={slug} placeholder="watershed-lab" onChange={(e) => setSlug(e.target.value.toLowerCase())} />}
          </Field>
        ) : null}
        <Field label="Name">
          {(id) => <Input id={id} value={name} maxLength={100} placeholder="Watershed Lab" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Public sharing" hint={POLICY_TEXT[policy]}>
          {(id) => (
            <Select
              id={id}
              value={policy}
              onChange={(e) => {
                const next = e.target.value as PublicSharingPolicy;
                setPolicy(next);
                if (!allowedDefaults(next).includes(visibility)) setVisibility("organization");
              }}
            >
              {SHARING_POLICIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Default visibility" hint="Applied when a project is created without one.">
          {(id) => (
            <Select id={id} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              {allowedDefaults(policy).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Categories" hint="Optional gallery categories, up to 50.">
        {(id) => <TagInput id={id} values={categories} placeholder="hydrology" onChange={setCategories} />}
      </Field>
      {initial && policy !== initial.publicSharingPolicy && policy !== "yes" ? (
        <Notice tone="warning">
          Tightening the policy changes every public project whose creator can no longer publish it to organization
          visibility.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved && initial ? <Notice tone="ok">Saved.</Notice> : null}
      <div>
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || (includeSlug && !slugValid)}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

type Tab = "members" | "invitations" | "projects" | "sso" | "settings";

export function OrganizationDetail({
  server,
  organization,
  selfUsername,
  groups,
  onChanged,
  onDeleted,
}: {
  server: GeoLibreServer;
  organization: Organization;
  selfUsername: string | null;
  groups: Group[];
  onChanged: (organization: Organization) => void;
  onDeleted: () => void;
}) {
  const isAdmin = organization.role === "administrator";
  const tabs: Tab[] = isAdmin
    ? ["members", "invitations", "projects", "sso", "settings"]
    : ["members", "projects"];
  const [tab, setTab] = useState<Tab>("members");
  const members = useAsync(() => server.organizationMembers(organization.id), [server, organization.id]);
  const administrators = (members.data ?? [])
    .filter((member) => member.status === "accepted" && member.role === "administrator" && member.username)
    .map((member) => member.username!);
  const invitations = useAsync(
    () => (isAdmin ? server.organizationInvitations(organization.id) : Promise.resolve([])),
    [server, organization.id, isAdmin],
  );
  const projects = useAsync(() => server.organizationProjects(organization.id), [server, organization.id]);
  const remove = useAction();
  const leave = useAction();
  const [confirmSlug, setConfirmSlug] = useState("");

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {organization.name} <Badge tone="accent">{organization.role}</Badge>
        </span>
      }
      description={
        <>
          <code>{organization.slug}</code> · public sharing: {organization.publicSharingPolicy} · default:{" "}
          {organization.defaultVisibility}
        </>
      }
    >
      <div role="tablist" aria-label="Organization sections" className="mb-4 flex flex-wrap gap-1 border-b border-border">
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
            {option === "sso" ? "Single Sign-On" : option}
          </button>
        ))}
      </div>

      {tab === "members" ? (
        <>
          <LoadState loading={members.loading && !members.data} error={members.error} onRetry={members.reload} />
          {members.data ? (
            <MembersPanel<OrganizationRole>
              members={members.data}
              roles={ORGANIZATION_ROLES}
              canManage={isAdmin}
              selfUsername={selfUsername}
              onSetRole={async (username, role) => {
                await server.setOrganizationMember(organization.id, username, role);
                await members.reload();
              }}
              onRemove={async (username) => {
                await server.removeOrganizationMember(organization.id, username);
                await members.reload();
              }}
            />
          ) : null}
          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
            {leave.error ? <Notice tone="danger">{leave.error}</Notice> : null}
            <div>
              <ConfirmButton
                confirmLabel="Leave? Click again"
                disabled={leave.busy}
                onConfirm={() =>
                  leave.run(async () => {
                    await server.removeOrganizationMember(organization.id, "me");
                    onDeleted();
                  })
                }
              >
                Leave organization
              </ConfirmButton>
            </div>
          </div>
        </>
      ) : null}

      {tab === "invitations" && isAdmin ? (
        <>
          <LoadState loading={invitations.loading && !invitations.data} error={invitations.error} onRetry={invitations.reload} />
          {invitations.data ? (
            <InvitationsPanel<OrganizationRole>
              invitations={invitations.data}
              roles={ORGANIZATION_ROLES}
              acceptPath="/api/organizations/invitations/{token}/accept"
              onInvite={async (target, role) => {
                const invitation = await server.inviteToOrganization(organization.id, target, role);
                await invitations.reload();
                return invitation;
              }}
              onRevoke={async (id) => {
                await server.revokeOrganizationInvitation(organization.id, id);
                await invitations.reload();
              }}
            />
          ) : null}
        </>
      ) : null}

      {tab === "projects" ? (
        <>
          <LoadState loading={projects.loading && !projects.data} error={projects.error} onRetry={projects.reload} />
          {projects.data ? <ProjectsPanel projects={projects.data} emptyText="No organization projects you can see." /> : null}
        </>
      ) : null}

      {tab === "sso" && isAdmin ? (
        <IdentityProviderPanel
          server={server}
          organization={organization}
          groups={groups}
          administrators={administrators}
        />
      ) : null}

      {tab === "settings" && isAdmin ? (
        <div className="flex flex-col gap-8">
          <OrganizationSettingsForm
            initial={organization}
            includeSlug={false}
            submitLabel="Save settings"
            onSubmit={async (values) => {
              const updated = await server.updateOrganization(organization.id, {
                name: values.name,
                publicSharingPolicy: values.publicSharingPolicy,
                defaultVisibility: values.defaultVisibility,
                categories: values.categories,
              });
              onChanged({ ...updated, role: organization.role });
            }}
          />
          <section className="flex flex-col gap-3 rounded-md border border-danger/40 p-4">
            <h3 className="font-semibold text-danger">Delete organization</h3>
            <p className="text-sm text-muted">
              Deletes the organization, every organization-owned project and its stored files, its groups, members, and
              invitations. Members' personal projects are kept. This can't be undone.
            </p>
            <Field label={`Type ${organization.slug} to confirm`}>
              {(id) => <Input id={id} value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />}
            </Field>
            {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}
            <div>
              <Button
                variant="danger"
                disabled={confirmSlug !== organization.slug || remove.busy}
                onClick={() =>
                  remove.run(async () => {
                    await server.deleteOrganization(organization.id);
                    onDeleted();
                  })
                }
              >
                Delete organization
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Card>
  );
}
