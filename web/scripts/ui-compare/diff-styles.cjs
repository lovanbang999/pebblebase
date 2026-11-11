#!/usr/bin/env node
/**
 * Diff computed styles, layout properties, and dialog-relative bounding boxes
 * between two capture runs.
 *
 * Exits non-zero if visual/layout differences are found or if remaining unmatched
 * elements exceed the threshold (unless --allow-unmatched is passed).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PNG } = require("playwright-core/lib/utilsBundle");
const { utils: pwCoreUtils } = require("playwright-core/lib/coreBundle");

const BBOX_TOLERANCE_PX = 1;
const CROP_PADDING_PX = 24;
const SCREENSHOT_AA_MAX_PIXELS = 64;
const SCREENSHOT_AA_MAX_CHANNEL_DELTA = 4;
const SCREENSHOT_AA_MAX_BBOX_WIDTH = 40;
const SCREENSHOT_AA_MAX_BBOX_HEIGHT = 40;

const args = process.argv.slice(2);
const positional = [];
let allowUnmatched = false;
let unmatchedThreshold = 0;
let screenshotDiffDir = "";
let strictScreenshots = false;

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
  } else if (arg === "--screenshot-diff-dir" && args[i + 1] !== undefined) {
    screenshotDiffDir = args[++i];
  } else if (arg === "--strict-screenshots") {
    strictScreenshots = true;
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
    "Usage: node diff-styles.cjs <file1.json> <file2.json> [--allow-unmatched] [--unmatched-threshold <n>] [--screenshot-diff-dir <dir>] [--strict-screenshots]",
  );
  process.exit(2);
}

if (!screenshotDiffDir) {
  screenshotDiffDir = `/tmp/pb_ui_cmp_dialog_diffs_${Date.now()}_${process.pid}`;
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

// 5. Clipped dialog screenshot comparison (sha256 + pixel/bbox diff + crop export)
function isExpectedDialogState(stateName) {
  return (
    stateName === "row_modal_light" ||
    stateName === "row_modal_dark" ||
    stateName.startsWith("row_modal_")
  );
}

function readJsonIfExists(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function cropPngToRegion(srcPng, cropX, cropY, cropW, cropH) {
  const out = new PNG({ width: cropW, height: cropH });
  const copyW = Math.max(0, Math.min(srcPng.width, cropX + cropW) - cropX);
  const copyH = Math.max(0, Math.min(srcPng.height, cropY + cropH) - cropY);
  if (copyW > 0 && copyH > 0) {
    PNG.bitblt(srcPng, out, cropX, cropY, copyW, copyH, 0, 0);
  }
  return out;
}

const dir1 = path.dirname(path.resolve(file1));
const dir2 = path.dirname(path.resolve(file2));
const clips1 = readJsonIfExists(path.join(dir1, "dialog_clips.json"));
const clips2 = readJsonIfExists(path.join(dir2, "dialog_clips.json"));

const expectedDialogStates = Array.from(
  new Set([
    ...states1.filter(isExpectedDialogState),
    ...states2.filter(isExpectedDialogState),
    ...Object.keys(clips1 || {}),
    ...Object.keys(clips2 || {}),
  ]),
);

const pngComparator = pwCoreUtils.getComparator("image/png");
let dialogClipsCompared = 0;
let dialogClipsIdentical = 0;
const dialogClipTolerated = [];
const dialogClipDiffs = [];
const dialogClipMissing = [];

if (clips1 || clips2 || expectedDialogStates.length > 0) {
  for (const state of expectedDialogStates) {
    const entry1 = clips1 && clips1[state];
    const entry2 = clips2 && clips2[state];
    const imgPath1 = entry1 ? path.join(dir1, entry1.file) : null;
    const imgPath2 = entry2 ? path.join(dir2, entry2.file) : null;

    if (
      !entry1 ||
      !entry2 ||
      !imgPath1 ||
      !imgPath2 ||
      !fs.existsSync(imgPath1) ||
      !fs.existsSync(imgPath2)
    ) {
      dialogClipMissing.push({
        state,
        hasA: Boolean(entry1 && imgPath1 && fs.existsSync(imgPath1)),
        hasB: Boolean(entry2 && imgPath2 && fs.existsSync(imgPath2)),
      });
      continue;
    }

    dialogClipsCompared++;
    const bufA = fs.readFileSync(imgPath1);
    const bufB = fs.readFileSync(imgPath2);
    const shaA = crypto.createHash("sha256").update(bufA).digest("hex");
    const shaB = crypto.createHash("sha256").update(bufB).digest("hex");

    if (shaA === shaB) {
      dialogClipsIdentical++;
      continue;
    }

    const imgA = PNG.sync.read(bufA);
    const imgB = PNG.sync.read(bufB);
    const sizeMatches =
      imgA.width === imgB.width && imgA.height === imgB.height;
    const maxW = Math.max(imgA.width, imgB.width);
    const maxH = Math.max(imgA.height, imgB.height);

    let diffPixels = 0;
    let maxDelta = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    const rawDiffImg = new PNG({ width: maxW, height: maxH });

    for (let y = 0; y < maxH; y++) {
      for (let x = 0; x < maxW; x++) {
        const outIdx = (y * maxW + x) * 4;
        const inA = x < imgA.width && y < imgA.height;
        const inB = x < imgB.width && y < imgB.height;

        if (!inA || !inB) {
          diffPixels++;
          maxDelta = 255;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          rawDiffImg.data[outIdx] = 255;
          rawDiffImg.data[outIdx + 1] = 0;
          rawDiffImg.data[outIdx + 2] = 255;
          rawDiffImg.data[outIdx + 3] = 255;
          continue;
        }

        const idxA = (y * imgA.width + x) * 4;
        const idxB = (y * imgB.width + x) * 4;
        const rA = imgA.data[idxA];
        const gA = imgA.data[idxA + 1];
        const bA = imgA.data[idxA + 2];
        const aA = imgA.data[idxA + 3];
        const rB = imgB.data[idxB];
        const gB = imgB.data[idxB + 1];
        const bB = imgB.data[idxB + 2];
        const aB = imgB.data[idxB + 3];

        const pixelMaxDelta = Math.max(
          Math.abs(rA - rB),
          Math.abs(gA - gB),
          Math.abs(bA - bB),
          Math.abs(aA - aB),
        );

        if (pixelMaxDelta > 0) {
          diffPixels++;
          if (pixelMaxDelta > maxDelta) maxDelta = pixelMaxDelta;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          rawDiffImg.data[outIdx] = 255;
          rawDiffImg.data[outIdx + 1] = 0;
          rawDiffImg.data[outIdx + 2] = 0;
          rawDiffImg.data[outIdx + 3] = 255;
        } else {
          rawDiffImg.data[outIdx] = Math.round(rA * 0.35);
          rawDiffImg.data[outIdx + 1] = Math.round(gA * 0.35);
          rawDiffImg.data[outIdx + 2] = Math.round(bA * 0.35);
          rawDiffImg.data[outIdx + 3] = 255;
        }
      }
    }

    const pwResult = pngComparator(bufA, bufB, {
      threshold: 0,
      maxDiffPixels: 0,
    });
    const diffSourceImg =
      pwResult && pwResult.diff ? PNG.sync.read(pwResult.diff) : rawDiffImg;

    const diffBbox =
      diffPixels > 0
        ? {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          }
        : null;

    const bboxWithinTolerance =
      !diffBbox ||
      (diffBbox.width <= SCREENSHOT_AA_MAX_BBOX_WIDTH &&
        diffBbox.height <= SCREENSHOT_AA_MAX_BBOX_HEIGHT);
    const withinAaTolerance =
      sizeMatches &&
      diffPixels <= SCREENSHOT_AA_MAX_PIXELS &&
      maxDelta <= SCREENSHOT_AA_MAX_CHANNEL_DELTA &&
      bboxWithinTolerance;

    const cropX = diffBbox ? Math.max(0, diffBbox.x - CROP_PADDING_PX) : 0;
    const cropY = diffBbox ? Math.max(0, diffBbox.y - CROP_PADDING_PX) : 0;
    const cropRight = diffBbox
      ? Math.min(maxW, diffBbox.x + diffBbox.width + CROP_PADDING_PX)
      : maxW;
    const cropBottom = diffBbox
      ? Math.min(maxH, diffBbox.y + diffBbox.height + CROP_PADDING_PX)
      : maxH;
    const cropW = Math.max(1, cropRight - cropX);
    const cropH = Math.max(1, cropBottom - cropY);

    fs.mkdirSync(screenshotDiffDir, { recursive: true });
    const safeState = state.replace(/[^a-zA-Z0-9_-]/g, "_");
    const beforeCropPath = path.join(
      screenshotDiffDir,
      `${safeState}_before_crop.png`,
    );
    const afterCropPath = path.join(
      screenshotDiffDir,
      `${safeState}_after_crop.png`,
    );
    const diffCropPath = path.join(
      screenshotDiffDir,
      `${safeState}_diff_crop.png`,
    );

    fs.writeFileSync(
      beforeCropPath,
      PNG.sync.write(cropPngToRegion(imgA, cropX, cropY, cropW, cropH)),
    );
    fs.writeFileSync(
      afterCropPath,
      PNG.sync.write(cropPngToRegion(imgB, cropX, cropY, cropW, cropH)),
    );
    fs.writeFileSync(
      diffCropPath,
      PNG.sync.write(
        cropPngToRegion(diffSourceImg, cropX, cropY, cropW, cropH),
      ),
    );

    const record = {
      state,
      classification: withinAaTolerance
        ? "within-anti-aliasing-tolerance"
        : "different",
      shaA,
      shaB,
      clipA: entry1.clip,
      clipB: entry2.clip,
      sizeA: `${imgA.width}x${imgA.height}`,
      sizeB: `${imgB.width}x${imgB.height}`,
      diffPixels,
      maxDelta,
      diffBbox,
      cropRect: { x: cropX, y: cropY, width: cropW, height: cropH },
      playwrightMessage: pwResult ? pwResult.errorMessage : null,
      beforeCropPath,
      afterCropPath,
      diffCropPath,
    };

    if (withinAaTolerance) {
      dialogClipTolerated.push(record);
    } else {
      dialogClipDiffs.push(record);
    }
  }
}

const totalRemainingUnmatched =
  totalRemainingUnmatchedA + totalRemainingUnmatchedB;
const unmatchedExceeded =
  !allowUnmatched && totalRemainingUnmatched > unmatchedThreshold;
const hasScreenshotFailures =
  dialogClipDiffs.length > 0 ||
  dialogClipMissing.length > 0 ||
  (strictScreenshots && dialogClipTolerated.length > 0);

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
if (expectedDialogStates.length === 0) {
  console.log("Dialog screenshot classification: 0 dialog states in this run");
} else {
  console.log(
    `Dialog screenshot classification (total=${dialogClipsCompared}): (a) byte-identical=${dialogClipsIdentical}, (b) within anti-aliasing tolerance=${dialogClipTolerated.length}, (c) different=${dialogClipDiffs.length}, missing=${dialogClipMissing.length} (strictScreenshots=${strictScreenshots})`,
  );
}
console.log("=======================================================\n");

if (dialogClipMissing.length > 0) {
  console.log("--- MISSING DIALOG SCREENSHOT CLIPS ---");
  for (const m of dialogClipMissing) {
    console.log(`  [${m.state}] hasA=${m.hasA}, hasB=${m.hasB}`);
  }
  console.log("");
}

if (dialogClipTolerated.length > 0) {
  console.log(
    `--- DIALOG SCREENSHOTS WITHIN ANTI-ALIASING TOLERANCE (b: ${dialogClipTolerated.length}) ---`,
  );
  for (const d of dialogClipTolerated) {
    const regionStr = d.diffBbox
      ? `x=${d.diffBbox.x}, y=${d.diffBbox.y}, width=${d.diffBbox.width}, height=${d.diffBbox.height}`
      : "0x0";
    console.log(
      `  [${d.state}] classification=(b) within anti-aliasing tolerance | pixels=${d.diffPixels}, maxDelta=${d.maxDelta}/255, region=(${regionStr})`,
    );
    console.log(`    Crop dir: ${screenshotDiffDir}`);
  }
  console.log("");
}

if (dialogClipDiffs.length > 0) {
  console.log(`--- DIALOG SCREENSHOT DIFFS (c: ${dialogClipDiffs.length}) ---`);
  for (const d of dialogClipDiffs) {
    console.log(`  [${d.state}] classification=(c) different`);
    console.log(`    sha256 A: ${d.shaA}`);
    console.log(`    sha256 B: ${d.shaB}`);
    console.log(`    Image size: A=${d.sizeA}, B=${d.sizeB}`);
    console.log(
      `    Clip rect: A=${JSON.stringify(d.clipA)}, B=${JSON.stringify(d.clipB)}`,
    );
    console.log(`    Differing pixels (RGBA): ${d.diffPixels}`);
    console.log(`    Max per-channel delta: ${d.maxDelta}/255`);
    if (d.playwrightMessage) {
      console.log(`    Playwright comparator: ${d.playwrightMessage.trim()}`);
    }
    if (d.diffBbox) {
      console.log(
        `    Diff bounding box (dialog-relative): x=${d.diffBbox.x}, y=${d.diffBbox.y}, width=${d.diffBbox.width}, height=${d.diffBbox.height}`,
      );
    }
    console.log(`    Crop region: ${JSON.stringify(d.cropRect)}`);
    console.log(`    Before crop: ${d.beforeCropPath}`);
    console.log(`    After crop:  ${d.afterCropPath}`);
    console.log(`    Diff crop:   ${d.diffCropPath}`);
  }
  console.log("");
}

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
  hasScreenshotFailures ||
  missingInAStates.length > 0 ||
  missingInBStates.length > 0
) {
  if (unmatchedExceeded) {
    console.error(
      `\nFAIL: Remaining unmatched elements (${totalRemainingUnmatched}) exceed threshold (${unmatchedThreshold}). Pass --allow-unmatched to ignore unmatched element count.`,
    );
  }
  if (hasScreenshotFailures) {
    console.error(
      `\nFAIL: Dialog screenshot verification failed: (c) different=${dialogClipDiffs.length}, (b) within AA tolerance=${dialogClipTolerated.length} (strictScreenshots=${strictScreenshots}), missing=${dialogClipMissing.length}.`,
    );
  }
  process.exit(1);
}

process.exit(0);
