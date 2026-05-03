#!/usr/bin/env node
// audit-postgrest-embeds.mjs
//
// Scans every .ts/.tsx in src/ for supabase-js `.from("X").select("...")`
// queries and reports any embed `Y(...)` whose (X → Y) PostgREST relationship
// is ambiguous (more than one direct FK or junction-table path between them).
// Ambiguous embeds without an FK hint return PostgREST 300 "Multiple Choices"
// at runtime, which manifests as a page silently rendering empty data.
//
// Pass an FK hint like `Y!constraint_name(...)` to disambiguate. Constraint
// names for the safe FK to use are listed in scripts/postgrest-ambiguous.json.
//
// Usage:
//   node scripts/audit-postgrest-embeds.mjs            # default: src/
//   node scripts/audit-postgrest-embeds.mjs path/      # custom root
//
// Exits 0 if clean, 1 if any unhinted ambiguous embed is found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");
const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(repoRoot, "src");

const mapPath = join(repoRoot, "scripts", "postgrest-ambiguous.json");
let ambiguous;
try {
  ambiguous = JSON.parse(readFileSync(mapPath, "utf8"));
} catch (e) {
  console.error(`Could not read ${mapPath}.`);
  process.exit(2);
}

const TS_EXT = /\.(ts|tsx)$/;
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".") || name === "dist") continue;
      yield* walk(p);
    } else if (TS_EXT.test(name)) {
      yield p;
    }
  }
}

// Walk the body of a select(`...`) string and emit (parent, child, hint)
// tuples for every embed. Tracks parent via a stack pushed on each
// embed-name match and popped on the matching close paren.
function parseEmbeds(s, fromTable) {
  const out = [];
  const stack = [fromTable];
  let i = 0;
  while (i < s.length) {
    // skip whitespace/commas
    if (/[\s,]/.test(s[i])) { i++; continue; }

    // try to match `name(` or `name!hint(`
    const m = s.slice(i).match(/^([a-z][a-z0-9_]*)(?:\s*!\s*([a-z0-9_]+))?\s*\(/i);
    if (m) {
      const name = m[1];
      const hint = m[2] || null;
      const parent = stack[stack.length - 1];
      out.push({ parent, child: name, hint, offset: i });
      stack.push(name);
      i += m[0].length;
      continue;
    }

    if (s[i] === ")") {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }

    // any other character: skip
    i++;
  }
  return out;
}

let issueCount = 0;
const findings = [];

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  // .from("X").select(`...`) or .select("...") — capture the select arg string.
  const fromRe = /\.from\(\s*["']([a-z0-9_]+)["']\s*\)\s*\.select\(\s*([`"'])([\s\S]*?)\2\s*[,)]/g;
  let fm;
  while ((fm = fromRe.exec(src))) {
    const fromTable = fm[1];
    const selectStr = fm[3];
    const startLine = src.slice(0, fm.index).split("\n").length;

    for (const embed of parseEmbeds(selectStr, fromTable)) {
      const pairAmbig = ambiguous[embed.parent]?.[embed.child];
      if (pairAmbig && !embed.hint) {
        const lineInSel = selectStr.slice(0, embed.offset).split("\n").length - 1;
        issueCount++;
        findings.push({
          file: relative(repoRoot, file),
          line: startLine + lineInSel,
          parent: embed.parent,
          child: embed.child,
          paths: pairAmbig.paths,
          suggested: pairAmbig.suggested_hint
            ? `${embed.child}!${pairAmbig.suggested_hint}(...)`
            : null,
        });
      }
    }
  }
}

if (findings.length === 0) {
  console.log("OK: no ambiguous embeds without FK hints found.");
  process.exit(0);
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log(`Found ${findings.length} ambiguous embed(s) without FK hints:\n`);
for (const [file, items] of byFile) {
  console.log(file);
  for (const it of items) {
    console.log(`  L${it.line}: ${it.parent} → ${it.child}  (${it.paths} paths)`);
    if (it.suggested) console.log(`    fix: ${it.child}(...) → ${it.suggested}`);
    else console.log(`    fix: pick the FK manually — paths are not auto-resolvable from suggested_hint`);
  }
  console.log();
}
process.exit(1);
