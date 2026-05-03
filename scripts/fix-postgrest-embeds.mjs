#!/usr/bin/env node
// fix-postgrest-embeds.mjs
//
// Auto-applies the suggested FK hints from scripts/postgrest-ambiguous.json
// to every unhinted ambiguous embed found by the audit. Mirrors the audit
// parser so that whatever the audit reports, this script rewrites.
//
// Only applies a hint where `suggested_hint` is non-null. Findings without
// a suggested_hint require a human decision and are left alone.
//
// Usage:
//   node scripts/fix-postgrest-embeds.mjs           # default: src/
//   node scripts/fix-postgrest-embeds.mjs path/     # custom root

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");
const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(repoRoot, "src");

const ambiguous = JSON.parse(
  readFileSync(join(repoRoot, "scripts", "postgrest-ambiguous.json"), "utf8")
);

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

let totalFixed = 0;
let totalSkipped = 0;
const filesChanged = [];

for (const file of walk(root)) {
  let src = readFileSync(file, "utf8");
  const insertions = []; // { offset: number, text: string, where: string }

  // Use /d flag for indices on capture groups
  const fromRe = /\.from\(\s*["']([a-z0-9_]+)["']\s*\)\s*\.select\(\s*([`"'])([\s\S]*?)\2\s*[,)]/gd;
  let fm;
  while ((fm = fromRe.exec(src))) {
    const fromTable = fm[1];
    const selectStr = fm[3];
    // fm.indices[3] = [start, end] of select content within src
    const selectStart = fm.indices[3][0];

    const stack = [fromTable];
    let i = 0;
    while (i < selectStr.length) {
      if (/[\s,]/.test(selectStr[i])) { i++; continue; }
      const tail = selectStr.slice(i);
      const m = tail.match(/^([a-z][a-z0-9_]*)(?:\s*!\s*([a-z0-9_]+))?\s*\(/i);
      if (m) {
        const name = m[1];
        const hint = m[2] || null;
        const parent = stack[stack.length - 1];
        const pairAmbig = ambiguous[parent]?.[name];
        if (pairAmbig && !hint) {
          if (pairAmbig.suggested_hint) {
            insertions.push({
              offset: selectStart + i + name.length,
              text: `!${pairAmbig.suggested_hint}`,
              where: `${parent} → ${name}`,
            });
          } else {
            totalSkipped++;
            console.error(
              `  SKIP (no suggested_hint): ${relative(repoRoot, file)} — ${parent} → ${name}`
            );
          }
        }
        stack.push(name);
        i += m[0].length;
        continue;
      }
      if (selectStr[i] === ")") {
        if (stack.length > 1) stack.pop();
        i++;
        continue;
      }
      i++;
    }
  }

  if (insertions.length > 0) {
    insertions.sort((a, b) => b.offset - a.offset);
    for (const ins of insertions) {
      src = src.slice(0, ins.offset) + ins.text + src.slice(ins.offset);
    }
    writeFileSync(file, src);
    totalFixed += insertions.length;
    filesChanged.push({ file: relative(repoRoot, file), count: insertions.length });
  }
}

console.log(`Applied ${totalFixed} FK hints across ${filesChanged.length} files.`);
if (totalSkipped > 0) console.log(`Skipped ${totalSkipped} (no suggested_hint — manual fix required).`);
for (const fc of filesChanged.sort((a, b) => b.count - a.count)) {
  console.log(`  ${String(fc.count).padStart(2)}  ${fc.file}`);
}
