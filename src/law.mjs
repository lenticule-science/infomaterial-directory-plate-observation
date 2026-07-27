import { readFileSync } from "node:fs";
import { compileRmlLaw } from "@red-cup-engineering/rmn-semantic-conformance/law";

export const DIRECTORY_PLATE_OBSERVATION_LAW = compileRmlLaw(
  readFileSync(new URL("../content/contracts/observe-directory-plate.rml", import.meta.url), "utf8"),
);
