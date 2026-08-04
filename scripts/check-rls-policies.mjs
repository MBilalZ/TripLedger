#!/usr/bin/env node
/**
 * Static RLS policy checks against supabase/migrations (no live DB required).
 * Ensures money-table policies are SELECT-scoped for expenses/splits and that
 * remove_participant RPC exists in the migration chain.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../supabase/migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const combined = files
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

const checks = [
  {
    name: "expenses_all dropped in favor of expenses_select",
    ok:
      /drop policy if exists expenses_all on public\.expenses/i.test(combined) &&
      /create policy expenses_select on public\.expenses/i.test(combined),
  },
  {
    name: "expense_splits_all dropped in favor of expense_splits_select",
    ok:
      /drop policy if exists expense_splits_all on public\.expense_splits/i.test(
        combined,
      ) &&
      /create policy expense_splits_select on public\.expense_splits/i.test(combined),
  },
  {
    name: "pool_members uses explicit select/insert/update/delete policies",
    ok:
      /drop policy if exists pool_members_all on public\.pool_members/i.test(combined) &&
      /create policy pool_members_select on public\.pool_members/i.test(combined) &&
      /create policy pool_members_insert on public\.pool_members/i.test(combined) &&
      /create policy pool_members_update on public\.pool_members/i.test(combined) &&
      /create policy pool_members_delete on public\.pool_members/i.test(combined),
  },
  {
    name: "remove_participant security definer RPC",
    ok: /create or replace function public\.remove_participant\s*\(/i.test(combined),
  },
  {
    name: "expense write RPCs present",
    ok:
      /create or replace function public\.create_expense_with_splits/i.test(combined) &&
      /create or replace function public\.revise_expense_with_splits/i.test(combined) &&
      /create or replace function public\.void_expense/i.test(combined),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`OK  ${c.name}`);
  } else {
    console.error(`FAIL ${c.name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} RLS policy check(s) failed`);
  process.exit(1);
}
console.log("\nAll RLS policy static checks passed.");
