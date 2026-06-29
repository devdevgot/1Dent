import { strict as assert } from "node:assert";
import { retrieveRelevantKnowledge, splitKnowledgeIntoChunks } from "./knowledge-retrieval.ts";

const knowledge = `=== Филиал Тургут ===
ул. Тургут Озала 45, Алматы
Работаем пн-сб 9:00-20:00
Тел: +7 777 123 4567

---

=== Филиал Майлина ===
ул. Майлина 12, Алматы
Работаем ежедневно 10:00-19:00

---

=== Услуги ===
Лечение кариеса от 15000 тг
Имплантация от 150000 тг`;

const chunks = splitKnowledgeIntoChunks(knowledge);
assert.ok(chunks.length >= 2, "should split into chunks");

const branchQuery = retrieveRelevantKnowledge(knowledge, "какой адрес филиала на тургут");
assert.match(branchQuery.toLowerCase(), /тургут/, "should retrieve branch chunk");

const priceQuery = retrieveRelevantKnowledge(knowledge, "сколько стоит имплантация");
assert.match(priceQuery.toLowerCase(), /имплант/, "should retrieve price chunk");

console.log("knowledge-retrieval tests passed");
