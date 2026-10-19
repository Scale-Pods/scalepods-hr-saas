const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Found ${files.length} migration files.`);

const header = [
  "--",
  "-- =========================================================================",
  "-- ScalePods HR SaaS - Complete Consolidated Migration Script",
  "-- Target: Migrate database schema, tables, types, RLS, functions, triggers,",
  "--         storage buckets, and security permissions to a new Supabase project.",
  "-- =========================================================================",
  "--",
  "-- INSTRUCTIONS:",
  "-- 1. Open your target Supabase Dashboard (https://supabase.com/dashboard)",
  "-- 2. Select or create your new project.",
  '-- 3. Go to "SQL Editor" in the left sidebar.',
  '-- 4. Click "New Query", paste this entire script, and click "Run".',
  "-- =========================================================================",
  "\n",
].join("\n");

let fullSql = header;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, "utf8");
  fullSql += "\n-- =========================================================================\n";
  fullSql += `-- FILE: ${file}\n`;
  fullSql += "-- =========================================================================\n\n";
  fullSql += content.trim() + "\n";
}

const outputFile = path.join(__dirname, "..", "supabase", "full_schema_migration.sql");
fs.writeFileSync(outputFile, fullSql, "utf8");

console.log(`Successfully generated: ${outputFile}`);
console.log(`Total lines: ${fullSql.split("\n").length}`);
console.log(`Total size: ${(Buffer.byteLength(fullSql, "utf8") / 1024).toFixed(2)} KB`);
