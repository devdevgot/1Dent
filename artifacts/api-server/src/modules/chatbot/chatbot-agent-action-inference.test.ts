import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_ORDER,
  inferKnowledgeAgentActions,
  orderAgentActions,
} from "./chatbot-agent-action-inference";
import type { ChatbotAgentAction } from "./chatbot-agent.types";
import type { ChatbotSessionData } from "./chatbot.types";

describe("orderAgentActions", () => {
  it("puts book_appointment after data-collecting actions", () => {
    const actions: ChatbotAgentAction[] = [
      { type: "book_appointment" },
      { type: "parse_datetime", datetimeText: "завтра в 15:00" },
      { type: "set_patient_name", name: "Айгуль" },
      { type: "set_branch", branch: "Центр" },
    ];
    const ordered = orderAgentActions(actions).map((a) => a.type);
    assert.ok(ordered.indexOf("set_branch") < ordered.indexOf("book_appointment"));
    assert.ok(ordered.indexOf("set_patient_name") < ordered.indexOf("book_appointment"));
    assert.ok(ordered.indexOf("parse_datetime") < ordered.indexOf("book_appointment"));
  });

  it("covers all known action types in ACTION_ORDER", () => {
    assert.ok(ACTION_ORDER.includes("book_appointment"));
    assert.ok(ACTION_ORDER.includes("set_branch"));
  });
});

describe("inferKnowledgeAgentActions", () => {
  it("infers book_appointment when prerequisites will be ready this turn", () => {
    const session: ChatbotSessionData = {
      suggestedDoctorId: "doc-1",
      suggestedDoctorName: "Иванов",
      patientName: "Айгуль",
    };
    const withBranchAndTime = inferKnowledgeAgentActions(
      session,
      "завтра в 15:00, филиал Центр",
      ["Центр"],
      [],
    );
    // First turn collects branch + datetime (no book yet without confirm).
    assert.ok(withBranchAndTime.some((a) => a.type === "set_branch"));
    assert.ok(withBranchAndTime.some((a) => a.type === "parse_datetime"));

    const confirmTurn = inferKnowledgeAgentActions(
      {
        ...session,
        selectedBranch: "Центр",
        preferredDatetime: "2026-07-25T15:00:00+05:00",
      },
      "да",
      ["Центр"],
      [],
    );
    const types = confirmTurn.map((a) => a.type);
    assert.ok(types.includes("book_appointment"));
  });
});
