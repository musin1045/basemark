import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MIRRORED_FILES = [
  "baseMarkEngine.js",
  "models.js",
  "drawingStructureExtractor.js",
  "photoAnchorSuggester.js"
];

for (const fileName of MIRRORED_FILES) {
  test(`ui engine mirror stays in sync for ${fileName}`, async () => {
    const engineSource = await readFile(`src/engine/${fileName}`, "utf8");
    const uiSource = await readFile(`src/ui/engine/${fileName}`, "utf8");

    assert.equal(
      uiSource,
      engineSource,
      `Expected src/ui/engine/${fileName} to mirror src/engine/${fileName}.`
    );
  });
}
