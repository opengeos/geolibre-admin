import { useId, useRef, useState, type ReactNode } from "react";
import {
  ApiError,
  ORGANIZATION_ROLES,
  TOKEN_ENDPOINT_AUTH_METHODS,
  type GeoLibreServer,
  type Group,
  type IdentityProvider,
  type Organization,
  type OrganizationRole,
  type TokenEndpointAuthMethod,
} from "../api/client";
import { Badge, Button, Checkbox, ConfirmButton, CopyButton, Field, Input, Notice, Select, TagInput } from "../components/ui";
import {
  PRESETS,
  PRESET_IDS,
  applyPreset,
  checkDiscovery,
  detectPreset,
  discoveryUrl,
  createMappingDraftId,
  draftFromProvider,
  emptyDraft,
  toRequestBody,
  validateDraft,
  type DiscoveryResult,
  type IdentityProviderDraft,
  type PresetId,
} from "./identityProvider";
import { formatDate, LoadState } from "./panels";
import { useAction, useAsync } from "./useAsync";

function DefinitionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function IdentityProviderPanel({
  server,
  organization,
  groups,
  administrators,
}: {
  server: GeoLibreServer;
  organization: Organization;
  groups: Group[];
  administrators: string[];
}) {
  const load = async (): Promise<IdentityProvider | null> => {
    try {
      return await server.identityProvider(organization.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const organizations = await server.myOrganizations();
        if (!organizations.some((item) => item.id === organization.id)) {
          throw new Error("This organization is no longer available to your account.");
        }
        throw new Error(
          "The server returned 404 while loading this organization's SSO configuration. Check the organization, retry, or verify that the server supports organization SSO.",
        );
      }
      throw error;
    }
  };
  const provider = useAsync(load, [server, organization.id]);
  const [editing, setEditing] = useState<IdentityProviderDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [checking, setChecking] = useState(false);
  const endpointsErrorId = useId();
  const discoveryCheckId = useRef(0);
  const invalidateDiscoveryCheck = () => {
    discoveryCheckId.current += 1;
    setChecking(false);
    setDiscovery(null);
  };
  const save = useAction();
  const toggle = useAction();
  const remove = useAction();
  const mutationBusy = save.busy || toggle.busy || remove.busy;
  const clearMutationErrors = () => {
    save.setError(null);
    toggle.setError(null);
    remove.setError(null);
  };


  const beginEdit = (draft: IdentityProviderDraft) => {
    setSaved(false);
    clearMutationErrors();
    invalidateDiscoveryCheck();
    setEditing(draft);
  };

  const runDiscoveryCheck = () => {
    if (!editing) return;
    const checkId = ++discoveryCheckId.current;
    setChecking(true);
    void checkDiscovery(editing).then((result) => {
      if (checkId === discoveryCheckId.current) setDiscovery(result);
    }).finally(() => {
      if (checkId === discoveryCheckId.current) setChecking(false);
    });
  };

  const renderDiscovery = () => {
    if (!discovery) return null;
    if (!discovery.ok) return <Notice>{discovery.message}</Notice>;
    return (
      <div className="flex flex-col gap-2">
        {discovery.problems.length ? (
          <Notice tone="danger">
            <ul className="list-disc ps-5">{discovery.problems.map((problem, index) => <li key={`${problem}-${index}`}>{problem}</li>)}</ul>
          </Notice>
        ) : null}
        {discovery.warnings.length ? (
          <Notice tone="warning">
            <ul className="list-disc ps-5">{discovery.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
          </Notice>
        ) : null}
        {!discovery.problems.length && !discovery.warnings.length ? (
          <Notice tone="ok">
            <p>Discovery looks good.</p>
            <ul className="mt-1 break-all font-mono text-xs">
              <li>Authorization: <code>{discovery.authorizationEndpoint}</code></li>
              <li>Token: <code>{discovery.tokenEndpoint}</code></li>
              <li>JWKS: <code>{discovery.jwksUri}</code></li>
            </ul>
          </Notice>
        ) : null}
      </div>
    );
  };

  const renderSummary = (p: IdentityProvider) => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={p.enabled ? "ok" : "neutral"}>{p.enabled ? "enabled" : "disabled"}</Badge>
        <span className="text-sm">{PRESETS[detectPreset(p.issuer)].label}</span>
        <span className="text-sm text-muted">Updated {formatDate(p.updatedAt)}</span>
      </div>

      <dl className="text-sm">
        <DefinitionRow label="Issuer">{p.issuer}</DefinitionRow>
        <DefinitionRow label="Client ID">{p.clientId}</DefinitionRow>
        <DefinitionRow label="Client secret">{p.clientSecretSet ? "stored" : "not set"}</DefinitionRow>
        <DefinitionRow label="Client authentication">{p.tokenEndpointAuthMethod}</DefinitionRow>
        <DefinitionRow label="Authorization endpoint">{p.authorizationEndpoint}</DefinitionRow>
        <DefinitionRow label="Token endpoint">{p.tokenEndpoint}</DefinitionRow>
        <DefinitionRow label="JWKS URI">{p.jwksUri}</DefinitionRow>
        <DefinitionRow label="Scopes">{p.scopes.join(" ")}</DefinitionRow>
        <DefinitionRow label="Username claim">{p.usernameClaim}</DefinitionRow>
        <DefinitionRow label="Email claim">{p.emailClaim}</DefinitionRow>
        <DefinitionRow label="Groups claim">{p.groupsClaim ?? "—"}</DefinitionRow>
        <DefinitionRow label="Default role">{p.defaultRole}</DefinitionRow>
        <DefinitionRow label="Role mappings">
          {p.roleMappings.length ? (
            <ul className="flex flex-col gap-1">
              {p.roleMappings.map((mapping, index) => <li key={`${mapping.value}-${index}`}>{mapping.value} → {mapping.role}</li>)}
            </ul>
          ) : "None"}
        </DefinitionRow>
        <DefinitionRow label="Group mappings">
          {p.groupMappings.length ? (
            <ul className="flex flex-col gap-1">
              {p.groupMappings.map((mapping, index) => {
                const group = groups.find((item) => item.id === mapping.groupId);
                return <li key={`${mapping.value}-${index}`}>{mapping.value} → {group?.name ?? `Unknown group (${mapping.groupId})`}</li>;
              })}
            </ul>
          ) : "None"}
        </DefinitionRow>
        <DefinitionRow label="MFA required">{p.requireMfa ? "Yes" : "No"}</DefinitionRow>
        <DefinitionRow label="Password sign-in">{p.allowBuiltinAccounts ? "allowed" : `only ${p.breakGlassUsername ?? "the break-glass administrator"}`}</DefinitionRow>
        <DefinitionRow label="Break-glass administrator">{p.breakGlassUsername ?? "—"}</DefinitionRow>
      </dl>

      <section className="flex flex-col gap-2 rounded-md border border-border p-3">
        <h3 className="text-sm font-semibold">Register at your identity provider</h3>
        {p.redirectUri ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-sm">{p.redirectUri}</code>
            <CopyButton text={p.redirectUri} />
          </div>
        ) : (
          <Notice tone="warning">
            This server has no OAuth sign-in configured (GEOLIBRE_OAUTH_CLIENTS), so it shows no consent page and members can't use single sign-on yet.
          </Notice>
        )}
        {p.redirectUri ? <p className="text-sm text-muted">Register it for a confidential client using the authorization code flow with S256 PKCE.</p> : null}
        <p className="text-sm text-muted">
          Members choose <strong>Sign in with your organization</strong> on the server's consent page and enter <code>{organization.slug}</code>.
        </p>
      </section>

      {!p.allowBuiltinAccounts ? (
        <Notice tone="warning">
          Password sign-in is off for members. This console signs in with a password, so only {p.breakGlassUsername ?? "the break-glass administrator"} can still use it for this organization.
        </Notice>
      ) : null}

      {toggle.error ? <Notice tone="danger">{toggle.error}</Notice> : null}
      {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}
      {saved ? <Notice tone="ok">Saved.</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={mutationBusy} onClick={() => beginEdit(draftFromProvider(p))}>Edit</Button>
        <Button
          disabled={mutationBusy}
          onClick={() => {
            setSaved(false);
            clearMutationErrors();
            void toggle.run(async () => {
              const draft = { ...draftFromProvider(p), enabled: !p.enabled };
              provider.setData(await server.setIdentityProvider(organization.id, toRequestBody(draft)));
            });
          }}
        >
          {p.enabled ? "Disable" : "Enable"}
        </Button>
        <ConfirmButton
          disabled={mutationBusy}
          confirmLabel="Remove? Click again"
          onConfirm={() => {
            setSaved(false);
            clearMutationErrors();
            void remove.run(async () => {
              await server.deleteIdentityProvider(organization.id);
              provider.setData(null);
            });
          }}
        >
          Remove provider
        </ConfirmButton>
      </div>
      <section className="flex flex-col gap-2 rounded-md border border-danger/40 p-3">
        <h3 className="text-sm font-semibold text-danger">What provider removal does</h3>
        <p className="text-sm text-muted">
          Removes the provider and its account links. Accounts created through single sign-on stay but can no longer sign in; a provider added later creates new accounts for the same people.
        </p>
      </section>
    </div>
  );

  const renderForm = (draft: IdentityProviderDraft) => {
    const creating = provider.data === null;
    const errors = validateDraft(draft, { creating });
    const update = (patch: Partial<IdentityProviderDraft>) => {
      if (
        "issuer" in patch ||
        "tokenEndpointAuthMethod" in patch ||
        "scopes" in patch ||
        "usernameClaim" in patch ||
        "emailClaim" in patch ||
        "groupsClaim" in patch
      ) {
        invalidateDiscoveryCheck();
      }
      setEditing({ ...draft, ...patch });
    };

    return (
      <form
        aria-busy={mutationBusy}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutationBusy) return;
          setSaved(false);
          clearMutationErrors();
          void save.run(async () => {
            const result = await server.setIdentityProvider(organization.id, toRequestBody(draft));
            provider.setData(result);
            invalidateDiscoveryCheck();
            setEditing(null);
            setSaved(true);
          });
        }}
      >
        <fieldset disabled={mutationBusy} className="contents">
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Provider</h3>
          <Field label="Provider" hint="Selecting a preset updates its suggested scopes and claim defaults. Review them before saving.">
            {(id) => (
              <Select
                id={id}
                value={draft.preset}
                onChange={(event) => {
                  invalidateDiscoveryCheck();
                  setEditing(applyPreset(draft, event.target.value as PresetId));
                }}
              >
                {PRESET_IDS.map((preset) => <option key={preset} value={preset}>{PRESETS[preset].label}</option>)}
              </Select>
            )}
          </Field>
          <ol className="list-decimal ps-5 text-sm text-muted">
            {PRESETS[draft.preset].setup.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Redirect URI:</span>
            {provider.data?.redirectUri ? (
              <><code className="break-all">{provider.data.redirectUri}</code><CopyButton text={provider.data.redirectUri} /></>
            ) : <span className="text-muted">The redirect URI to register appears after the first save.</span>}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Connection</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Issuer"
              hint="Exactly as the provider's tokens state it, including any trailing slash."
              error={errors.issuer}
            >
              {(id) => (
                <div className="flex gap-2">
                  <Input
                    id={id}
                    className="min-w-0 flex-1"
                    value={draft.issuer}
                    placeholder={PRESETS[draft.preset].issuerPlaceholder}
                    onChange={(event) => update({ issuer: event.target.value })}
                  />
                  <Button disabled={Boolean(errors.issuer) || checking} onClick={runDiscoveryCheck}>
                    {checking ? "Checking…" : "Check issuer"}
                  </Button>
                </div>
              )}
            </Field>
            <div className="self-end">{renderDiscovery()}</div>
            <Field label="Client ID" error={errors.clientId}>
              {(id) => <Input id={id} value={draft.clientId} onChange={(event) => update({ clientId: event.target.value })} />}
            </Field>
            <Field
              label="Client secret"
              hint={provider.data ? "Leave empty to keep the stored secret." : undefined}
              error={errors.clientSecret}
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={draft.clientSecret}
                  onChange={(event) => update({ clientSecret: event.target.value })}
                />
              )}
            </Field>
            <Field label="Client authentication">
              {(id) => (
                <Select
                  id={id}
                  value={draft.tokenEndpointAuthMethod}
                  onChange={(event) => update({ tokenEndpointAuthMethod: event.target.value as TokenEndpointAuthMethod })}
                >
                  {TOKEN_ENDPOINT_AUTH_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Endpoints</h3>
          <Checkbox
            label={provider.data ? "Keep saved endpoints" : "Set endpoints manually"}
            description={provider.data
              ? "Keeps the saved endpoints on updates; uncheck to let the server rediscover them from the issuer on save."
              : "Only for providers without a discovery document. Otherwise the server reads them from the issuer on every save."}
            checked={draft.endpointMode === "manual"}
            onChange={(checked) => update({ endpointMode: checked ? "manual" : "discovery" })}
          />
          {draft.endpointMode === "manual" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Authorization endpoint">
                  {(id) => (
                    <Input
                      id={id}
                      value={draft.authorizationEndpoint}
                      onChange={(event) => update({ authorizationEndpoint: event.target.value })}
                      aria-invalid={Boolean(errors.endpoints)}
                      aria-describedby={errors.endpoints ? endpointsErrorId : undefined}
                    />
                  )}
                </Field>
                <Field label="Token endpoint">
                  {(id) => (
                    <Input
                      id={id}
                      value={draft.tokenEndpoint}
                      onChange={(event) => update({ tokenEndpoint: event.target.value })}
                      aria-invalid={Boolean(errors.endpoints)}
                      aria-describedby={errors.endpoints ? endpointsErrorId : undefined}
                    />
                  )}
                </Field>
                <Field label="JWKS URI">
                  {(id) => (
                    <Input
                      id={id}
                      value={draft.jwksUri}
                      onChange={(event) => update({ jwksUri: event.target.value })}
                      aria-invalid={Boolean(errors.endpoints)}
                      aria-describedby={errors.endpoints ? endpointsErrorId : undefined}
                    />
                  )}
                </Field>
              </div>
              {errors.endpoints ? <p id={endpointsErrorId} role="alert" className="text-xs text-danger">{errors.endpoints}</p> : null}
            </>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Claims</h3>
          <Field label="Scopes" error={errors.scopes}>
            {(id) => <TagInput id={id} values={draft.scopes} placeholder="openid email profile" onChange={(scopes) => update({ scopes })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username claim" error={errors.usernameClaim}>
              {(id) => <Input id={id} value={draft.usernameClaim} onChange={(event) => update({ usernameClaim: event.target.value })} />}
            </Field>
            <Field label="Email claim" error={errors.emailClaim}>
              {(id) => <Input id={id} value={draft.emailClaim} onChange={(event) => update({ emailClaim: event.target.value })} />}
            </Field>
            <Field label="Groups claim" hint="Leave empty when the provider sends no groups; mappings then never match." error={errors.groupsClaim}>
              {(id) => <Input id={id} value={draft.groupsClaim} onChange={(event) => update({ groupsClaim: event.target.value })} />}
            </Field>
          </div>

          {draft.groupMappings.length > 0 && !draft.groupsClaim.trim() ? (
            <Notice tone="warning">Group mappings will never match without a groups claim.</Notice>
          ) : null}

        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Access</h3>
          <Field label="Default role" hint="Given to new members when no role mapping matches.">
            {(id) => (
              <Select id={id} value={draft.defaultRole} onChange={(event) => update({ defaultRole: event.target.value as OrganizationRole })}>
                {ORGANIZATION_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </Select>
            )}
          </Field>
          {draft.defaultRole === "administrator" ? (
            <Notice tone="warning">New members without a matching role mapping become organization administrators. Use this default only when intended.</Notice>
          ) : null}
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Role mappings</h4>
            {draft.roleMappings.map((mapping) => (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]" key={mapping.id}>
                <Input
                  aria-label="Role claim value"
                  value={mapping.value}
                  onChange={(event) => update({ roleMappings: draft.roleMappings.map((item) => item.id === mapping.id ? { ...item, value: event.target.value } : item) })}
                />
                <Select
                  aria-label="Mapped role"
                  value={mapping.role}
                  onChange={(event) => update({ roleMappings: draft.roleMappings.map((item) => item.id === mapping.id ? { ...item, role: event.target.value as OrganizationRole } : item) })}
                >
                  {ORGANIZATION_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => update({ roleMappings: draft.roleMappings.filter((item) => item.id !== mapping.id) })}>Remove</Button>
              </div>
            ))}
            <p className="text-xs text-muted">
              The highest-ranked matching role wins. With any mapping set, existing members' roles follow it at every sign-in (the last and break-glass administrators are never demoted).
            </p>
            {errors.roleMappings ? <p className="text-xs text-danger">{errors.roleMappings}</p> : null}
            <div><Button size="sm" onClick={() => update({ roleMappings: [...draft.roleMappings, { id: createMappingDraftId(), value: "", role: "member" }] })}>Add role mapping</Button></div>
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Group mappings</h4>
            {draft.groupMappings.map((mapping) => {
              const knownGroup = groups.some((group) => group.id === mapping.groupId);
              return (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]" key={mapping.id}>
                  <Input
                    aria-label="Group claim value"
                    value={mapping.value}
                    onChange={(event) => update({ groupMappings: draft.groupMappings.map((item) => item.id === mapping.id ? { ...item, value: event.target.value } : item) })}
                  />
                  <Select
                    aria-label="Mapped group"
                    value={mapping.groupId}
                    onChange={(event) => update({ groupMappings: draft.groupMappings.map((item) => item.id === mapping.id ? { ...item, groupId: event.target.value } : item) })}
                  >
                    <option value="">Pick a group</option>
                    {mapping.groupId && !knownGroup ? <option value={mapping.groupId}>Unknown group ({mapping.groupId})</option> : null}
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => update({ groupMappings: draft.groupMappings.filter((item) => item.id !== mapping.id) })}>Remove</Button>
                </div>
              );
            })}
            <p className="text-xs text-muted">
              Lists this organization's groups you belong to. Matching members become plain group members; owners and managers are never changed.
            </p>
            {errors.groupMappings ? <p className="text-xs text-danger">{errors.groupMappings}</p> : null}
            <div>
              <Button size="sm" disabled={!groups.length} onClick={() => update({ groupMappings: [...draft.groupMappings, { id: createMappingDraftId(), value: "", groupId: "" }] })}>Add group mapping</Button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Security</h3>
          <Checkbox
            label="Require MFA"
            description={'Rejects sign-ins whose ID token amr lacks "mfa". Providers listing only factors such as pwd and otp need a claim mapper that adds mfa.'}
            checked={draft.requireMfa}
            onChange={(requireMfa) => update({ requireMfa })}
          />
          <Checkbox
            label="Allow password sign-in for members"
            description="Off: members must use single sign-on, except the break-glass administrator."
            checked={draft.allowBuiltinAccounts}
            onChange={(allowBuiltinAccounts) => update({ allowBuiltinAccounts })}
          />
          <Field label="Break-glass administrator" hint="An organization administrator who keeps password sign-in." error={errors.breakGlassUsername}>
            {(id) => (
              <Select id={id} value={draft.breakGlassUsername} onChange={(event) => update({ breakGlassUsername: event.target.value })}>
                <option value="">None</option>
                {[...new Set([...administrators, ...(draft.breakGlassUsername ? [draft.breakGlassUsername] : [])])].map((username) => (
                  <option key={username} value={username}>{username}</option>
                ))}
              </Select>
            )}
          </Field>
          <Checkbox
            label="Enabled"
            description="A disabled provider is neither offered nor accepted."
            checked={draft.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </section>

        {/* The extra recovery hint depends on this server error text; the base error remains visible if it changes. */}
        {save.error ? (
          <Notice tone="danger">
            {save.error}
            {save.error === "identity provider discovery failed"
              ? ` — the server couldn't read ${discoveryUrl(draft.issuer)}. It only reaches public addresses unless GEOLIBRE_OIDC_ALLOWED_NETWORKS lists the host. Check the issuer or set the endpoints manually.`
              : null}
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={mutationBusy || Object.keys(errors).length > 0}>
            {creating ? "Connect provider" : "Save"}
          </Button>
          <Button disabled={mutationBusy} onClick={() => { invalidateDiscoveryCheck(); setEditing(null); }}>Cancel</Button>
        </div>
        </fieldset>
      </form>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <LoadState
        loading={provider.loading && provider.data === undefined}
        error={provider.error}
        onRetry={provider.reload}
      />
      {provider.data === null && !editing ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Connect one OpenID Connect provider so members sign in with your organization's accounts.</p>
          <Button variant="primary" onClick={() => beginEdit(emptyDraft())}>Set up single sign-on</Button>
        </div>
      ) : null}
      {provider.data && !editing ? renderSummary(provider.data) : null}
      {editing ? renderForm(editing) : null}
    </div>
  );
}
