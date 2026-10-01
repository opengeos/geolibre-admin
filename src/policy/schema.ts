import { CAPABILITIES, EXPERIENCE_LEVELS, SCHEMA_URL, SERVICE_KINDS } from "./types";

const stringList = { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true };

/**
 * JSON Schema (draft 2020-12) for `deployment.json` version 1.
 *
 * `schema/deployment.schema.json` is generated from this object with
 * `npm run sync:schema`; a test fails when the two drift.
 */
export const deploymentSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: SCHEMA_URL,
  title: "GeoLibre deployment policy",
  description:
    "Client-facing settings for a GeoLibre deployment. Every value is public: never put secrets here.",
  type: "object",
  additionalProperties: false,
  required: ["version"],
  properties: {
    $schema: { type: "string" },
    version: { const: 1 },
    capabilities: {
      description: "Capabilities granted to the app. Omit to grant all; an empty list grants none.",
      type: "array",
      items: { enum: [...CAPABILITIES] },
      uniqueItems: true,
    },
    interface: {
      description: "The admin-profile.json settings: experience level, lock, and hidden items.",
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        level: { enum: [...EXPERIENCE_LEVELS] },
        lock: { type: "boolean" },
        hiddenDataSources: stringList,
        hiddenPlugins: stringList,
        hiddenMenus: stringList,
        hiddenMenuItems: stringList,
      },
    },
    services: {
      type: "object",
      additionalProperties: false,
      properties: {
        builtins: { type: "boolean" },
        catalog: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name", "kind", "fields"],
            properties: {
              id: { type: "string", pattern: "\\S" },
              name: { type: "string", pattern: "\\S" },
              kind: { enum: [...SERVICE_KINDS] },
              category: { type: "string" },
              fields: {
                type: "object",
                minProperties: 1,
                additionalProperties: { type: ["string", "number", "boolean"] },
              },
            },
          },
        },
      },
    },
    sharing: {
      type: "object",
      additionalProperties: false,
      properties: {
        shareUrl: { type: "string", minLength: 1 },
        collabUrl: { type: "string", minLength: 1 },
        embedOrigins: stringList,
      },
    },
    geolens: {
      type: "object",
      additionalProperties: false,
      properties: { url: { type: "string", minLength: 1 } },
    },
    branding: {
      type: "object",
      additionalProperties: false,
      properties: {
        appName: { type: "string", maxLength: 60 },
        welcome: { type: "boolean" },
      },
    },
  },
} as const;
