import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog, presetHiddenSets } from "../src/catalog/catalog";
import {
  buildArgs,
  cleanPolicy,
  exportFiles,
  runtimeEnv,
  toAdminProfile,
  toCompose,
  toDockerCommands,
  toServicesFile,
} from "../src/policy/export";
import { importText, parseEnv } from "../src/policy/import";
import { deploymentSchema } from "../src/policy/schema";
import { DEFAULT_OPERATOR_SETTINGS, emptyPolicy, type DeploymentPolicy } from "../src/policy/types";
import { embedOriginProblem, serviceUrlProblem, validatePolicy } from "../src/policy/validate";

const operator = { ...DEFAULT_OPERATOR_SETTINGS };

const full: DeploymentPolicy = {
  version: 1,
  capabilities: ["data:add", "export:data"],
  interface: { enabled: true, level: "beginner", lock: true },
  services: {
    builtins: false,
    catalog: [
      {
        id: "org-wms",
        name: "Internal GeoServer",
        kind: "wms",
        category: "Organization",
        fields: { endpoint: "/geoserver/wms", transparent: true },
      },
    ],
  },
  sharing: {
    shareUrl: "https://projects.example.org",
    collabUrl: "wss://collab.example.org",
    embedOrigins: ["https://portal.example.com"],
  },
  geolens: { url: "same-origin" },
  branding: { appName: "Acme Maps", welcome: false },
};

