#!/usr/bin/env node
/**
 * Diff computed styles, layout properties, and dialog-relative bounding boxes
 * between two capture runs.
 *
 * Exits non-zero if visual/layout differences are found or if remaining unmatched
 * elements exceed the threshold (unless --allow-unmatched is passed).
 */

const fs = require("fs");

const BBOX_TOLERANCE_PX = 1;

const args = process.argv.slice(2);
const positional = [];
let allowUnmatched = false;
let unmatchedThreshold = 0;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--allow-unmatched") {
    allowUnmatched = true;
  } else if (arg === "--unmatched-threshold" && args[i + 1] !== undefined) {
    const parsed = Number.parseInt(args[++i], 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      console.error(`Invalid --unmatched-threshold value: ${args[i]}`);
      process.exit(2);
    }
    unmatchedThreshold = parsed;
  } else if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`);
    process.exit(2);
  } else {
    positional.push(arg);
  }
}

const file1 = positional[0];
const file2 = positional[1];

if (!file1 || !file2) {
  console.error(
    "Usage: node diff-styles.cjs <file1.json> <file2.json> [--allow-unmatched] [--unmatched-threshold <n>]",
  );
  process.exit(2);
}

const data1 = JSON.parse(fs.readFileSync(file1, "utf8"));
const data2 = JSON.parse(fs.readFileSync(file2, "utf8"));

const states1 = Object.keys(data1);
const states2 = Object.keys(data2);
const stateSet1 = new Set(states1);
const stateSet2 = new Set(states2);
const missingInBStates = states1.filter((s) => !stateSet2.has(s));
const missingInAStates = states2.filter((s) => !stateSet1.has(s));

console.log(
  `Comparing ${file1} (${states1.length} states) vs ${file2} (${states2.length} states)...`,
);

const colorAndVisualProps = [
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

const layoutProps = [
  "width",
  "height",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "fontSize",
  "fontWeight",
  "lineHeight",
];

const bboxKeys = ["x", "y", "width", "height"];

function getFallbackSignature(el) {
  const slot = el.dataSlot || el.role || el.tag || "";
  const visible = (el.text || el.label || "").trim();
  if (!el.dataSlot && !el.role && !visible) return null;
  return `${el.tag}::${slot}::${visible}`;
}

function compareElements(el1, el2) {
  const propDiffs = [];
  const categories = new Set();

  for (const prop of colorAndVisualProps) {
    if (el1[prop] !== el2[prop]) {
      propDiffs.push({
        prop,
        category: "colorVisual",
        oldVal: el1[prop],
        newVal: el2[prop],
      });
      categories.add("colorVisual");
    }
  }

  for (const prop of layoutProps) {
    if (el1[prop] !== el2[prop]) {
      propDiffs.push({
        prop,
        category: "layout",
        oldVal: el1[prop],
        newVal: el2[prop],
      });
      categories.add("layout");
    }
  }

  if (el1.bbox && el2.bbox) {
    for (const k of bboxKeys) {
      const v1 = el1.bbox[k];
      const v2 = el2.bbox[k];
      if (
        typeof v1 === "number" &&
        typeof v2 === "number" &&
        Math.abs(v1 - v2) > BBOX_TOLERANCE_PX
      ) {
        propDiffs.push({
          prop: `bbox.${k}`,
          category: "bbox",
          oldVal: v1,
          newVal: v2,
        });
        categories.add("bbox");
      }
    }
  }

  return { propDiffs, categories };
}

let statesCompared = 0;
let totalMatchedByPath = 0;
let totalMatchedByFallback = 0;
let totalPathUnmatchedA = 0;
let totalPathUnmatchedB = 0;
let totalRemainingUnmatchedA = 0;
let totalRemainingUnmatchedB = 0;
let totalDifferences = 0;

const diffsByState = {};
const diffsByComponent = {};
const diffsByCategory = { colorVisual: 0, layout: 0, bbox: 0 };
const unmatchedSummaryByState = {};

for (const state of states1) {
  if (!data2[state]) {
    console.warn(`State missing in second run: ${state}`);
    continue;
  }

  statesCompared++;
  const map1 = data1[state];
  const map2 = data2[state];
  const entries1 = Object.entries(map1);
  const entries2 = Object.entries(map2);

  const matched1 = new Set();
  const matched2 = new Set();
  const matchedPairs = [];

  // 1. Exact path match
  for (const [elPath, el1] of entries1) {
    const el2 = map2[elPath];
    if (el2) {
      matched1.add(elPath);
      matched2.add(elPath);
      matchedPairs.push({
        matchType: "path",
        pathA: elPath,
        pathB: elPath,
        el1,
        el2,
      });
      totalMatchedByPath++;
    }
  }

  // 2. Collect elements unmatched by exact path
  const unmatchedByPathA = entries1.filter(([p]) => !matched1.has(p));
  const unmatchedByPathB = entries2.filter(([p]) => !matched2.has(p));

  const pathUnmatchedACount = unmatchedByPathA.length;
  const pathUnmatchedBCount = unmatchedByPathB.length;
  totalPathUnmatchedA += pathUnmatchedACount;
  totalPathUnmatchedB += pathUnmatchedBCount;

  // 3. Fallback matcher: data-slot + visible text/label + occurrence order
  const fallbackBucketsB = new Map();
  for (const [elPathB, el2] of unmatchedByPathB) {
    const sig = getFallbackSignature(el2);
    if (!sig) continue;
    if (!fallbackBucketsB.has(sig)) {
      fallbackBucketsB.set(sig, []);
    }
    fallbackBucketsB.get(sig).push([elPathB, el2]);
  }

  let fallbackMatchedCount = 0;
  for (const [elPathA, el1] of unmatchedByPathA) {
    const sig = getFallbackSignature(el1);
    if (!sig) continue;
    const bucket = fallbackBucketsB.get(sig);
    if (bucket && bucket.length > 0) {
      const [elPathB, el2] = bucket.shift();
      matched1.add(elPathA);
      matched2.add(elPathB);
      matchedPairs.push({
        matchType: "fallback",
        fallbackSig: sig,
        pathA: elPathA,
        pathB: elPathB,
        el1,
        el2,
      });
      fallbackMatchedCount++;
      totalMatchedByFallback++;
    }
  }

  const remainingA = entries1
    .filter(([p]) => !matched1.has(p))
    .map(([elPath, el]) => ({ path: elPath, ...el }));
  const remainingB = entries2
    .filter(([p]) => !matched2.has(p))
    .map(([elPath, el]) => ({ path: elPath, ...el }));

  totalRemainingUnmatchedA += remainingA.length;
  totalRemainingUnmatchedB += remainingB.length;

  if (
    pathUnmatchedACount > 0 ||
    pathUnmatchedBCount > 0 ||
    remainingA.length > 0 ||
    remainingB.length > 0
  ) {
    unmatchedSummaryByState[state] = {
      pathUnmatchedA: pathUnmatchedACount,
      pathUnmatchedB: pathUnmatchedBCount,
      fallbackMatched: fallbackMatchedCount,
      remainingA,
      remainingB,
    };
  }

  // 4. Compare matched pairs
  const stateDiffs = [];
  for (const pair of matchedPairs) {
    const { propDiffs, categories } = compareElements(pair.el1, pair.el2);
    if (propDiffs.length > 0) {
      totalDifferences++;
      for (const cat of categories) {
        diffsByCategory[cat] = (diffsByCategory[cat] || 0) + 1;
      }

      const compKey = pair.el1.dataSlot || pair.el1.role || pair.el1.tag;
      diffsByComponent[compKey] = (diffsByComponent[compKey] || 0) + 1;

      stateDiffs.push({
        matchType: pair.matchType,
        fallbackSig: pair.fallbackSig || null,
        pathA: pair.pathA,
        pathB: pair.pathB,
        tag: pair.el1.tag,
        text: pair.el1.text,
        label: pair.el1.label || null,
        role: pair.el1.role,
        dataSlot: pair.el1.dataSlot,
        oldClass: pair.el1.className,
        newClass: pair.el2.className,
        propDiffs,
      });
    }
  }

  if (stateDiffs.length > 0) {
    diffsByState[state] = stateDiffs;
  }
}

for (const state of missingInAStates) {
  console.warn(`State missing in first run: ${state}`);
}

const totalRemainingUnmatched =
  totalRemainingUnmatchedA + totalRemainingUnmatchedB;
const unmatchedExceeded =
  !allowUnmatched && totalRemainingUnmatched > unmatchedThreshold;

console.log("\n=======================================================");
console.log("COMPUTED STYLE & LAYOUT COMPARISON RESULT:");
console.log(
  `States compared: ${statesCompared} (missing in A: ${missingInAStates.length}, missing in B: ${missingInBStates.length})`,
);
console.log(
  `Elements compared: ${totalMatchedByPath + totalMatchedByFallback} (by path: ${totalMatchedByPath}, by fallback: ${totalMatchedByFallback})`,
);
console.log(
  `Unmatched elements by path: A=${totalPathUnmatchedA}, B=${totalPathUnmatchedB} (recovered by fallback: ${totalMatchedByFallback})`,
);
console.log(
  `Remaining unmatched elements: A=${totalRemainingUnmatchedA}, B=${totalRemainingUnmatchedB}, total=${totalRemainingUnmatched} (threshold: ${unmatchedThreshold}, allowUnmatched: ${allowUnmatched})`,
);
console.log(`Total element differences found: ${totalDifferences}`);
console.log("Differences by category:", diffsByCategory);
console.log("Differences by component:", diffsByComponent);
console.log("=======================================================\n");

if (Object.keys(unmatchedSummaryByState).length > 0) {
  console.log("--- UNMATCHED ELEMENTS SUMMARY BY STATE ---");
  for (const [state, info] of Object.entries(unmatchedSummaryByState)) {
    console.log(
      `  [${state}] pathUnmatched(A=${info.pathUnmatchedA}, B=${info.pathUnmatchedB}) fallbackMatched=${info.fallbackMatched} remaining(A=${info.remainingA.length}, B=${info.remainingB.length})`,
    );
    for (const el of info.remainingA.slice(0, 15)) {
      console.log(
        `    -A <${el.tag}> [data-slot="${el.dataSlot}"] [role="${el.role}"] text="${el.text}" label="${el.label}" :: ${el.path}`,
      );
    }
    if (info.remainingA.length > 15) {
      console.log(`    ... and ${info.remainingA.length - 15} more in A`);
    }
    for (const el of info.remainingB.slice(0, 15)) {
      console.log(
        `    +B <${el.tag}> [data-slot="${el.dataSlot}"] [role="${el.role}"] text="${el.text}" label="${el.label}" :: ${el.path}`,
      );
    }
    if (info.remainingB.length > 15) {
      console.log(`    ... and ${info.remainingB.length - 15} more in B`);
    }
  }
  console.log("");
}

if (totalDifferences > 0) {
  for (const [state, diffs] of Object.entries(diffsByState)) {
    console.log(`\n--- STATE: ${state} (${diffs.length} differences) ---`);
    for (const d of diffs) {
      const matchBadge =
        d.matchType === "fallback"
          ? ` [match: fallback (${d.fallbackSig})]`
          : "";
      console.log(
        `  Element${matchBadge}: <${d.tag}> [data-slot="${d.dataSlot}"] [role="${d.role}"] "${d.text || d.label || ""}"`,
      );
      if (d.pathA === d.pathB) {
        console.log(`    Path: ${d.pathA}`);
      } else {
        console.log(`    Path A: ${d.pathA}`);
        console.log(`    Path B: ${d.pathB}`);
      }
      if (d.oldClass !== d.newClass) {
        console.log(`    Class A: ${d.oldClass}`);
        console.log(`    Class B: ${d.newClass}`);
      }
      for (const p of d.propDiffs) {
        console.log(`    Diff [${p.prop}]: ${p.oldVal} -> ${p.newVal}`);
      }
    }
  }
}

if (
  totalDifferences > 0 ||
  unmatchedExceeded ||
  missingInAStates.length > 0 ||
  missingInBStates.length > 0
) {
  if (unmatchedExceeded) {
    console.error(
      `\nFAIL: Remaining unmatched elements (${totalRemainingUnmatched}) exceed threshold (${unmatchedThreshold}). Pass --allow-unmatched to ignore unmatched element count.`,
    );
  }
  process.exit(1);
}

process.exit(0);
