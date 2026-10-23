"""Close-up of part of an exported PNG, for checking a diagram by eye:
python crop.py <png name> <top px> <bottom px> <out.png>"""
import subprocess, sys, tempfile
from pathlib import Path
from export import PNG_DIR, edge_path, png_size

name, top, bottom, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
src = PNG_DIR / f"{name}.png"
w, _ = png_size(src)
with tempfile.TemporaryDirectory() as tmp:
    page = Path(tmp) / "c.html"
    page.write_text(f"<html><body style='margin:0;overflow:hidden'><img src='{src.as_uri()}' style='display:block;margin-top:-{top}px'></body></html>")
    subprocess.run([edge_path(), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={Path(tmp) / 'p'}",
                    f"--window-size={w},{bottom - top}", f"--screenshot={out}", page.as_uri()], capture_output=True)
print(out)
