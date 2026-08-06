#!/usr/bin/env node
/**
 * One-shot Supabase setup for TripLedger.
 *
 * Required env:
 *   SUPABASE_PROJECT_REF
 *   SUPABASE_ANON_KEY
 *   SUPABASE_DB_PASSWORD
 *
 * Optional:
 *   SUPABASE_SERVICE_ROLE_KEY  (validated only; not written to client env)
 *   SUPABASE_ACCESS_TOKEN      (Management API: email auth + redirect URLs)
 *   SUPABASE_DB_HOST           (override; default db.<ref>.supabase.co)
 *   SUPABASE_DB_USER           (override; default postgres — use postgres.<ref> for pooler)
 *   SKIP_GH_SECRETS=1
 *   SKIP_MIGRATE=1
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migrationsDir = join(root, "supabase/migrations");

/** Load KEY=VALUE from a gitignored file into process.env (does not override). */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// SUPABASE_ENV=stage → load .env.supabase.stage (local testing project).
// Default / prod → .env.supabase.
const supabaseEnvName = (process.env.SUPABASE_ENV || "prod").trim().toLowerCase();
const supabaseEnvFile =
  supabaseEnvName === "stage" || supabaseEnvName === "staging"
    ? ".env.supabase.stage"
    : ".env.supabase";
loadEnvFile(join(root, supabaseEnvFile));
loadEnvFile(join(root, ".env"));
console.log(`Using credentials from ${supabaseEnvFile}`);

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function optionalEnv(name) {
  return process.env[name]?.trim() || "";
}

function log(step, msg) {
  console.log(`\n==> ${step}\n${msg}`);
}

function listMigrationFiles() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations dir not found: ${migrationsDir}`);
  }
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function applyMigrations(ref, password) {
  if (process.env.SKIP_MIGRATE === "1") {
    log("migrate", "Skipped (SKIP_MIGRATE=1)");
    return;
  }
  const files = listMigrationFiles();
  if (!files.length) {
    throw new Error(`No .sql migrations in ${migrationsDir}`);
  }
  const host = optionalEnv("SUPABASE_DB_HOST") || `db.${ref}.supabase.co`;
  const user = optionalEnv("SUPABASE_DB_USER") || "postgres";
  const rejectUnauthorized = process.env.SUPABASE_DB_SSL_INSECURE !== "1";
  const client = new pg.Client({
    host,
    port: 5432,
    database: "postgres",
    user,
    password,
    ssl: { rejectUnauthorized },
    connectionTimeoutMillis: 30_000,
  });

  log(
    "migrate",
    `Connecting to ${user}@${host} (TLS verify ${rejectUnauthorized ? "on" : "off"}) …`,
  );
  await client.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    for (const file of files) {
      const { rows } = await client.query(
        `select 1 from public.schema_migrations where filename = $1`,
        [file],
      );
      if (rows.length) {
        log("migrate", `Already recorded ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          `insert into public.schema_migrations (filename) values ($1)`,
          [file],
        );
        await client.query("commit");
        log("migrate", `Applied ${file}`);
      } catch (e) {
        await client.query("rollback");
        const msg = e instanceof Error ? e.message : String(e);
        // Do not mark failed migrations as applied — that hides env drift.
        // If a legacy DB was applied before schema_migrations existed, record
        // the matching filename manually after verifying objects/policies.
        throw new Error(
          `Migration ${file} failed: ${msg}\n` +
            (/already exists/i.test(msg)
              ? "Hint: objects already exist. Verify the schema, then insert the filename into public.schema_migrations only if the migration is fully applied."
              : ""),
        );
      }
    }
  } finally {
    await client.end();
  }
}

