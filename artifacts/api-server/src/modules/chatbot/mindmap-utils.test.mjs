import assert from "node:assert/strict";
import {
  buildDefaultBookingMindMap,
} from "./booking-script.ts";
import {
  findMindMapBranchParent,
  matchMindMapBranch,
  resolveMindMapNodeIdForState,
} from "./mindmap-utils.ts";

const mindMap = buildDefaultBookingMindMap();

const introParent = findMindMapBranchParent(mindMap, "collect_problem");
assert.equal(introParent?.id, "step1-intro");

const hygieneBranch = matchMindMapBranch(mindMap, "step1-intro", {
  serviceType: "hygiene",
  userText: "хочу профессиональную чистку зубов",
});
assert.equal(hygieneBranch?.node.id, "step1-hygiene");

const cariesActive = resolveMindMapNodeIdForState(mindMap, "collect_problem", {
  serviceType: "therapy",
  userText: "болит зуб, кажется кариес",
});
assert.equal(cariesActive, "step1-caries");

const qualificationActive = resolveMindMapNodeIdForState(mindMap, "collect_qualification", {
  serviceType: "therapy",
  userText: "болит зуб",
  activeNodeId: "step1-caries",
});
assert.equal(qualificationActive, "step2-qualification");

console.log("mindmap-utils tests passed");
