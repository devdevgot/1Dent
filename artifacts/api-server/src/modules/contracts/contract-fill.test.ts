import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatContractDobRu,
  buildSystemTemplateVars,
  collectContractFillWarnings,
  type ContractFillContext,
} from "./contract-fill";
import { renderContractHtml } from "./contracts.ai";
import { renderExtractionTemplate, getExtractionTemplateText } from "./extraction-templates";
import { normalizeContractText } from "./contract-render";

describe("formatContractDobRu", () => {
  it("formats ISO date to ru-RU", () => {
    assert.equal(formatContractDobRu("1990-05-15"), "15.05.1990");
  });

  it("keeps already formatted date", () => {
    assert.equal(formatContractDobRu("15.05.1990"), "15.05.1990");
  });
});

describe("renderContractHtml", () => {
  it("fills placeholders after text normalization", () => {
    const raw = "Ф.  И.  О.:  ________________\nИИН  ____________";
    const mappings = [
      { placeholder: "Ф.  И.  О.:  ________________", patientField: "patient.name", label: "ФИО" },
      { placeholder: "ИИН  ____________", patientField: "patient.iin", label: "ИИН" },
    ];
    const html = renderContractHtml(raw, mappings, {
      "patient.name": "Иванов И.И.",
      "patient.iin": "123456789012",
    });
    assert.match(html, /Иванов И\.И\./);
    assert.match(html, /123456789012/);
    assert.match(html, /filled-field/);
  });
});

describe("renderExtractionTemplate", () => {
  it("uses clinic director in preamble", () => {
    const snippet = "от 04.12.2018г., {{clinic_director}} в лице директора,";
    const rendered = renderExtractionTemplate(snippet, {
      clinic_director: "Петров П.П.",
      doctor_name: "Сидоров С.С.",
    });
    assert.match(rendered, /Петров П\.П\./);
    assert.doesNotMatch(rendered, /Сидоров/);
  });

  it("renders a system template with patient and clinic vars", () => {
    const text = getExtractionTemplateText("sys_имплантаци_имплантация_1_договор_публичный");
    assert.ok(text.length > 100);
    const rendered = renderExtractionTemplate(text, buildSystemTemplateVars({
      patientName: "Иванов Иван",
      patientPhone: "+77001234567",
      patientIin: "123456789012",
      patientDob: "01.01.1990",
      clinicName: "ТОО «Тест»",
      clinicPhone: "+77007654321",
      clinicCity: "г. Алматы",
      clinicAddress: "ул. Тест 1",
      clinicLicense: "99999999",
      clinicDirector: "Директор Тест",
      doctorName: "Врач Тест",
    }));
    assert.match(rendered, /Иванов Иван/);
    assert.match(rendered, /Директор Тест/);
    assert.doesNotMatch(rendered, /\{\{patient_name\}\}/);
  });

  it("removes duplicated year after full date substitution", () => {
    const rendered = renderExtractionTemplate("«{{date}}» {{year}} г.", {
      date: "23.07.2026",
      year: "2026",
    });
    assert.equal(rendered, "«23.07.2026» г.");
  });
});

describe("collectContractFillWarnings", () => {
  it("returns warnings for missing patient and clinic fields", () => {
    const ctx: ContractFillContext = {
      patientName: "Test",
      patientPhone: "+7",
      patientIin: "",
      patientDob: "",
      clinicName: "Clinic",
      clinicPhone: "",
      clinicCity: "",
      clinicAddress: "",
      clinicLicense: "",
      clinicDirector: "",
      doctorName: "",
    };
    const warnings = collectContractFillWarnings(ctx);
    assert.ok(warnings.some((w) => w.includes("ИИН")));
    assert.ok(warnings.some((w) => w.includes("директора")));
  });
});

describe("normalizeContractText + placeholder detection", () => {
  it("collapses spaces so heuristic placeholders can match", () => {
    const normalized = normalizeContractText("Ф.  И.  О.:  ________");
    assert.equal(normalized, "Ф. И. О.: ________");
  });
});
