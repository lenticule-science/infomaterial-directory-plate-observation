import { randomUUID } from "node:crypto";
import { Message, Role } from "@a2a-js/sdk";
import { a2aResultParts, sendRmnTask } from "@emsenn/a2a-rmn-task-client-service";
import { extractRmnPart, rmnPart } from "@emsenn/a2a-rmn-part-service";
import { checkTerm, decodeSemantic, semanticBytes, semanticId } from "@emsenn/rmn-semantic-conformance";
import { decodeRelationalValue, encodeRelationalValue, RELATIONAL_VALUE_TYPE } from "@emsenn/rmn-semantic-conformance/relational-value";
import { SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION } from "@emsenn/rmn-semantic-conformance/hierarchical-circuit";
import { validateDirectoryPlateReceipt } from "./directory-plate.mjs";

const responseParts = a2aResultParts;

export function encodeDirectoryPlateTaskRequest({ relativePath, maximumMounts }) {
  const value = { kind: "DirectoryPlateObservationTask", relativePath, maximumMounts };
  const encoded = encodeRelationalValue(value);
  return ["ascribe", encoded.type, encoded.term];
}

export function decodeDirectoryPlateTaskRequest(bytes) {
  const term = decodeSemantic(bytes);
  if (!semanticBytes(term).equals(bytes) || term?.[0] !== "ascribe" || term.length !== 3 || JSON.stringify(term[1]) !== JSON.stringify(RELATIONAL_VALUE_TYPE)) throw new Error("directory plate task must be canonical relational RMN");
  checkTerm(term[2], term[1]);
  const value = decodeRelationalValue(term[1], term[2]);
  if (value?.kind !== "DirectoryPlateObservationTask" || Object.keys(value).sort().join("\0") !== "kind\0maximumMounts\0relativePath" || typeof value.relativePath !== "string" || !Number.isSafeInteger(value.maximumMounts) || value.maximumMounts < 0 || value.maximumMounts > 100_000) throw new Error("directory plate task has an invalid shape");
  return value;
}

export async function requestDirectoryPlateObservation({ agentUrl, relativePath, maximumMounts = 100_000, signal }) {
  const request = encodeDirectoryPlateTaskRequest({ relativePath, maximumMounts });
  const message = Message.toJSON({ messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(semanticBytes(request), "directory-plate-task.rmn.cbor")], metadata: {}, extensions: [], referenceTaskIds: [] });
  const exchange = await sendRmnTask({ agentUrl, extensions: [SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION], message, ...(signal ? { signal } : {}) });
  const output = extractRmnPart(responseParts(exchange.result));
  const term = decodeSemantic(output.bytes);
  if (!semanticBytes(term).equals(output.bytes) || term?.[0] !== "ascribe" || term.length !== 3) throw new Error("directory plate provider returned noncanonical RMN");
  const value = decodeRelationalValue(term[1], term[2]);
  const receipt = { ...value, semanticId: semanticId(term), canonicalBytesBase64: output.bytes.toString("base64") };
  validateDirectoryPlateReceipt(receipt);
  return { receipt, exchange };
}
