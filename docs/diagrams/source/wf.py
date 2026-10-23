"""Grey-box wireframe primitives that write plain SVG (Python standard library only).

Every wireframe is a `Wireframe`: a labelled header strip (number, screen name, route,
code files, screen size, who can open it) above a frame the size of the real screen.
Coordinates passed to the drawing methods are inside that frame, in CSS pixels.
"""

from html import escape

FONT = "Arial, Helvetica, sans-serif"
INK = "#222222"
INK2 = "#555555"
INK3 = "#8a8a8a"
LINE = "#9a9a9a"
LINE_SOFT = "#cfcfcf"
WHITE = "#ffffff"
FILL2 = "#f3f3f3"
FILL3 = "#e2e2e2"
FILL4 = "#c9c9c9"
DARK = "#555555"

HEADER_H = 92
PAD = 24


def text_width(s, size, bold=False):
    """Rough Arial width, good enough to size buttons and wrap lines."""
    return len(s) * size * (0.57 if bold else 0.52)


class Wireframe:
    def __init__(self, number, name, route, files, w, h, screen_note, access):
        self.number = number
        self.name = name
        self.route = route
        self.files = files
        self.w = w
        self.h = h
        self.screen_note = screen_note
        self.access = access
        self.el = []
        self._clip_id = 0
        self.notes = []  # shown under the frame: states, conditions, "partial" flags

    def add_note(self, text):
        self.notes.append(text)

    # --- basic shapes ---------------------------------------------------------------
    def add(self, s):
        self.el.append(s)

    def rect(self, x, y, w, h, fill=WHITE, stroke=LINE, r=0, sw=1, dash=None, opacity=None):
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        if opacity is not None:
            extra += f' fill-opacity="{opacity}"'
        stroke_attr = f'stroke="{stroke}" stroke-width="{sw}"' if stroke else 'stroke="none"'
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" {stroke_attr}{extra}/>')

    def line(self, x1, y1, x2, y2, stroke=LINE, sw=1, dash=None):
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{extra}/>')

    def circle(self, cx, cy, r, fill=WHITE, stroke=LINE, sw=1):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, s, size=13, bold=False, anchor="start", fill=INK, italic=False, weight=None):
        w = weight or (700 if bold else 400)
        style = ' font-style="italic"' if italic else ""
        self.add(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{w}" '
            f'text-anchor="{anchor}" fill="{fill}"{style}>{escape(str(s))}</text>'
        )

    def wrap(self, x, y, width, s, size=13, lh=1.35, **kw):
        """Draws `s` wrapped to `width`; returns the y of the line after the last one."""
        words = str(s).split()
        line = ""
        bold = kw.get("bold", False)
        for word in words:
            trial = f"{line} {word}".strip()
            if line and text_width(trial, size, bold) > width:
                self.text(x, y, line, size=size, **kw)
                y += size * lh
                line = word
            else:
                line = trial
        if line:
            self.text(x, y, line, size=size, **kw)
            y += size * lh
        return y

    def begin_clip(self, x, y, w, h):
        self._clip_id += 1
        cid = f"clip{self._clip_id}"
        self.add(f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath><g clip-path="url(#{cid})">')

    def end_clip(self):
        self.add("</g>")

    # --- wireframe vocabulary ------------------------------------------------------
    def img(self, x, y, w, h, label=None, r=0, fill=FILL3):
        """Picture placeholder: a box with a cross through it."""
        self.rect(x, y, w, h, fill=fill, stroke=LINE, r=r)
        self.line(x, y, x + w, y + h, stroke=FILL4)
        self.line(x + w, y, x, y + h, stroke=FILL4)
        if label:
            size = 11 if min(w, h) < 60 else 13
            tw = text_width(label, size) + 10
            if tw < w - 4:
                self.rect(x + w / 2 - tw / 2, y + h / 2 - size, tw, size * 1.7, fill=WHITE, stroke="none", r=3)
                self.text(x + w / 2, y + h / 2 + size * 0.35, label, size=size, anchor="middle", fill=INK2)

    def icon(self, cx, cy, r=8, filled=False):
        """Small icon placeholder (the real UI draws a line icon here)."""
        self.circle(cx, cy, r, fill=FILL3 if filled else WHITE, stroke=INK3)

    def btn(self, x, y, w, h, label, kind="secondary", r=4, size=13, bold=True):
        if kind == "primary":
            self.rect(x, y, w, h, fill=DARK, stroke=DARK, r=r)
            color = WHITE
        elif kind == "selected":
            self.rect(x, y, w, h, fill=FILL4, stroke=INK2, r=r, sw=2)
            color = INK
        elif kind == "disabled":
            self.rect(x, y, w, h, fill=FILL3, stroke=LINE_SOFT, r=r, dash="4 3")
            color = INK3
        elif kind == "danger":
            self.rect(x, y, w, h, fill=WHITE, stroke=INK, r=r, sw=2)
            color = INK
        elif kind == "ghost":
            color = INK2
        else:
            self.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=r)
            color = INK2
        self.text(x + w / 2, y + h / 2 + size * 0.36, label, size=size, anchor="middle", fill=color, bold=bold)

    def btn_auto(self, x, y, label, h=34, kind="secondary", size=13, pad=16, r=4, align="left"):
        """A button sized to its label; returns its width. align="right" puts its right edge at x."""
        w = text_width(label, size, True) + pad * 2
        bx = x - w if align == "right" else x
        self.btn(bx, y, w, h, label, kind=kind, size=size, r=r)
        return w

    def btn_row(self, right_x, y, buttons, h=34, gap=10, size=13):
        """Buttons laid out right to left from right_x; `buttons` is in reading order."""
        x = right_x
        for label, kind in reversed(buttons):
            w = text_width(label, size, True) + 32
            x -= w
            self.btn(x, y, w, h, label, kind=kind, size=size)
            x -= gap

    def inp(self, x, y, w, h, value="", placeholder="", label=None, select=False, r=4, size=13, invalid=False, mono=False):
        if label:
            self.text(x, y - 7, label, size=12, bold=True, fill=INK2)
        self.rect(x, y, w, h, fill=WHITE, stroke=INK if invalid else LINE, r=r, sw=2 if invalid else 1)
        if value:
            self.text(x + 10, y + h / 2 + size * 0.36, value, size=size, fill=INK)
        elif placeholder:
            self.text(x + 10, y + h / 2 + size * 0.36, placeholder, size=size, fill=INK3)
        if select:
            self.text(x + w - 16, y + h / 2 + 4, "▾", size=12, anchor="middle", fill=INK2)

    def textarea(self, x, y, w, h, placeholder="", label=None):
        if label:
            self.text(x, y - 7, label, size=12, bold=True, fill=INK2)
        self.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=4)
        if placeholder:
            self.text(x + 10, y + 20, placeholder, size=13, fill=INK3)

    def pill(self, x, y, label, size=11, filled=False, r=3, anchor="start"):
        """Status pill; returns its width."""
        w = text_width(label, size, True) + 20
        h = size + 9
        bx = x - w if anchor == "end" else x
        self.rect(bx, y, w, h, fill=FILL3 if filled else WHITE, stroke=INK2, r=r)
        self.text(bx + w / 2, y + h / 2 + size * 0.36, label, size=size, anchor="middle", bold=True, fill=INK2)
        return w

    def checkbox(self, x, y, checked=False, size=16):
        self.rect(x, y, size, size, fill=WHITE, stroke=INK2, r=2)
        if checked:
            self.add(f'<path d="M{x+3} {y+8} l4 4 l7 -8" fill="none" stroke="{INK}" stroke-width="2"/>')

    def radio(self, cx, cy, checked=False, r=8):
        self.circle(cx, cy, r, fill=WHITE, stroke=INK2)
        if checked:
            self.circle(cx, cy, r - 4, fill=INK2, stroke=INK2)

    def segmented(self, x, y, w, h, labels, selected, size=13, r=4):
        """A row of toggle buttons in one frame (e.g. Daily / Weekly / Monthly)."""
        self.rect(x, y, w, h, fill=FILL2, stroke=LINE, r=r)
        seg = (w - 8) / len(labels)
        for i, label in enumerate(labels):
            sx = x + 4 + i * seg
            if i == selected:
                self.rect(sx, y + 4, seg, h - 8, fill=WHITE, stroke=INK2, r=r)
            self.text(sx + seg / 2, y + h / 2 + size * 0.36, label, size=size, anchor="middle",
                      fill=INK if i == selected else INK3, bold=i == selected)

    def table(self, x, y, w, cols, rows, rowh=38, headh=30, size=12):
        """cols: [(title, width, align)] where width <= 1 is a share of w. Cells are text,
        or a callable(cell_x, cell_y, cell_w, row_h) that draws the cell itself."""
        widths = []
        fixed = sum(c[1] for c in cols if c[1] > 1)
        share = w - fixed
        for c in cols:
            widths.append(c[1] if c[1] > 1 else c[1] * share)
        self.rect(x, y, w, headh, fill=FILL2, stroke="none")
        cx = x
        for (title, _, align), cw in zip(cols, widths):
            tx = cx + cw - 12 if align == "right" else cx + 12
            self.text(tx, y + headh / 2 + 4, title.upper(), size=10.5, anchor="end" if align == "right" else "start",
                      fill=INK3, bold=True)
            cx += cw
        ry = y + headh
        for row in rows:
            self.line(x, ry, x + w, ry, stroke=LINE_SOFT)
            cx = x
            for cell, (title, _, align), cw in zip(row, cols, widths):
                if callable(cell):
                    cell(cx, ry, cw, rowh)
                elif cell is not None:
                    tx = cx + cw - 12 if align == "right" else cx + 12
                    self.text(tx, ry + rowh / 2 + 4, cell, size=size, anchor="end" if align == "right" else "start", fill=INK)
                cx += cw
            ry += rowh
        return ry

    def dim(self, opacity=0.45):
        """The darkened page behind a popup."""
        self.rect(0, 0, self.w, self.h, fill="#000000", stroke="none", opacity=opacity)

    def note(self, x, y, w, text, size=12):
        """A dashed annotation box: explains something the picture can't show."""
        lines_needed = max(1, int(text_width(text, size) // (w - 20)) + 1)
        h = lines_needed * size * 1.35 + 16
        self.rect(x, y, w, h, fill="#fafafa", stroke=INK3, r=4, dash="5 3")
        self.wrap(x + 10, y + 8 + size, w - 20, text, size=size, fill=INK2, italic=True)
        return y + h

    # --- output ---------------------------------------------------------------------
    def _note_lines(self):
        out = []
        width = self.w - 20
        for note in self.notes:
            words, line, first = note.split(), "", True
            for word in words:
                trial = f"{line} {word}".strip()
                if line and text_width(trial, 13) > width:
                    out.append(("• " if first else "   ") + line)
                    first, line = False, word
                else:
                    line = trial
            if line:
                out.append(("• " if first else "   ") + line)
        return out

    def _notes_h(self):
        n = len(self._note_lines())
        return 0 if n == 0 else 34 + n * 19

    def svg(self):
        total_w = self.w + PAD * 2
        total_h = self.h + HEADER_H + PAD + self._notes_h()
        head = [
            f'<rect x="0" y="0" width="{total_w}" height="{total_h}" fill="{WHITE}"/>',
            f'<text x="{PAD}" y="32" font-family="{FONT}" font-size="20" font-weight="700" fill="{INK}">'
            f'{escape(self.number)}  {escape(self.name)}</text>',
            f'<text x="{PAD}" y="54" font-family="{FONT}" font-size="12.5" fill="{INK2}">'
            f'Route: {escape(self.route)}   ·   Screen: {escape(self.screen_note)}   ·   Access: {escape(self.access)}</text>',
            f'<text x="{PAD}" y="73" font-family="{FONT}" font-size="12.5" fill="{INK2}">Code: {escape(self.files)}</text>',
        ]
        note_lines = self._note_lines()
        if note_lines:
            ny = HEADER_H + self.h + 30
            head.append(f'<text x="{PAD}" y="{ny}" font-family="{FONT}" font-size="13" font-weight="700" fill="{INK}">Notes</text>')
            for i, ln in enumerate(note_lines):
                head.append(
                    f'<text x="{PAD}" y="{ny + 20 + i * 19}" font-family="{FONT}" font-size="13" fill="{INK2}" '
                    f'xml:space="preserve">{escape(ln)}</text>'
                )
        body = "\n".join(self.el)
        frame = (
            f'<g transform="translate({PAD},{HEADER_H})">'
            f'<clipPath id="frame"><rect x="0" y="0" width="{self.w}" height="{self.h}"/></clipPath>'
            f'<g clip-path="url(#frame)"><rect x="0" y="0" width="{self.w}" height="{self.h}" fill="{WHITE}"/>\n{body}\n</g>'
            f'<rect x="0" y="0" width="{self.w}" height="{self.h}" fill="none" stroke="{INK}" stroke-width="2"/></g>'
        )
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
            f'viewBox="0 0 {total_w} {total_h}">\n' + "\n".join(head) + "\n" + frame + "\n</svg>\n"
        )

    @property
    def size(self):
        return self.w + PAD * 2, self.h + HEADER_H + PAD + self._notes_h()
