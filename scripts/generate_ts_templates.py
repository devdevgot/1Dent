import os
import re
import json

base_json = "/home/runner/workspace/scripts/extracted_templates.json"
output_ts = "/home/runner/workspace/artifacts/api-server/src/modules/contracts/extraction-templates.ts"

with open(base_json, "r", encoding="utf-8") as f:
    templates = json.load(f)

def clean_text(text):
    # Normalize line endings
    text = text.replace("\r\n", "\n")
    
    # Replace clinic name variations
    # Order: longer to shorter
    text = text.replace("Муслим Dent", "{{clinic_name}}")
    text = text.replace("Муслим dent", "{{clinic_name}}")
    text = text.replace("Muslim Dent", "{{clinic_name}}")
    text = text.replace("МуслимДент", "{{clinic_name}}")
    text = text.replace("Муслим-Дент", "{{clinic_name}}")
    text = text.replace("Муслим", "{{clinic_name}}")
    text = text.replace("Muslim", "{{clinic_name}}")
    
    # Replace dates like "_________2019г." or "_______202_г." with {{date}}
    text = re.sub(r'_+20\d{2}\s*г\.?', '{{date}}', text)
    text = re.sub(r'_+20\d?\s*г\.?', '{{date}}', text)
    text = re.sub(r'_+\s*20\d{2}', '{{date}}', text)
    
    # Replace patient details placeholders
    text = re.sub(
        r'Я,?\s*___________________________________________________________________________\s*\n?\s*________________\s*\n?\s*\(фамилия,\s*имя,\s*отчество\s*пациента\)',
        'Я, {{patient_name}}',
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(
        r'Я,?\s*___________________________________________________________________________\s*\n?\s*\(фамилия,\s*имя,\s*отчество\s*пациента\)',
        'Я, {{patient_name}}',
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(
        r'Я,?\s*___________________________________________________________________________\s*\n?\s*________________',
        'Я, {{patient_name}}',
        text,
        flags=re.IGNORECASE
    )
    
    # Replace standard form blank lines with template variables
    text = re.sub(r'ИИН\s*:?\s*_________________+', 'ИИН: {{iin}}', text)
    text = re.sub(r'Дата рождения\s*:?\s*_________________+', 'Дата рождения: {{dob}}', text)
    text = re.sub(r'Телефон\s*:?\s*_________________+', 'Телефон: {{phone}}', text)
    text = re.sub(r'Адрес\s*:?\s*_________________+', 'Адрес: {{patient_address}}', text)
    text = re.sub(r'Ф\.?И\.?О\.?\s*(?:пациента)?\s*:?\s*_________________+', 'ФИО пациента: {{patient_name}}', text, flags=re.IGNORECASE)
    text = re.sub(r'Врач\s*(?:-стоматолог)?\s*:?\s*_________________+', 'Врач: {{doctor_name}}', text, flags=re.IGNORECASE)
    
    # General cleanup: strip leading/trailing whitespace
    return text.strip()

def escape_js_template(text):
    # Escape backslashes, backticks, and JS string interpolation "${"
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

# Build the TypeScript file content
ts_content = """/**
 * Hardcoded system templates for document bundles.
 * Generated automatically from extracted DOC files.
 */

export interface ExtractionTemplateDefinition {
  id: string;
  name: string;
  text: string;
  category: string;
  subcategory?: string;
}

export const EXTRACTION_TEMPLATES: ExtractionTemplateDefinition[] = [
"""

for tmpl in templates:
    cleaned = clean_text(tmpl["text"])
    escaped = escape_js_template(cleaned)
    ts_content += f"  {{\n"
    ts_content += f"    id: \"{tmpl['id']}\",\n"
    ts_content += f"    name: \"{tmpl['name']}\",\n"
    ts_content += f"    category: \"{tmpl['category']}\",\n"
    if tmpl["subcategory"]:
        ts_content += f"    subcategory: \"{tmpl['subcategory']}\",\n"
    ts_content += f"    text: `\n{escaped}\n`,\n"
    ts_content += f"  }},\n"

ts_content += """
];

/**
 * Substitutes {{placeholder}} values in template text.
 */
export function renderExtractionTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/**
 * Converts plain-text template to safe HTML with line breaks preserved.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\n/g, "<br>\\n")
    .replace(/✓/g, "✓")
    .replace(/!/g, "!");
}
"""

with open(output_ts, "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Generated {output_ts} with {len(templates)} templates.")
