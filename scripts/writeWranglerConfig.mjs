import { writeFileSync } from "node:fs";

const DEFAULT_NAME = "ypad";
const DEFAULT_COMPATIBILITY_DATE = "2026-04-01";
const DEFAULT_DATABASE_NAME = "ypad-db";
const DEFAULT_DATABASE_ID = "YOUR_DATABASE_ID";
const OUTPUT_PATH = "wrangler.jsonc";

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readFirstEnv(names) {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseRoutesJson(value) {
  if (!value) {
    return undefined;
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`WRANGLER_ROUTES_JSON must be valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("WRANGLER_ROUTES_JSON must be a JSON array.");
  }

  for (const [index, route] of parsed.entries()) {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new Error(`WRANGLER_ROUTES_JSON route ${index} must be an object.`);
    }

    if (typeof route.pattern !== "string" || route.pattern.trim() === "") {
      throw new Error(`WRANGLER_ROUTES_JSON route ${index} needs a pattern string.`);
    }
  }

  return parsed;
}

const routesJson = readEnv("WRANGLER_ROUTES_JSON");
const route = readEnv("WRANGLER_ROUTE");

if (routesJson && route) {
  throw new Error("Set WRANGLER_ROUTE or WRANGLER_ROUTES_JSON, not both.");
}

const config = {
  $schema: "./node_modules/wrangler/config-schema.json",
  name: readEnv("WRANGLER_NAME") ?? DEFAULT_NAME,
  main: "src/index.ts",
  compatibility_date: readEnv("WRANGLER_COMPATIBILITY_DATE") ?? DEFAULT_COMPATIBILITY_DATE,
  vars: {
    DISABLE_RATE_LIMITS: readEnv("DISABLE_RATE_LIMITS") ?? "true",
  },
  assets: {
    directory: "./dist",
    binding: "ASSETS",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: readEnv("WRANGLER_D1_DATABASE_NAME") ?? DEFAULT_DATABASE_NAME,
      database_id:
        readFirstEnv(["WRANGLER_D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID"]) ??
        DEFAULT_DATABASE_ID,
    },
  ],
  durable_objects: {
    bindings: [
      {
        name: "NOTE_SESSIONS",
        class_name: "NoteSessionDurableObject",
        script_name: readEnv("WRANGLER_NAME") ?? DEFAULT_NAME,
      },
      {
        name: "RATE_LIMITER",
        class_name: "RateLimiterDurableObject",
        script_name: readEnv("WRANGLER_NAME") ?? DEFAULT_NAME,
      },
    ],
  },
  migrations: [
    {
      tag: "v1",
      new_classes: ["NoteSessionDurableObject"],
    },
    {
      tag: "v2",
      new_classes: ["RateLimiterDurableObject"],
    },
  ],
  triggers: {
    crons: ["*/15 * * * *"],
  },
};

const accountId = readEnv("CLOUDFLARE_ACCOUNT_ID");
if (accountId) {
  config.account_id = accountId;
}

if (route) {
  config.routes = [{ pattern: route, custom_domain: true }];
}

const parsedRoutes = parseRoutesJson(routesJson);
if (parsedRoutes) {
  config.routes = parsedRoutes;
}

writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify(config, null, 2)}
`,
);

const routeCount = Array.isArray(config.routes) ? config.routes.length : 0;
console.log(`Wrote ${OUTPUT_PATH} for Worker "${config.name}" with ${routeCount} route(s).`);
