import { useState } from "react";
import { Badge, Button, Card, Checkbox, ConfirmButton, Field, Input, Select } from "../components/ui";
import { SERVICE_KINDS, type DeploymentPolicy, type ServiceEntry, type ServiceKind } from "../policy/types";

/** The fields each kind's Add Data form saves (GeoLibre getting-started docs). */
export const KIND_FIELDS: Record<ServiceKind, string[]> = {
  wms: ["endpoint", "layers", "styles", "format", "transparent", "tileSize", "version"],
  wfs: ["endpoint", "version", "typeName", "outputFormat", "srsName", "maxFeatures"],
  wmts: ["url", "tileSize"],
  xyz: ["url", "tileSize", "shortUrl"],
  arcgis: [
    "layerType",
    "sourceType",
    "url",
    "itemId",
    "portalUrl",
    "pageSize",
    "maxFeatures",
    "sublayers",
    "renderingRule",
  ],
  csw: ["endpoint", "keyword"],
};

const KIND_LABELS: Record<ServiceKind, string> = {
  wms: "WMS",
  wfs: "WFS",
  wmts: "WMTS",
  xyz: "XYZ tiles",
  arcgis: "ArcGIS",
  csw: "CSW catalog",
};

type FieldRow = { key: string; value: string; boolean: boolean };

function toRows(fields: ServiceEntry["fields"]): FieldRow[] {
  return Object.entries(fields).map(([key, value]) => ({
    key,
    value: typeof value === "boolean" ? String(value) : String(value),
    boolean: typeof value === "boolean",
  }));
}

function fromRows(rows: FieldRow[]): ServiceEntry["fields"] {
  const fields: ServiceEntry["fields"] = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.boolean) fields[key] = row.value === "true";
    else if (row.value !== "") fields[key] = row.value;
  }
  return fields;
}

