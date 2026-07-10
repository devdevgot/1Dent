import assert from "node:assert/strict";
import {
  buildDefaultBookingMindMap,
} from "./booking-script.ts";
import {
  findMindMapBranchParent,
  matchMindMapBranch,
  resolveMindMapNodeIdForState,
  renderMindMapCompactPath,
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

const brokenMap = {
  nodes: mindMap.nodes.slice(0, 5),
  edges: undefined,
};
assert.doesNotThrow(() => {
  resolveMindMapNodeIdForState(brokenMap, "collect_problem", {
    serviceType: "therapy",
    userText: "болит зуб",
  });
});

const compact = renderMindMapCompactPath(mindMap, "step2-qualification");
assert.match(compact, /step2-qualification|квалиф/i);
assert.doesNotMatch(compact, /step1-hygiene/);

console.log("mindmap-utils tests passed");
