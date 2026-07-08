import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContractText,
  textToHtml,
  htmlToPdfmakeContent,
  isPipeTableLine,
  fillTreatmentPlanTable,
  fillActTable,
} from "./contract-render";
import { getExtractionTemplateText } from "./extraction-templates";

describe("normalizeContractText", () => {
  it("joins antiword line wraps and collapses double spaces", () => {
    const input = [
      "дальнейшем «Пациент»,  с  другой  стороны,  заключили  настоящий  договор  о",
      "нижеследующем:",
    ].join("\n");

    const result = normalizeContractText(input);
    assert.ok(result.includes("с другой стороны"));
    assert.ok(!result.includes("  с  "));
    assert.equal(result.split("\n").length, 1);
  });

  it("keeps numbered clauses on separate lines", () => {
    const input = [
      "1.1 Исполнитель обязуется оказать услуги",
      "1.2 Настоящий договор обеспечивает реализацию прав",
    ].join("\n");

    const result = normalizeContractText(input);
    assert.equal(result.split("\n").length, 2);
  });

  it("preserves pipe table lines", () => {
    const input = "|A|B|\n|1|2|";
    const result = normalizeContractText(input);
    assert.equal(result, input);
  });
});

describe("textToHtml", () => {
  it("renders paragraphs instead of preserving hard wraps", () => {
    const input = normalizeContractText(
      "Лечащий  врач  Исполнителя,  назначаемый   по   выбору   пациента,   в\nсоответствии  с  медицинскими  возможностями",
    );
    const html = textToHtml(input);
    assert.match(html, /<p class="contract-para">/);
    assert.ok(!html.includes("<br>"));
    assert.ok(html.includes("соответствии с медицинскими"));
  });

  it("renders centered titles with contract-center class", () => {
    const input = "                                   ДОГОВОР\n                    на оказание платных медицинских услуг";
    const html = textToHtml(input);
    assert.match(html, /class="contract-center">ДОГОВОР<\/p>/);
  });

  it("renders pipe tables as HTML tables", () => {
    const input = "|Col1|Col2|\n|A|B|";
    const html = textToHtml(input);
    assert.match(html, /<table class="contract-table">/);
    assert.match(html, /<td>A<\/td>/);
  });
});

describe("htmlToPdfmakeContent", () => {
  it("merges paragraph HTML into single pdfmake text blocks", () => {
    const html = '<p class="contract-para">Первый абзац с нормальным текстом.</p><p class="contract-center">Заголовок</p>';
    const blocks = htmlToPdfmakeContent(html);
    const textBlocks = blocks.filter((b) => typeof b.text === "string");
    assert.equal(textBlocks.length, 2);
    assert.equal(textBlocks[0]!.text, "Первый абзац с нормальным текстом.");
    assert.equal(textBlocks[0]!.style, "body");
    assert.equal(textBlocks[1]!.style, "bodyCenter");
  });

  it("parses tables into pdfmake table blocks", () => {
    const html = "<table class=\"contract-table\"><tr><td>A</td><td>B</td></tr></table>";
    const blocks = htmlToPdfmakeContent(html);
    assert.ok(blocks.some((b) => b.table));
  });
});

describe("isPipeTableLine", () => {
  it("detects pipe-delimited rows", () => {
    assert.equal(isPipeTableLine("|a|b|"), true);
    assert.equal(isPipeTableLine("not a table"), false);
  });
});

describe("fillTreatmentPlanTable", () => {
  it("fills service rows and total in the treatment plan table", () => {
    const template = getExtractionTemplateText("sys_имплантаци_имплантация_комплексный_план_лечения");
    const filled = fillTreatmentPlanTable(template, [
      { title: "Имплантация", quantity: 1, price: 150000 },
      { title: "Коронка", quantity: 2, price: 80000 },
    ]);

    assert.match(filled, /\|1\s*\|Имплантация\|/);
    assert.match(filled, /\|2\s*\|Коронка\|/);
    assert.match(filled, /Итого:\s*\|\s*310\s*000/);
    assert.match(filled, /Всего предполагается оказать услуг на сумму:\s*310\s*000/);
  });
});

describe("fillActTable", () => {
  it("fills service rows and total in the act table", () => {
    const template = getExtractionTemplateText("sys_имплантаци_имплантация_акт_сдачиприемки_оказанных_услуг");
    const filled = fillActTable(template, [
      { title: "Имплантация", quantity: 1, price: 150000 },
    ]);

    assert.match(filled, /\|1\s*\|Имплантация\|/);
    assert.match(filled, /оказано услуг на сумму:\s+150\s*000/);
  });
});
