import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { admitJsonSemanticContent, EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

export const DIRECTORY_PLATE_PROFILE = "org.emsenn.infomaterial.directory-plate.v1";
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const byteOrder = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

function typed(value) {
  return identifyJsonSemanticContent({ objectKind: "infomaterial.directory-plate", value, witnessRoot: EMPTY_WITNESS_ROOT });
}
function snapshot(stat) { return { dev: stat.dev, ino: stat.ino, mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs }; }
function sameSnapshot(left, right) { return ["dev", "ino", "mode", "size", "mtimeNs", "ctimeNs"].every((key) => left[key] === right[key]); }
function kindOf(stat) {
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  if (stat.isSymbolicLink()) return "symbolic-link";
  throw new Error("directory plate contains unsupported filesystem material");
}

export async function observeDirectoryPlate(location, { observedAt = new Date().toISOString() } = {}) {
  if (!isAbsolute(location ?? "")) throw new Error("directory plate location must be absolute");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("observedAt must be an ISO timestamp");
  location = resolve(location);
  const beforeStat = await lstat(location, { bigint: true });
  if (!beforeStat.isDirectory()) throw new Error("directory plate root must be a directory");
  const before = snapshot(beforeStat), mounts = [];
  for await (const entry of await opendir(location)) {
    mounts.push({ raw: entry.name, name: entry.name.normalize("NFC") });
  }
  mounts.sort((left, right) => byteOrder(left.name, right.name));
  if (new Set(mounts.map(({ name }) => name)).size !== mounts.length) throw new Error("directory names collide after NFC normalization");
  for (const mount of mounts) {
    const stat = await lstat(resolve(location, mount.raw), { bigint: true });
    mount.kind = kindOf(stat); mount.snapshot = snapshot(stat);
  }
  const afterNames = [];
  for await (const entry of await opendir(location)) afterNames.push(entry.name.normalize("NFC"));
  afterNames.sort(byteOrder);
  if (!sameSnapshot(before, snapshot(await lstat(location, { bigint: true }))) || mounts.map(({ name }) => name).join("\0") !== afterNames.join("\0")) throw new Error("directory plate changed during observation");
  for (const mount of mounts) if (!sameSnapshot(mount.snapshot, snapshot(await lstat(resolve(location, mount.raw), { bigint: true })))) throw new Error(`direct mount metadata changed during observation: ${mount.name}`);
  const directMounts = mounts.map(({ name, kind }) => ({ name, kind }));
  const plateRoot = typed({ profile: DIRECTORY_PLATE_PROFILE, kind: "directory-plate", mode: beforeStat.mode, mounts: directMounts }).id;
  const observation = { type: "InfomaterialDirectoryPlateObservation", profile: DIRECTORY_PLATE_PROFILE, location, mode: beforeStat.mode, mounts: directMounts, plateRoot, complete: true, vectorTimed: true, globalInstantClaimed: false, childInteriorsRead: false, observedAt };
  const document = typed(observation);
  return { observation, semanticId: document.id, canonicalBytes: document.bytes };
}

export function validateDirectoryPlateReceipt(carrier) {
  if (carrier?.type !== "InfomaterialDirectoryPlateObservation" || carrier.profile !== DIRECTORY_PLATE_PROFILE || !NI.test(carrier.semanticId ?? "") || typeof carrier.canonicalBytesBase64 !== "string") throw new Error("canonical directory plate observation required");
  const bytes = Buffer.from(carrier.canonicalBytesBase64, "base64");
  if (bytes.toString("base64") !== carrier.canonicalBytesBase64) throw new Error("directory plate bytes are not canonical base64");
  const value = admitJsonSemanticContent({ bytes, objectKind: "infomaterial.directory-plate" }).value;
  if (typed(value).id !== carrier.semanticId) throw new Error("directory plate identity differs from its canonical bytes");
  if (value.type !== "InfomaterialDirectoryPlateObservation" || value.profile !== DIRECTORY_PLATE_PROFILE || value.complete !== true || value.vectorTimed !== true || value.globalInstantClaimed !== false || value.childInteriorsRead !== false || !NI.test(value.plateRoot ?? "") || !Array.isArray(value.mounts)) throw new Error("directory plate does not prove one complete shallow observation");
  const names = new Set();
  for (const mount of value.mounts) {
    if (typeof mount?.name !== "string" || !["file", "directory", "symbolic-link"].includes(mount.kind) || names.has(mount.name)) throw new Error("directory plate contains a malformed or repeated mount");
    names.add(mount.name);
  }
  return value;
}
