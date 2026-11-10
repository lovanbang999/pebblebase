#!/usr/bin/env node
/**
 * Diff computed styles between two capture runs.
 * Exits with 0 if identical, 1 if differences found.
 */

const fs = require("fs");

const file1 = process.argv[2];
const file2 = process.argv[3];

if (!file1 || !file2) {
  console.error("Usage: node diff-styles.cjs <file1.json> <file2.json>");
  process.exit(2);
}

const data1 = JSON.parse(fs.readFileSync(file1, "utf8"));
const data2 = JSON.parse(fs.readFileSync(file2, "utf8"));

const states1 = Object.keys(data1);
const states2 = Object.keys(data2);

console.log(
  `Comparing ${file1} (${states1.length} states) vs ${file2} (${states2.length} states)...`,
);

const styleProps = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "boxShadow",
  "opacity",
];

let totalDifferences = 0;
const diffsByState = {};
const diffsByComponent = {};

for (const state of states1) {
  if (!data2[state]) {
    console.warn(`State missing in second run: ${state}`);
    continue;
  }

  const map1 = data1[state];
  const map2 = data2[state];
  const stateDiffs = [];

  for (const [path, el1] of Object.entries(map1)) {
    const el2 = map2[path];
    if (!el2) continue; // element path mismatch or dynamic id

    const propDiffs = [];
    for (const prop of styleProps) {
      if (el1[prop] !== el2[prop]) {
        propDiffs.push({
          prop,
          oldVal: el1[prop],
          newVal: el2[prop],
        });
      }
    }

    if (propDiffs.length > 0) {
      totalDifferences++;
      const item = {
        path,
        tag: el1.tag,
        text: el1.text,
        role: el1.role,
        dataSlot: el1.dataSlot,
        oldClass: el1.className,
        newClass: el2.className,
        propDiffs,
      };
      stateDiffs.push(item);

      const compKey = el1.dataSlot || el1.role || el1.tag;
      diffsByComponent[compKey] = (diffsByComponent[compKey] || 0) + 1;
    }
  }

  if (stateDiffs.length > 0) {
    diffsByState[state] = stateDiffs;
  }
}

console.log("\n=======================================================");
console.log(`COMPUTED STYLE COMPARISON RESULT:`);
console.log(`Total element style differences found: ${totalDifferences}`);
console.log(`Differences by component:`, diffsByComponent);
console.log("=======================================================\n");

if (totalDifferences > 0) {
  for (const [state, diffs] of Object.entries(diffsByState)) {
    console.log(`\n--- STATE: ${state} (${diffs.length} differences) ---`);
    for (const d of diffs) {
      console.log(
        `  Element: <${d.tag}> [data-slot="${d.dataSlot}"] [role="${d.role}"] "${d.text}"`,
      );
      console.log(`    Path: ${d.path}`);
      for (const p of d.propDiffs) {
        console.log(`    Diff [${p.prop}]: ${p.oldVal} -> ${p.newVal}`);
      }
    }
  }
  process.exit(1);
}

process.exit(0);