function ServiceForm({
  initial,
  existingIds,
  onSave,
  onCancel,
}: {
  initial: ServiceEntry | null;
  existingIds: string[];
  onSave: (service: ServiceEntry) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ServiceKind>(initial?.kind ?? "wms");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [rows, setRows] = useState<FieldRow[]>(
    initial
      ? toRows(initial.fields)
      : KIND_FIELDS.wms.map((key) => ({ key, value: key === "transparent" ? "true" : "", boolean: key === "transparent" })),
  );

  const changeKind = (next: ServiceKind) => {
    setKind(next);
    // Keep values already typed, and offer the new kind's fields.
    const typed = rows.filter((row) => row.value !== "" && !row.boolean);
    const keys = new Set(typed.map((row) => row.key));
    setRows([
      ...typed,
      ...KIND_FIELDS[next]
        .filter((key) => !keys.has(key))
        .map((key) => ({ key, value: key === "transparent" ? "true" : "", boolean: key === "transparent" })),
    ]);
  };

  const trimmedId = id.trim();
  const fields = fromRows(rows);
  const idTaken = trimmedId !== (initial?.id ?? "").trim() && existingIds.includes(trimmedId);
  const errors = {
    id: !trimmedId ? "Required: a stable id users' saved references point at." : idTaken ? "Another service already uses this id." : undefined,
    name: !name.trim() ? "Required." : undefined,
    fields: Object.keys(fields).length === 0 ? "Fill in at least one field." : undefined,
  };
  const valid = !errors.id && !errors.name && !errors.fields;

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-accent bg-accent-soft/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSave({
          id: trimmedId,
          name: name.trim(),
          kind,
          ...(category.trim() ? { category: category.trim() } : {}),
          fields,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Id" error={id ? errors.id : undefined} hint="Never change it once published.">
          {(fid) => <Input id={fid} value={id} onChange={(e) => setId(e.target.value)} placeholder="org-geoserver-wms" />}
        </Field>
        <Field label="Name" error={name ? errors.name : undefined}>
          {(fid) => <Input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="Internal GeoServer" />}
        </Field>
        <Field label="Kind">
          {(fid) => (
            <Select id={fid} value={kind} onChange={(e) => changeKind(e.target.value as ServiceKind)}>
              {SERVICE_KINDS.map((option) => (
                <option key={option} value={option}>
                  {KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Category" hint="Optional grouping in the Browser.">
          {(fid) => <Input id={fid} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Organization" />}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Fields</legend>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2">
            <Input
              aria-label="Field name"
              value={row.key}
              className="font-mono text-xs"
              onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))}
            />
            {row.boolean ? (
              <Select
                aria-label={`${row.key} value`}
                value={row.value}
                onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : (
              <Input
                aria-label={`${row.key || "field"} value`}
                value={row.value}
                placeholder={row.key === "endpoint" || row.key === "url" ? "/geoserver/wms or https://…" : ""}
                onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
              />
            )}
            <Button size="sm" variant="ghost" aria-label={`Remove field ${row.key}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
              ×
            </Button>
          </div>
        ))}
        <div>
          <Button size="sm" onClick={() => setRows([...rows, { key: "", value: "", boolean: false }])}>
            Add field
          </Button>
        </div>
        {errors.fields ? <p className="text-xs text-danger">{errors.fields}</p> : null}
        <p className="text-xs text-muted">
          Empty fields are left out. Relative endpoints resolve against the GeoLibre origin.
        </p>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!valid}>
          {initial ? "Save service" : "Add service"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function ServicesSection({
  policy,
  setPolicy,
}: {
  policy: DeploymentPolicy;
  setPolicy: (update: (policy: DeploymentPolicy) => DeploymentPolicy) => void;
}) {
  const services = policy.services?.catalog ?? [];
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const setServices = (catalogList: ServiceEntry[]) =>
    setPolicy((current) => ({
      ...current,
      services: { ...current.services, catalog: catalogList.length ? catalogList : undefined },
    }));

  return (
    <Card
      title="Service library"
      description="Organization-wide WMS, WFS, tile, ArcGIS, and catalog services shown to every user."
      actions={
        editing === null ? (
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add service
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={policy.services?.builtins !== false}
          onChange={(on) =>
            setPolicy((current) => ({ ...current, services: { ...current.services, builtins: on ? undefined : false } }))
          }
          label="Show GeoLibre's built-in starter services"
          description="Unchecked shows only this catalog and each user's personal entries (GEOLIBRE_BUILTIN_SERVICES=off)."
        />
        {editing === "new" ? (
          <ServiceForm
            initial={null}
            existingIds={services.map((s) => s.id.trim())}
            onCancel={() => setEditing(null)}
            onSave={(service) => {
              setServices([...services, service]);
              setEditing(null);
            }}
          />
        ) : null}
        {services.length === 0 && editing === null ? (
          <p className="text-sm text-muted">No organization services. Users see the built-in library only.</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {services.map((service, index) =>
            editing === index ? (
              <li key={`${service.id}-edit`}>
                <ServiceForm
                  initial={service}
                  existingIds={services.map((s) => s.id.trim())}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    setServices(services.map((item, i) => (i === index ? next : item)));
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={`${service.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{service.name}</span>
                    <Badge tone="accent">{KIND_LABELS[service.kind] ?? service.kind}</Badge>
                    {service.category ? <Badge>{service.category}</Badge> : null}
                  </div>
                  <code className="block truncate font-mono text-xs text-muted">
                    {service.id} · {String(service.fields.endpoint ?? service.fields.url ?? Object.values(service.fields)[0] ?? "")}
                  </code>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setEditing(index)} disabled={editing !== null}>
                    Edit
                  </Button>
                  <ConfirmButton size="sm" confirmLabel="Remove?" onConfirm={() => setServices(services.filter((_, i) => i !== index))}>
                    Remove
                  </ConfirmButton>
                </div>
              </li>
            ),
          )}
        </ul>
        <p className="text-xs text-muted">
          The library is published to every visitor. List public endpoints only, never URLs with keys or
          tokens in them.
        </p>
      </div>
    </Card>
  );
}
