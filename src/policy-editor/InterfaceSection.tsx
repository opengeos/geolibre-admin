import { useMemo, useState } from "react";
import { catalog, presetHiddenSets, type CatalogItem, type HiddenSets } from "../catalog/catalog";
import { Badge, Button, Card, Checkbox, Field, Input, Notice, TagInput, cx } from "../components/ui";
import {
  EXPERIENCE_LEVELS,
  type DeploymentPolicy,
  type ExperienceLevel,
  type InterfacePolicy,
} from "../policy/types";

type ListKey = keyof HiddenSets;

const TIER_TONE = { basic: "ok", intermediate: "accent", advanced: "warning" } as const;

const LEVEL_TEXT: Record<ExperienceLevel, string> = {
  beginner: "Only the essential data sources and tools.",
  intermediate: "Common data sources, services, and plugins.",
  advanced: "Everything GeoLibre offers.",
};

interface Group {
  key: ListKey;
  title: string;
  sections: { label: string; items: CatalogItem[] }[];
}

const GROUPS: Group[] = [
  {
    key: "hiddenMenus",
    title: "Menus",
    sections: [{ label: "Top-level menus", items: catalog.menus }],
  },
  {
    key: "hiddenMenuItems",
    title: "Menu items",
    sections: catalog.menus.map((menu) => ({
      label: menu.label,
      items: catalog.menuItems.filter((item) => item.menuId === menu.id),
    })),
  },
  {
    key: "hiddenDataSources",
    title: "Data sources",
    sections: catalog.dataSourceSections.map((section) => ({
      label: section.label,
      items: catalog.dataSources.filter((item) => item.section === section.id),
    })),
  },
  {
    key: "hiddenPlugins",
    title: "Plugins",
    sections: [{ label: "Built-in plugins", items: catalog.plugins }],
  },
];

const KNOWN_PLUGINS = new Set(catalog.plugins.map((plugin) => plugin.id));

