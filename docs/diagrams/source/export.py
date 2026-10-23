"""Writes each diagram as SVG and exports a high-resolution PNG with Microsoft Edge in
headless mode (already installed with Windows; nothing extra to install).

PNGs are at least ~3000 px wide (2-6x the SVG size), about 300 dpi or more across an
A4 page. Set EDGE_PATH if Edge is installed somewhere else.
"""

import math
import os
import struct
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # docs/diagrams
SVG_DIR = ROOT / "svg"
PNG_DIR = ROOT / "png"

EDGE_CANDIDATES = [
    os.environ.get("EDGE_PATH", ""),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def edge_path():
    for candidate in EDGE_CANDIDATES:
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit("Microsoft Edge not found; set EDGE_PATH to msedge.exe")


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def export(name, svg_text, width, height):
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    svg_file = SVG_DIR / f"{name}.svg"
    svg_file.write_text(svg_text, encoding="utf-8", newline="\n")

    scale = min(6, max(2, math.ceil(3000 / width)))
    png_file = PNG_DIR / f"{name}.png"
    expected = (width * scale, height * scale)
    # Recent Edge versions return before the screenshot is written, so wait for the file
    # (still inside the temporary folder, whose page Edge is reading), and retry if needed.
    for attempt in range(4):
        png_file.unlink(missing_ok=True)  # a failed run must never leave the old image in place
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            page = Path(tmp) / "page.html"
            page.write_text(
                "<!doctype html><html><head><meta charset='utf-8'><style>html,body{margin:0;padding:0;background:#fff}"
                "svg{display:block}</style></head><body>" + svg_text + "</body></html>",
                encoding="utf-8",
            )
            subprocess.run(
                [
                    edge_path(),
                    "--headless=new",
                    "--no-first-run",
                    "--disable-gpu",
                    "--hide-scrollbars",
                    f"--user-data-dir={Path(tmp) / 'profile'}",
                    f"--force-device-scale-factor={scale}",
                    f"--window-size={width},{height}",
                    f"--screenshot={png_file}",
                    page.as_uri(),
                ],
                capture_output=True,
            )
            deadline = time.time() + 60
            while time.time() < deadline:
                try:
                    if png_size(png_file) == expected and png_file.stat().st_size > 1000:
                        time.sleep(0.5)  # let Edge finish writing
                        return png_file, expected
                except (OSError, struct.error):
                    pass
                time.sleep(0.25)
    got = png_size(png_file) if png_file.exists() else None
    raise SystemExit(f"{name}: PNG is {got}, expected {expected}")
