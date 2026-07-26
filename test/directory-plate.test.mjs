import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observeDirectoryPlate, validateDirectoryPlateReceipt } from "../src/directory-plate.mjs";

test("one plate observation exposes every direct mount without a child interior", async () => {
  const root = await mkdtemp(join(tmpdir(), "directory-plate-"));
  await writeFile(join(root, "a"), "alpha");
  await mkdir(join(root, "nested")); await writeFile(join(root, "nested", "hidden"), "not read by the plate die");
  const result = await observeDirectoryPlate(root, { observedAt: "2026-07-20T00:00:00.000Z" });
  assert.deepEqual(result.observation.mounts, [{ name: "a", kind: "file" }, { name: "nested", kind: "directory" }]);
  assert.equal(result.observation.childInteriorsRead, false);
  assert.equal(result.observation.globalInstantClaimed, false);
  const carrier = { ...result.observation, semanticId: result.semanticId, canonicalBytesBase64: result.canonicalBytes.toString("base64") };
  assert.equal(validateDirectoryPlateReceipt(carrier).plateRoot, result.observation.plateRoot);
});

test("plate identity is placement-neutral while the observation event is not", async () => {
  const left = await mkdtemp(join(tmpdir(), "directory-plate-left-")), right = await mkdtemp(join(tmpdir(), "directory-plate-right-"));
  await writeFile(join(left, "same"), "left content"); await writeFile(join(right, "same"), "right content");
  const a = await observeDirectoryPlate(left, { observedAt: "2026-07-20T00:00:01.000Z" });
  const b = await observeDirectoryPlate(right, { observedAt: "2026-07-20T00:00:02.000Z" });
  assert.equal(a.observation.plateRoot, b.observation.plateRoot);
  assert.notEqual(a.semanticId, b.semanticId);
});

test("the shallow die observes the finite plate without a caller count ceiling", async () => {
  const root = await mkdtemp(join(tmpdir(), "directory-plate-complete-"));
  await writeFile(join(root, "a"), "a"); await writeFile(join(root, "b"), "b");
  const result = await observeDirectoryPlate(root);
  assert.deepEqual(result.observation.mounts.map(({ name }) => name), ["a", "b"]);
  assert.equal(result.observation.complete, true);
});