describe("schema", () => {
  it("matches the committed schema file", () => {
    const committed = JSON.parse(readFileSync(resolve(__dirname, "../schema/deployment.schema.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(deploymentSchema)));
  });

  it("accepts an empty and a full policy", () => {
    expect(validatePolicy(emptyPolicy())).toEqual([]);
    expect(validatePolicy(full).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("rejects unknown keys and bad enums", () => {
    const issues = validatePolicy({ version: 1, capabilities: ["data:add", "fly"], extra: true });
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["/", "/capabilities/1"]));
    expect(issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("requires version 1", () => {
    expect(validatePolicy({ version: 2 })[0].path).toBe("/version");
  });
});

describe("semantic validation", () => {
  it("mirrors the container's URL rules", () => {
    expect(serviceUrlProblem("https://a.example", "https", "http")).toBeNull();
    expect(serviceUrlProblem("http://localhost:8000", "https", "http")).toBeNull();
    expect(serviceUrlProblem("http://a.example", "https", "http")).toMatch(/https:\/\//);
    expect(serviceUrlProblem("https://user:pw@a.example", "https", "http")).toMatch(/credentials/);
    expect(serviceUrlProblem("ws://127.0.0.1:1234", "wss", "ws")).toBeNull();
    expect(serviceUrlProblem("not a url", "https", "http")).toMatch(/https/);
  });

  it("checks embed origins", () => {
    expect(embedOriginProblem("https://portal.example.com")).toBeNull();
    expect(embedOriginProblem("*")).toBeNull();
    expect(embedOriginProblem("https://portal.example.com/app")).toMatch(/bare origin/);
    expect(embedOriginProblem("ftp://x.example")).toMatch(/http/);
  });

  it("flags duplicate service ids and bad share URLs", () => {
    const policy: DeploymentPolicy = {
      version: 1,
      services: {
        catalog: [
          { id: "a", name: "A", kind: "xyz", fields: { url: "/t/{z}/{x}/{y}.png" } },
          { id: " a ", name: "B", kind: "xyz", fields: { url: "/u/{z}/{x}/{y}.png" } },
        ],
      },
      sharing: { shareUrl: "http://projects.example.org" },
    };
    const errors = validatePolicy(policy).filter((issue) => issue.severity === "error");
    expect(errors.map((issue) => issue.path)).toEqual(["/services/catalog/1/id", "/sharing/shareUrl"]);
  });

  it("accepts share URL off and GeoLens host shorthand", () => {
    const policy: DeploymentPolicy = { version: 1, sharing: { shareUrl: "OFF" }, geolens: { url: "geolens.example.org" } };
    expect(validatePolicy(policy)).toEqual([]);
  });

  it("warns about ids missing from the catalog", () => {
    const issues = validatePolicy({ version: 1, interface: { hiddenPlugins: ["some-external-plugin"] } });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });
});

describe("catalog presets", () => {
  it("hides nothing at advanced and more at beginner than intermediate", () => {
    const advanced = presetHiddenSets("advanced");
    expect(Object.values(advanced).every((list) => list.length === 0)).toBe(true);
    const beginner = presetHiddenSets("beginner");
    const intermediate = presetHiddenSets("intermediate");
    expect(beginner.hiddenDataSources.length).toBeGreaterThan(intermediate.hiddenDataSources.length);
    expect(intermediate.hiddenPlugins).toContain("maplibre-gl-geoagent");
    expect(beginner.hiddenPlugins).not.toContain("maplibre-layer-control");
  });

  it("has unique ids", () => {
    for (const list of [catalog.dataSources, catalog.menus, catalog.menuItems, catalog.plugins]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("export", () => {
  it("drops empty sections but keeps an empty capability list", () => {
    expect(cleanPolicy({ version: 1, sharing: {}, branding: { appName: "" }, capabilities: [] })).toEqual({
      version: 1,
      capabilities: [],
    });
  });

  it("produces today's GeoLibre files", () => {
    expect(toAdminProfile(full)).toEqual({ enabled: true, level: "beginner", lock: true });
    expect(toServicesFile(full)?.services[0]).toEqual({
      id: "org-wms",
      name: "Internal GeoServer",
      kind: "wms",
      category: "Organization",
      fields: { endpoint: "/geoserver/wms", transparent: true },
    });
    expect(toAdminProfile(emptyPolicy())).toBeNull();
    expect(toServicesFile(emptyPolicy())).toBeNull();
  });

  it("maps settings to runtime env and build args", () => {
    const env = Object.fromEntries(
      runtimeEnv(full, { sidecar: true, conversionRoots: "/data", postgisHosts: "" }).map((item) => [item.name, item.value]),
    );
    expect(env).toEqual({
      GEOLIBRE_SHARE_URL: "https://projects.example.org",
      GEOLIBRE_COLLAB_URL: "wss://collab.example.org",
      GEOLIBRE_EMBED_ORIGINS: "https://portal.example.com",
      GEOLIBRE_GEOLENS_URL: "same-origin",
      GEOLIBRE_APP_NAME: "Acme Maps",
      GEOLIBRE_SERVICES_FILE: "/config/geolibre-services.json",
      GEOLIBRE_BUILTIN_SERVICES: "off",
      GEOLIBRE_CONVERSION_ROOTS: "/data",
    });
    expect(buildArgs(full)).toEqual([
      { name: "VITE_GEOLIBRE_CAPABILITIES", value: "data:add,export:data" },
      { name: "VITE_WELCOME_DISABLED", value: "1" },
    ]);
    expect(buildArgs({ version: 1, capabilities: [] })).toEqual([{ name: "VITE_GEOLIBRE_CAPABILITIES", value: "none" }]);
    expect(runtimeEnv(emptyPolicy(), { ...operator, sidecar: false })).toEqual([
      { name: "GEOLIBRE_DISABLE_SIDECAR", value: "1", note: undefined },
    ]);
  });

  it("uses the published image when no build args are needed", () => {
    const policy: DeploymentPolicy = { version: 1, branding: { appName: "Acme Maps" } };
    expect(toDockerCommands(policy, operator)).not.toContain("docker build");
    expect(toDockerCommands(policy, operator)).toContain("-e GEOLIBRE_APP_NAME='Acme Maps'");
    expect(toCompose(policy, operator)).toContain("image: ghcr.io/opengeos/geolibre:latest");
    expect(toDockerCommands(full, operator)).toContain("--build-arg VITE_GEOLIBRE_CAPABILITIES=data:add,export:data");
    expect(toCompose(full, operator)).toContain("./admin-profile.json:/usr/share/nginx/html/admin-profile.json:ro");
  });

  it("lists only the files a policy needs", () => {
    expect(exportFiles(emptyPolicy(), operator).map((file) => file.name)).toEqual([
      "deployment.json",
      "geolibre.env",
      "docker-run.sh",
      "compose.yaml",
    ]);
    expect(exportFiles(full, operator).map((file) => file.name)).toContain("geolibre-services.json");
  });
});

describe("import", () => {
  it("round-trips a deployment.json", () => {
    const text = exportFiles(full, operator)[0].content;
    const result = importText(text, emptyPolicy(), operator);
    expect(result.kind).toBe("deployment.json");
    expect(result.policy).toEqual(cleanPolicy(full));
  });

  it("recognizes admin-profile.json and services files", () => {
    const profile = importText('{"level":"intermediate","hiddenPlugins":["x"]}', emptyPolicy(), operator);
    expect(profile.kind).toBe("admin-profile.json");
    expect(profile.policy.interface).toEqual({ level: "intermediate", hiddenPlugins: ["x"] });
    const services = importText(JSON.stringify(toServicesFile(full)), profile.policy, operator);
    expect(services.kind).toBe("services file");
    expect(services.policy.interface).toEqual(profile.policy.interface);
    expect(services.policy.services?.catalog).toHaveLength(1);
  });

  it("imports env files and docker run commands", () => {
    const text = [
      "docker run -d \\",
      "  -e GEOLIBRE_SHARE_URL=off \\",
      "  -e GEOLIBRE_APP_NAME='Acme Maps' \\",
      "  -e GEOLIBRE_DISABLE_SIDECAR=1 \\",
      "  --build-arg VITE_GEOLIBRE_CAPABILITIES=data:add,bogus \\",
      "  ghcr.io/opengeos/geolibre:latest",
    ].join("\n");
    expect(parseEnv(text).get("GEOLIBRE_APP_NAME")).toBe("Acme Maps");
    const result = importText(text, emptyPolicy(), operator);
    expect(result.kind).toBe("environment file");
    expect(result.policy.sharing?.shareUrl).toBe("off");
    expect(result.policy.capabilities).toEqual(["data:add"]);
    expect(result.policy.branding?.appName).toBe("Acme Maps");
    expect(result.operator.sidecar).toBe(false);
  });

  it("rejects documents that fail the schema or aren't recognized", () => {
    expect(() => importText('{"version":1,"interface":{"level":"expert"}}', emptyPolicy(), operator)).toThrow(/schema/);
    expect(() => importText('{"hello":"world"}', emptyPolicy(), operator)).toThrow(/Unrecognized/);
    expect(() => importText("just words", emptyPolicy(), operator)).toThrow(/KEY=VALUE/);
  });
});
