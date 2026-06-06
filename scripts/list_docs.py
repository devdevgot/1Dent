import os

base_dir = "/home/runner/workspace/IDS/ИДС/документы пля прайса"
for root, dirs, files in os.walk(base_dir):
    relative = os.path.relpath(root, base_dir)
    print(f"Directory: {relative}")
    for file in files:
        if file.endswith('.doc'):
            print(f"  - {file}")