function ItemList({
  group,
  hidden,
  filter,
  readOnly,
  onToggle,
}: {
  group: Group;
  hidden: Set<string>;
  filter: string;
  readOnly: boolean;
  onToggle: (ids: string[], visible: boolean) => void;
}) {
  const needle = filter.trim().toLowerCase();
  const sections = group.sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !needle || item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle),
      ),
    }))
    .filter((section) => section.items.length);
  if (!sections.length) return <p className="text-sm text-muted">No matches.</p>;
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.label}>
          {group.sections.length > 1 || !readOnly ? (
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{section.label}</h4>
              {!readOnly ? (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onToggle(section.items.map((i) => i.id), true)}>
                    Show all
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onToggle(section.items.map((i) => i.id), false)}>
                    Hide all
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => (
              <Checkbox
                key={item.id}
                disabled={readOnly}
                checked={!hidden.has(item.id)}
                onChange={(visible) => onToggle([item.id], visible)}
                label={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {item.label}
                    <Badge tone={TIER_TONE[item.tier]}>{item.tier}</Badge>
                  </span>
                }
                description={<code className="font-mono">{item.id}</code>}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InterfaceSection({
  policy,
  setPolicy,
}: {
  policy: DeploymentPolicy;
  setPolicy: (update: (policy: DeploymentPolicy) => DeploymentPolicy) => void;
}) {
  const profile = policy.interface;
  const [tab, setTab] = useState<ListKey>("hiddenMenus");
  const [filter, setFilter] = useState("");

  const update = (change: (profile: InterfacePolicy) => InterfacePolicy | undefined) =>
    setPolicy((current) => {
      const next = change(current.interface ?? {});
      const { interface: _omit, ...rest } = current;
      return next ? { ...rest, interface: next } : rest;
    });

  const hasLists = !!profile && GROUPS.some((group) => profile[group.key] !== undefined);
  const mode: ExperienceLevel | "custom" | null = !profile
    ? null
    : hasLists
      ? "custom"
      : (profile.level ?? "advanced");

  const effective: HiddenSets = useMemo(() => {
    const preset = presetHiddenSets(profile?.level ?? "advanced");
    return {
      hiddenMenus: profile?.hiddenMenus ?? preset.hiddenMenus,
      hiddenMenuItems: profile?.hiddenMenuItems ?? preset.hiddenMenuItems,
      hiddenDataSources: profile?.hiddenDataSources ?? preset.hiddenDataSources,
      hiddenPlugins: profile?.hiddenPlugins ?? preset.hiddenPlugins,
    };
  }, [profile]);

  const toCustom = () =>
    update((current) => {
      const { level: _level, ...rest } = current;
      return { ...rest, ...effective };
    });

  const toggle = (ids: string[], visible: boolean) =>
    update((current) => {
      const base = { ...effective };
      const { level: _level, ...rest } = current;
      const set = new Set(base[tab]);
      for (const id of ids) {
        if (visible) set.delete(id);
        else set.add(id);
      }
      return { ...rest, ...base, [tab]: [...set] };
    });

  const externalHiddenPlugins = (profile?.hiddenPlugins ?? []).filter((id) => !KNOWN_PLUGINS.has(id));
  const activeGroup = GROUPS.find((group) => group.key === tab)!;
  const totalHidden = GROUPS.reduce((sum, group) => sum + effective[group.key].length, 0);

  return (
    <Card
      title="Interface"
      description="Pre-configure the experience level and hidden items for every user (admin-profile.json)."
    >
      <div className="flex flex-col gap-5">
        <Checkbox
          checked={!!profile}
          onChange={(on) => update(() => (on ? { enabled: true, level: "intermediate" } : undefined))}
          label="Apply an interface profile to this deployment"
          description="Off leaves each user's own Settings → Interface choice in place."
        />

        {profile ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Starting point</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[...EXPERIENCE_LEVELS, "custom" as const].map((option) => (
                  <label
                    key={option}
                    className={cx(
                      "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2",
                      mode === option ? "border-accent bg-accent-soft" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium capitalize">
                      <input
                        type="radio"
                        name="interface-level"
                        checked={mode === option}
                        onChange={() =>
                          option === "custom"
                            ? toCustom()
                            : update((current) => ({
                                enabled: current.enabled,
                                lock: current.lock,
                                level: option,
                              }))
                        }
                      />
                      {option}
                    </span>
                    <span className="text-xs text-muted">
                      {option === "custom" ? "Pick each menu, data source, and plugin." : LEVEL_TEXT[option]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Checkbox
                checked={!!profile.lock}
                onChange={(lock) => update((current) => ({ ...current, lock: lock || undefined }))}
                label="Lock the interface"
                description="Users can't change the profile from Settings. Removing the file releases the lock on the next launch."
              />
              <Checkbox
                checked={profile.enabled !== false}
                onChange={(enabled) => update((current) => ({ ...current, enabled: enabled ? true : false }))}
                label="Filtering enabled"
                description="Turn off to ship the file without hiding anything."
              />
            </div>

            <div className="rounded-md border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div role="tablist" aria-label="Hidden item lists" className="flex flex-wrap gap-1">
                  {GROUPS.map((group) => (
                    <button
                      key={group.key}
                      role="tab"
                      type="button"
                      aria-selected={tab === group.key}
                      onClick={() => setTab(group.key)}
                      className={cx(
                        "rounded px-2.5 py-1 text-sm",
                        tab === group.key ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2",
                      )}
                    >
                      {group.title}{" "}
                      <span className="text-xs">({effective[group.key].length} hidden)</span>
                    </button>
                  ))}
                </div>
                <Input
                  aria-label="Filter items"
                  placeholder="Filter…"
                  className="h-8 w-48"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
              <div className="max-h-[28rem] overflow-y-auto p-3">
                {mode !== "custom" ? (
                  <div className="mb-3">
                    <Notice tone="accent">
                      GeoLibre derives these lists from the <strong className="capitalize">{mode}</strong> preset
                      ({totalHidden} items hidden). Checking or unchecking an item switches to Custom.
                    </Notice>
                  </div>
                ) : null}
                <ItemList
                  group={activeGroup}
                  hidden={new Set(effective[tab])}
                  filter={filter}
                  readOnly={false}
                  onToggle={toggle}
                />
                {tab === "hiddenPlugins" && mode === "custom" ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <Field
                      label="External plugins to hide"
                      hint="Ids of drop-in or marketplace plugins that aren't built in."
                    >
                      {(id) => (
                        <TagInput
                          id={id}
                          values={externalHiddenPlugins}
                          placeholder="plugin-id"
                          onChange={(values) =>
                            update((current) => ({
                              ...current,
                              hiddenPlugins: [
                                ...(current.hiddenPlugins ?? []).filter((item) => KNOWN_PLUGINS.has(item)),
                                ...values,
                              ],
                            }))
                          }
                        />
                      )}
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted">
              Catalog from GeoLibre <code>{catalog.source.commit}</code>. The Settings menu and its Language,
              Layout, and Interface entries are always shown.
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
