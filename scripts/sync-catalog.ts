/**
 * Regenerate `src/catalog/geolibre-catalog.json` from a GeoLibre checkout.
 *
 * The ids an `admin-profile.json` may hide (data sources, menus, menu items,
 * plugins) and their complexity tiers live in GeoLibre's source, not in a
 * published package, so this script reads them from a local clone:
 *
 *   npm run sync:catalog -- ../GeoLibre
 *
 * Data sources, menus and menu items come straight from
 * `apps/geolibre-desktop/src/lib/ui-profile.ts`. Built-in plugins are the ones
 * registered in `apps/geolibre-desktop/src/hooks/usePlugins.ts`; their ids and
 * names are read from the plugin definitions in `packages/plugins/src`.
 * English labels are resolved from the `en.json` locale catalog.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Tier = "basic" | "intermediate" | "advanced";

const root = resolve(process.argv[2] ?? "../GeoLibre");
const desktop = join(root, "apps/geolibre-desktop/src");

/**
 * Look up a dotted i18n key in a nested locale catalog.
 *
 * @param catalog - The parsed locale JSON.
 * @param key - A dotted key such as `toolbar.item.vectorLayer`.
 * @returns The translated string, or the key itself when missing.
 */
function label(catalog: Record<string, unknown>, key: string): string {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node.replace(/[….]+$/, "").trim() : key;
}

/**
 * List every `.ts` file under a directory, recursively.
 *
 * @param dir - Directory to walk.
 * @returns Absolute file paths.
 */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}

/**
 * Collect built-in plugin ids and names from the plugin package source.
 *
 * Plugins are defined several ways: an object literal, a factory taking an
 * options object (`createSourceCoopPlugin({ id, name })`), a factory taking
 * positional arguments (`createStacPlugin(ID, "Name")`), a property of a
 * factory result (`arcGisHub.plugin`), or an IIFE returning the object. Each
 * definition statement is scanned for the first id (a string literal or an
 * `*_ID` constant) and the first quoted name.
 *
 * @param registered - Plugin export names imported by `usePlugins.ts`.
 * @returns Plugin id/name pairs in registration order.
 */
function builtInPlugins(registered: string[]): { id: string; name: string }[] {
  const files = tsFiles(join(root, "packages/plugins/src"));
  const sources = files.map((file) => readFileSync(file, "utf8"));
  const constants = new Map<string, string>();
  for (const source of sources) {
    for (const match of source.matchAll(/export const (\w+)\s*=\s*"([^"]+)"/g)) {
      constants.set(match[1], match[2]);
    }
  }
  const resolveId = (token: string | undefined): string | undefined =>
    token?.startsWith('"') ? token.slice(1, -1) : token ? constants.get(token) : undefined;

  /** Find the top-level `const <name> =` statement text for a binding. */
  const statement = (name: string): string | undefined => {
    for (const source of sources) {
      const match = new RegExp(`^(?:export )?const ${name}\\b[^=]*=`, "m").exec(source);
      if (!match) continue;
      const rest = source.slice(match.index + match[0].length);
      const next = rest.search(/\n(?:export |const |let |function |\/\*\*)/);
      return rest.slice(0, next === -1 ? undefined : next);
    }
    return undefined;
  };

  const idToken = String.raw`("[^"]+"|[A-Z][A-Z0-9_]*_ID)`;
  const lookup = (name: string): { id: string; name: string } | undefined => {
    const text = statement(name);
    if (!text) return undefined;
    const alias = text.trim().match(/^(\w+)\.plugin;?$/);
    if (alias) return lookup(alias[1]);
    const positional = text.match(new RegExp(String.raw`^\s*\w+\(\s*${idToken}\s*,\s*"([^"]+)"`));
    if (positional) {
      const id = resolveId(positional[1]);
      return id ? { id, name: positional[2] } : undefined;
    }
    const id = resolveId(text.match(new RegExp(String.raw`\bid:\s*${idToken}`))?.[1]);
    const label = text.match(/\bname:\s*"([^"]+)"/)?.[1];
    return id && label ? { id, name: label } : undefined;
  };

  const found = registered.map((name) => [name, lookup(name)] as const);
  const missing = found.filter(([, plugin]) => !plugin).map(([name]) => name);
  if (missing.length) {
    console.warn(`Could not resolve plugin definitions for: ${missing.join(", ")}`);
  }
  return found.flatMap(([, plugin]) => (plugin ? [plugin] : []));
}

const uiProfile = await import(pathToFileURL(join(desktop, "lib/ui-profile.ts")).href);
const en = JSON.parse(readFileSync(join(desktop, "i18n/locales/en.json"), "utf8"));

const usePlugins = readFileSync(join(desktop, "hooks/usePlugins.ts"), "utf8");
const importBlock = usePlugins.match(/import\s*\{([^}]+)\}\s*from\s*"@geolibre\/plugins"/);
const registered = (importBlock?.[1] ?? "")
  .split(",")
  .map((name) => name.trim().replace(/^type\s+/, ""))
  .filter((name) => /^[a-z]\w*Plugin$/.test(name) && usePlugins.split(name).length > 2);

const managed: Set<string> = uiProfile.MENU_MANAGED_PLUGIN_IDS;
const plugins = builtInPlugins(registered)
  .filter((plugin) => !managed.has(plugin.id))
  .map((plugin) => ({ ...plugin, tier: uiProfile.pluginTier(plugin.id) as Tier }))
  .sort((a, b) => a.name.localeCompare(b.name));

let commit = "unknown";
try {
  commit = execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  // Not a git checkout; keep "unknown".
}

const catalog = {
  source: { repository: "opengeos/GeoLibre", commit },
  dataSourceSections: uiProfile.DATA_SOURCE_SECTION_ORDER.map((id: string) => ({
    id,
    label: label(en, uiProfile.DATA_SOURCE_SECTION_LABEL_KEYS[id]),
  })),
  dataSources: uiProfile.DATA_SOURCE_CATALOG.map(
    (entry: { id: string; section: string; labelKey: string; tier: Tier }) => ({
      id: entry.id,
      section: entry.section,
      label: label(en, entry.labelKey),
      tier: entry.tier,
    }),
  ),
  menus: uiProfile.TOP_LEVEL_MENUS.map((entry: { id: string; labelKey: string; tier: Tier }) => ({
    id: entry.id,
    label: label(en, entry.labelKey),
    tier: entry.tier,
  })),
  menuItems: uiProfile.MENU_ITEM_CATALOG.map(
    (entry: { id: string; menuId: string; labelKey: string; tier: Tier }) => ({
      id: entry.id,
      menuId: entry.menuId,
      label: label(en, entry.labelKey),
      tier: entry.tier,
    }),
  ),
  plugins,
};

const out = resolve(import.meta.dirname, "../src/catalog/geolibre-catalog.json");
writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `Wrote ${out}: ${catalog.dataSources.length} data sources, ${catalog.menus.length} menus, ` +
    `${catalog.menuItems.length} menu items, ${plugins.length} plugins (GeoLibre ${commit}).`,
);
