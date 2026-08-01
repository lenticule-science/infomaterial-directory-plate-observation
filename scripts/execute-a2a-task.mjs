#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { createSettlementStore } from "@lenticule-science/witness-journal-rdf-projection-service/client";
import { decodeDirectoryPlateTaskRequest } from "../src/client.mjs";
import { observeDirectoryPlate } from "../src/directory-plate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function boundedLocation(territoryRoot, relativePath) {
  if (isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("relativePath must be relative to the provider territory");
  const location = resolve(territoryRoot, relativePath), rel = relative(territoryRoot, location);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("relativePath escapes the provider territory");
  return location;
}
const message = Message.fromJSON(JSON.parse(readFileSync(0, "utf8")));
if (message.role !== Role.ROLE_USER) throw new Error("directory plate observation requires an A2A ROLE_USER message");
if (!process.env.INFOMATERIAL_TERRITORY_ROOT) throw new Error("INFOMATERIAL_TERRITORY_ROOT is required");
if (!process.env.WITNESS_JOURNAL_RDF_AGENT) throw new Error("WITNESS_JOURNAL_RDF_AGENT is required");
const request = decodeDirectoryPlateTaskRequest(extractRmnPart(message.parts).bytes);
const territoryRoot = resolve(process.env.INFOMATERIAL_TERRITORY_ROOT);
const store = createSettlementStore({ settlementRoot: ROOT, agentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
const result = await observeDirectoryPlate(boundedLocation(territoryRoot, request.relativePath));
await store.record({ category: "infomaterial-directory-plate-observation.receipt", recordedAt: result.observation.observedAt, record: { ...result.observation, semanticId: result.semanticId } });
process.stdout.write(`${JSON.stringify(Message.toJSON({ messageId: randomUUID(), contextId: message.contextId, taskId: message.taskId, role: Role.ROLE_AGENT, parts: [rmnPart(result.canonicalBytes, "directory-plate-receipt.rmn.cbor")], metadata: { disposition: "conformant", receiptNi: result.semanticId, plateRootNi: result.observation.plateRoot }, extensions: [], referenceTaskIds: [] }))}\n`);