async function configureAuth(ref, accessToken) {
  if (!accessToken) {
    log(
      "auth",
      "SUPABASE_ACCESS_TOKEN not set — skip Management API.\n" +
        "Manually in Authentication → Providers: enable Email, disable Anonymous.\n" +
        "Under Auth → Settings: disable “Confirm email” (autoconfirm) so signup needs no SMTP.\n" +
        "Add Site URL / redirect allow list for localhost and GitHub Pages.",
    );
    return;
  }

  const siteUrl = "https://MBilalZ.github.io/TripLedger";
  const redirects = [
    "http://localhost:5173",
    "http://localhost:5173/**",
    "https://MBilalZ.github.io/TripLedger",
    "https://MBilalZ.github.io/TripLedger/**",
  ].join(",");

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site_url: siteUrl,
      uri_allow_list: redirects,
      external_anonymous_users_enabled: false,
      external_email_enabled: true,
      mailer_autoconfirm: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Auth config failed (${res.status}): ${body}\n` +
        "Create an access token at https://supabase.com/dashboard/account/tokens",
    );
  }
  log(
    "auth",
    "Email/password enabled; anonymous disabled; email autoconfirm on; Site URL + redirects set.",
  );
}

function writeEnvLocal(url, anonKey) {
  const path = join(root, "apps/web/.env.local");
  const vapid = optionalEnv("VITE_VAPID_PUBLIC_KEY");
  const contents = [
    `# Generated by pnpm setup:supabase — do not commit`,
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_ANON_KEY=${anonKey}`,
    ...(vapid ? [`VITE_VAPID_PUBLIC_KEY=${vapid}`] : []),
    "",
  ].join("\n");
  writeFileSync(path, contents, "utf8");
  log("env", `Wrote ${path}`);
}

function setGhSecrets(url, anonKey) {
  if (process.env.SKIP_GH_SECRETS === "1") {
    log("github", "Skipped (SKIP_GH_SECRETS=1)");
    return;
  }
  const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (gh.status !== 0) {
    log(
      "github",
      "gh CLI not found — set secrets manually:\n" +
        "  VITE_SUPABASE_URL\n  VITE_SUPABASE_ANON_KEY\n  VITE_VAPID_PUBLIC_KEY",
    );
    return;
  }

  const secrets = [
    ["VITE_SUPABASE_URL", url],
    ["VITE_SUPABASE_ANON_KEY", anonKey],
  ];
  const vapid = optionalEnv("VITE_VAPID_PUBLIC_KEY");
  if (vapid) secrets.push(["VITE_VAPID_PUBLIC_KEY", vapid]);

  for (const [name, value] of secrets) {
    const r = spawnSync("gh", ["secret", "set", name], {
      input: value,
      encoding: "utf8",
      cwd: root,
    });
    if (r.status !== 0) {
      throw new Error(`gh secret set ${name} failed:\n${r.stderr || r.stdout}`);
    }
  }
  log(
    "github",
    vapid
      ? "Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY"
      : "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
  );
}

async function main() {
  const ref = requireEnv("SUPABASE_PROJECT_REF");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const dbPassword = requireEnv("SUPABASE_DB_PASSWORD");
  const serviceRole = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = optionalEnv("SUPABASE_ACCESS_TOKEN");
  const url = `https://${ref}.supabase.co`;

  if (serviceRole) {
    log("creds", "SUPABASE_SERVICE_ROLE_KEY present (not written to client env)");
  } else {
    log(
      "creds",
      "SUPABASE_SERVICE_ROLE_KEY optional for this script (DB password used for migrate)",
    );
  }

  await applyMigrations(ref, dbPassword);
  await configureAuth(ref, accessToken);
  writeEnvLocal(url, anonKey);
  setGhSecrets(url, anonKey);

  console.log(`
Done.

Local:  pnpm dev   (loads apps/web/.env.local)
Auth:   email + password (no confirmation email). Sign up in the app.
Edge:   supabase functions deploy send-push
Push:   npx web-push generate-vapid-keys
        supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com PUSH_DRAIN_SECRET=...
        set VITE_VAPID_PUBLIC_KEY (local + gh secret)
        schedule cron drain with PUSH_DRAIN_SECRET bearer (see docs/RUNBOOK.md)
Prod:   push or redeploy the prod branch so GitHub Actions rebuilds with secrets.

  git checkout prod && git push origin prod
`);
}

main().catch((err) => {
  console.error("\nsetup-supabase failed:\n", err.message || err);
  process.exit(1);
});
