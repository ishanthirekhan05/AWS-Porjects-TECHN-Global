import os
import glob
import re

frontend_dir = r"d:\AWS2\frontend"
html_files = glob.glob(os.path.join(frontend_dir, "*.html"))

errors = []
total_links = 0
total_scripts = 0
total_styles = 0

for h in html_files:
    filename = os.path.basename(h)
    with open(h, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check scripts
    scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', content)
    for s in scripts:
        if not s.startswith("http"):
            total_scripts += 1
            clean_s = s.split("?")[0].replace("/", os.sep)
            full_s = os.path.join(frontend_dir, clean_s)
            if not os.path.exists(full_s):
                errors.append(f"{filename}: Missing script {s}")
    
    # Check stylesheets
    links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', content)
    for l in links:
        if not l.startswith("http") and not l.startswith("data:"):
            total_styles += 1
            clean_l = l.split("?")[0].replace("/", os.sep)
            full_l = os.path.join(frontend_dir, clean_l)
            if not os.path.exists(full_l):
                errors.append(f"{filename}: Missing stylesheet {l}")

    # Check html hrefs
    hrefs = re.findall(r'href=["\']([^"\'#]+(?:\.html)?)["\']', content)
    for hr in hrefs:
        if hr.endswith(".html") and not hr.startswith("http"):
            total_links += 1
            clean_hr = hr.split("?")[0].replace("/", os.sep)
            full_hr = os.path.join(frontend_dir, clean_hr)
            if not os.path.exists(full_hr):
                errors.append(f"{filename}: Dead link to {hr}")

print(f"Scanned {len(html_files)} HTML pages.")
print(f"Total script references checked: {total_scripts}")
print(f"Total stylesheet references checked: {total_styles}")
print(f"Total HTML navigation links checked: {total_links}")

if errors:
    print("\nErrors found:")
    for err in errors:
        print(" -", err)
else:
    print("\nALL ASSET REFERENCES & INTERNAL NAVIGATION LINKS RESOLVE 100% CLEANLY!")
