import os
import subprocess
import json

base_dir = "/home/runner/workspace/IDS/ИДС/документы пля прайса"
extracted_data = []

def run_antiword(filepath):
    try:
        result = subprocess.run(
            ["/nix/store/7j13wlk62abj5lz3ml9j91lkwah1mmsz-replit-runtime-path/bin/antiword", filepath],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        return result.stdout
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return ""

for root, dirs, files in os.walk(base_dir):
    relative = os.path.relpath(root, base_dir)
    # Categories: детская стоматология, имплантаци, ортодонтия, ортопедия, терапия, хирургия
    parts = relative.split(os.sep)
    if parts[0] == ".":
        continue
    
    category = parts[0]
    subcategory = parts[1] if len(parts) > 1 else ""
    
    # Map the category folder names to clean user-facing names
    category_mapping = {
        "детская стоматология": "Детская стоматология",
        "имплантаци": "Имплантация",
        "ортодонтия": "Ортодонтия",
        "ортопедия": "Ортопедия",
        "терапия": "Терапия",
        "хирургия": "Хирургия"
    }
    
    clean_category = category_mapping.get(category, category)
    
    # Clean subcategory name (e.g. capitalized)
    clean_subcategory = subcategory
    if subcategory:
        # e.g. "детская терапия" -> "Детская терапия", "имплантация" -> "Имплантация", etc.
        clean_subcategory = subcategory.capitalize()
    
    for file in files:
        if file.endswith(".doc") and not file.startswith("._"):
            filepath = os.path.join(root, file)
            print(f"Extracting {filepath}...")
            text = run_antiword(filepath)
            
            # Clean filename to get a friendly template name (remove .doc extension)
            friendly_name = os.path.splitext(file)[0]
            if friendly_name.startswith("+"):
                friendly_name = friendly_name[1:]
            
            # Let's generate a unique system ID for each template
            # using category, subcategory and filename lowercase alphanumeric
            clean_file_id = "".join(c for c in friendly_name.lower() if c.isalnum() or c in ("_", " "))
            clean_file_id = clean_file_id.replace(" ", "_")
            
            sub_id = f"_{clean_file_id}" if clean_file_id else ""
            system_id = f"sys_{category}_{subcategory}{sub_id}"
            # normalize system_id: only letters, numbers, underscores
            system_id = "".join(c for c in system_id.lower() if c.isalnum() or c == "_")
            
            extracted_data.append({
                "id": system_id,
                "name": friendly_name,
                "text": text,
                "category": clean_category,
                "subcategory": clean_subcategory,
                "original_path": os.path.relpath(filepath, base_dir)
            })

# Save to json file
output_path = "/home/runner/workspace/scripts/extracted_templates.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(extracted_data, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(extracted_data)} templates successfully.")
