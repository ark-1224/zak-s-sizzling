"""Turns progress-report.html into progress-report.pdf (A4, page numbers) with Microsoft
Edge in headless mode; nothing extra to install. From the repository root:

    python docs/progress-report/build_pdf.py

Set EDGE_PATH if Edge is installed somewhere else.
"""

import os
import subprocess
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "progress-report.html"
TARGET = HERE / "progress-report.pdf"

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


def finished(path):
    """True once the PDF exists, is complete (ends with %%EOF) and has stopped growing."""
    try:
        size = path.stat().st_size
        if size < 1000 or b"%%EOF" not in path.read_bytes()[-1024:]:
            return False
        time.sleep(0.5)
        return path.stat().st_size == size
    except OSError:
        return False


def main():
    # Recent Edge versions return before the file is written, so wait for it, and retry.
    for attempt in range(4):
        TARGET.unlink(missing_ok=True)
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            subprocess.run(
                [
                    edge_path(),
                    "--headless=new",
                    "--no-first-run",
                    "--disable-gpu",
                    "--no-pdf-header-footer",
                    f"--user-data-dir={Path(tmp) / 'profile'}",
                    f"--print-to-pdf={TARGET}",
                    SOURCE.as_uri(),
                ],
                capture_output=True,
            )
            deadline = time.time() + 120
            while time.time() < deadline:
                if finished(TARGET):
                    print(f"wrote {TARGET} ({TARGET.stat().st_size // 1024} KB)")
                    return
                time.sleep(0.5)
    raise SystemExit("Edge did not produce the PDF")


if __name__ == "__main__":
    main()
