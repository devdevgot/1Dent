#!/usr/bin/env python3
"""Generate extraction-templates.ts from extracted_templates.json with patient/clinic placeholders."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "scripts" / "extracted_templates.json"
OUT_PATH = ROOT / "artifacts" / "api-server" / "src" / "modules" / "contracts" / "extraction-templates.ts"


def inject_placeholders(text: str) -> str:
    """Replace underscore blanks and static clinic names with {{variable}} placeholders."""
    t = text

    # --- Requisites table (before clinic replacement to avoid cross-column match) ---
    t = re.sub(
        r"\|«ИСПОЛНИТЕЛЬ»\s+ТОО\s+«\s*[^»|\n]+",
        "|«ИСПОЛНИТЕЛЬ»     {{clinic_name}}",
        t,
    )
    t = re.sub(
        r"\|«ПАЦИЕНТ»_+\|",
        "|«ПАЦИЕНТ»{{patient_name}}|",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"\|«ПАЦИЕНТ»\s*_+\|",
        "|«ПАЦИЕНТ»{{patient_name}}|",
        t,
        flags=re.IGNORECASE,
    )

    # --- Clinic name (any ТОО «...» variant; do not cross | or newlines) ---
    t = re.sub(r"ТОО\s*«\s*[^»|\n]+\s*»", "{{clinic_name}}", t)
    t = re.sub(
        r"ТОО\s+«\s*[^»|\n]+(?=\s*\|)",
        "{{clinic_name}}",
        t,
    )
    t = re.sub(
        r"Стоматологическая\s+клиника\s+ТОО\s*«\s*[^»|\n]+\s*»",
        "Стоматологическая клиника {{clinic_name}}",
        t,
    )
    t = re.sub(r"\{\{clinic_name\}\}\s+Dent\b", "{{clinic_name}}", t, flags=re.IGNORECASE)

    # --- Director / doctor ---
    t = re.sub(
        r"от 04\.12\.2018г\.,\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z]\.[А-ЯЁA-Z]\.)?)\s+в\s+лице\s+директора",
        r"от 04.12.2018г., {{doctor_name}} в лице директора",
        t,
    )
    t = re.sub(
        r"в лице\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z][а-яёa-z]+){1,2})\s*,",
        r"в лице {{doctor_name}},",
        t,
    )
    t = re.sub(
        r"Главный врач\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z][а-яёa-z]+){1,2})\s*",
        r"Главный врач {{doctor_name}} ",
        t,
    )
    t = re.sub(
        r"Беседу провел врач:\s*_+\s*/\s*_+",
        "Беседу провел врач: {{doctor_name}} / {{doctor_name}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Беседу провел Врач:\s*\{\{doctor_name\}\}\s*/\s*_+",
        "Беседу провел Врач: {{doctor_name}} / {{doctor_name}}",
        t,
        flags=re.IGNORECASE,
    )

    # --- Dates ---
    t = re.sub(
        r"«\s*_+\s*»\s*_+\s*(\d{4})\s*г\.?",
        r"«{{date}}» {{year}} г.",
        t,
    )
    t = re.sub(
        r"«\s*_+\s*»\s*_+\s*(\d{4})\s*года",
        r"«{{date}}» {{year}} года",
        t,
    )
    t = re.sub(
        r"от\s+_+\s*(\d{4})\s*г\.?",
        r"от {{date}} {{year}} г.",
        t,
    )
    t = re.sub(
        r'от\s+"_+"\s*_+\s*(\d{4})\s*г',
        r'от "{{date}}" {{year}} г',
        t,
    )
    t = re.sub(
        r'"_+"_+\s*(\d{4})\s*года',
        r'"{{date}}" {{year}} года',
        t,
    )
    t = re.sub(
        r"Дата\s*«\s*_+\s*»\s*_+\s*(\d{4})",
        r"Дата «{{date}}» {{year}}",
        t,
    )
    t = re.sub(
        r"Дата\s+«\s*_+\s*»\s*_+\s*(\d{4})",
        r"Дата «{{date}}» {{year}}",
        t,
    )

    # --- Patient FIO in contract preamble ---
    t = re.sub(
        r"гражданин\(-ка\)\s*\n_+\s*именуем",
        "гражданин(-ка)\n{{patient_name}} именуем",
        t,
        flags=re.IGNORECASE,
    )

    # --- Other patient name fields in requisites ---
    t = re.sub(
        r"«ПАЦИЕНТ»\s*_+",
        "«ПАЦИЕНТ»{{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )

    # --- IIN / ID document ---
    t = re.sub(
        r"Уд\.л№_+выдан",
        "Уд.л№{{iin}} выдан",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Уд\.л№_+",
        "Уд.л№{{iin}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"ИИН\s*:?\s*_+",
        "ИИН {{iin}}",
        t,
        flags=re.IGNORECASE,
    )

    # --- Phone ---
    t = re.sub(
        r"Моб\.\s*\n\s*тел\.:_+",
        "Моб.\nтел.:{{phone}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Моб\.\s*тел\.:_+",
        "Моб. тел.:{{phone}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"тел\.:_+",
        "тел.:{{phone}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Телефон:_+",
        "Телефон:{{phone}}",
        t,
        flags=re.IGNORECASE,
    )

    # --- Date of birth ---
    t = re.sub(
        r"Дата рождения\s*:?\s*_+",
        "Дата рождения {{dob}}",
        t,
        flags=re.IGNORECASE,
    )

    # --- IDS consent blocks ---
    # Representative (parent) after "Я,"
    t = re.sub(
        r"(Я,\s*\n)_+(?:\s*\n_+)?(\s*\([^)]*отчество[^)]*\))",
        r"\1{{patient_name}}\2",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"(Я,\s*\n)_+(?:\s*\n_+)?(\s*\n)",
        r"\1{{patient_name}}\2",
        t,
    )
    # Child name after "ребенка" / "ребёнка"
    t = re.sub(
        r"((?:ребенка|ребёнка)\s*\n)_+",
        r"\1{{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"(являясь\s+законным\s+представителем\s+ребенка\s*\n)_+",
        r"\1{{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )

    # Warranty passport / general FIO blanks
    t = re.sub(
        r"Я,\s*_+\(ФИО пациента\)",
        "Я, {{patient_name}}(ФИО пациента)",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Пациент\s+_+\s+и Клиника",
        "Пациент {{patient_name}} и Клиника",
        t,
        flags=re.IGNORECASE,
    )

    # Signature blocks with FIO
    t = re.sub(
        r"Подпись\s+(?:законного\s+)?представителя:\s*_+\s*/\s*_+",
        "Подпись представителя: {{patient_name}} / {{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Подпись\s+пациента:\s*_+\s*/",
        "Подпись пациента: {{patient_name}} /",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"пациента_+/\s*_+",
        "пациента {{patient_name}} / {{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"Подпись\s+пациента:\s*_+\s*/\s*_+",
        "Подпись пациента: {{patient_name}} / {{patient_name}}",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"\n_+\s*\n\s*/\s*_+\s*/",
        "\n{{patient_name}}\n/ {{patient_name}} /",
        t,
    )

    return t


def escape_ts(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("${", "\\${")
    )


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    lines = [
        "/**",
        " * Hardcoded system templates for document bundles.",
        " * Generated automatically from extracted DOC files.",
        " * Placeholders: {{patient_name}}, {{clinic_name}}, {{doctor_name}}, {{date}}, {{year}}, {{iin}}, {{dob}}, {{phone}}",
        " * Regenerate: python3 scripts/generate_ts_templates.py",
        " */",
        "",
        "export interface ExtractionTemplateDefinition {",
        "  id: string;",
        "  name: string;",
        "  text: string;",
        "  category: string;",
        "  subcategory?: string;",
        "}",
        "",
        "export const EXTRACTION_TEMPLATES: ExtractionTemplateDefinition[] = [",
    ]

    for item in data:
        content = inject_placeholders(item["text"])
        lines.append("  {")
        lines.append(f'    id: {json.dumps(item["id"], ensure_ascii=False)},')
        lines.append(f'    name: {json.dumps(item["name"], ensure_ascii=False)},')
        lines.append(f'    category: {json.dumps(item["category"], ensure_ascii=False)},')
        if item.get("subcategory"):
            lines.append(f'    subcategory: {json.dumps(item["subcategory"], ensure_ascii=False)},')
        lines.append(f"    text: `{escape_ts(content)}`,")
        lines.append("  },")

    lines.extend(
        [
            "",
            "];",
            "",
            "export function getExtractionTemplateDef(",
            "  systemType: string,",
            "): ExtractionTemplateDefinition | undefined {",
            "  return EXTRACTION_TEMPLATES.find((d) => d.id === systemType);",
            "}",
            "",
            "export function getExtractionTemplateText(systemType: string): string {",
            "  return getExtractionTemplateDef(systemType)?.text ?? \"\";",
            "}",
            "",
            "/**",
            " * Substitutes {{placeholder}} values in template text.",
            " * Also fills any remaining underscore blanks for known patient fields.",
            " */",
            "export function renderExtractionTemplate(",
            "  text: string,",
            "  vars: Record<string, string>,",
            "): string {",
            "  let result = text.replace(/\\{\\{(\\w+)\\}\\}/g, (_match, key: string) => vars[key] ?? \"\");",
            "  return postProcessRenderedTemplate(result, vars);",
            "}",
            "",
            "function postProcessRenderedTemplate(",
            "  text: string,",
            "  vars: Record<string, string>,",
            "): string {",
            "  let t = text;",
            "  const name = vars.patient_name ?? \"\";",
            "  const iin = vars.iin ?? \"\";",
            "  const phone = vars.phone ?? \"\";",
            "  const dob = vars.dob ?? \"\";",
            "  const clinic = vars.clinic_name ?? \"\";",
            "  const doctor = vars.doctor_name ?? \"\";",
            "  const clinicPhone = vars.clinic_phone ?? \"\";",
            "  const clinicCity = vars.clinic_city ?? \"\";",
            "  const clinicLicense = vars.clinic_license ?? \"\";",
            "  const clinicAddress = vars.clinic_address ?? \"\";",
            "",
            "  if (clinic) {",
            "    t = t.replace(/ТОО\\s*«\\s*[^»|\\n]+\\s*»/g, clinic);",
            "    t = t.replace(/ТОО\\s+«\\s*[^»|\\n]+(?=\\s*\\|)/g, clinic);",
            "  }",
            "  if (name) {",
            "    t = t.replace(/гражданин\\(-ка\\)\\s*\\n_+\\s*именуем/gi, `гражданин(-ка)\\n${name} именуем`);",
            "    t = t.replace(/\\|«ПАЦИЕНТ»_+\\|/gi, `|«ПАЦИЕНТ»${name}|`);",
            "    t = t.replace(/«ПАЦИЕНТ»\\s*_+/gi, `«ПАЦИЕНТ»${name}`);",
            "    t = t.replace(/(Я,\\s*\\n)_+/g, `$1${name}`);",
            "    t = t.replace(/(являясь\\s+законным\\s+представителем\\s+ребенка\\s*\\n)_+/gi, `$1${name}`);",
            "    t = t.replace(/((?:ребенка|ребёнка)\\s*\\n)_+/gi, `$1${name}`);",
            "    t = t.replace(/Пациент\\s+_+\\s+и Клиника/gi, `Пациент ${name} и Клиника`);",
            "    t = t.replace(/Я,\\s*_+\\(ФИО пациента\\)/gi, `Я, ${name}(ФИО пациента)`);",
            "    t = t.replace(/Ф\\.?\\s*И\\.?\\s*О\\.?\\s*:?\\s*_+/gi, `Ф.И.О.: ${name}`);",
            "    t = t.replace(/ФИО\\s+полностью[,\\s]*_+/gi, `ФИО полностью, ${name}`);",
            "  }",
            "  if (doctor) {",
            "    t = t.replace(/Беседу\\s+провел\\s+врач:\\s*_+/gi, `Беседу провел врач: ${doctor}`);",
            "    t = t.replace(/провел\\s+врач:\\s*_+/gi, `провел врач: ${doctor}`);",
            "    t = t.replace(/врач:\\s*_+\\s*\\//gi, `врач: ${doctor} /`);",
            "  }",
            "  if (iin) {",
            "    t = t.replace(/Уд\\.л№_+/gi, `Уд.л№${iin}`);",
            "    t = t.replace(/ИИН\\s*:?\\s*_+/gi, `ИИН ${iin}`);",
            "  }",
            "  if (phone) {",
            "    t = t.replace(/Моб\\.\\s*\\n\\s*тел\\.:_+/gi, `Моб.\\nтел.:${phone}`);",
            "    t = t.replace(/тел\\.:_+/gi, `тел.:${phone}`);",
            "  }",
            "  if (dob) {",
            "    t = t.replace(/Дата рождения\\s*:?\\s*_+/gi, `Дата рождения ${dob}`);",
            "  }",
            "  if (clinicPhone) {",
            "    t = t.replace(/Тел\\.?\\s*;?\\s*222-25-75/gi, `Тел. ${clinicPhone}`);",
            "    t = t.replace(/\\|Тел\\.\\s*222-25-75/gi, `|Тел. ${clinicPhone}`);",
            "  }",
            "  if (clinicCity) {",
            "    t = t.replace(/г\\.\\s*Алматы/gi, clinicCity);",
            "  }",
            "  if (clinicLicense) {",
            "    t = t.replace(/лицензии\\s*№\\s*18021758/gi, `лицензии № ${clinicLicense}`);",
            "  }",
            "  if (clinicAddress) {",
            "    t = t.replace(/Адрес:\\s*г\\.\\s*Алматы[^\\n]*/gi, `Адрес: ${clinicAddress}`);",
            "  }",
            "  return t;",
            "}",
            "",
            "export { textToHtml } from \"./contract-render\";",
            "",
        ]
    )

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(data)} templates)")


if __name__ == "__main__":
    main()
