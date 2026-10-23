"""Swimlane (cross-functional) activity diagrams as plain SVG, Python standard library only.

Lanes are columns (one per actor), the flow runs top to bottom on a grid of rows, and
connectors are right-angled lines routed through the gaps between rows and the margins
inside each lane, so they never pass through a symbol.

Symbols (standard flowchart shapes):
  start / end   rounded terminator        process   rectangle
  decision      diamond                   io        parallelogram (input / output)
  sub           predefined process: a step drawn in full in another diagram
A dashed outline marks a step that is partial in the code (see each diagram's notes).
"""

from html import escape

FONT = "Arial, Helvetica, sans-serif"
INK, INK2, INK3 = "#222222", "#555555", "#8a8a8a"
LANE_FILL = ("#ffffff", "#f6f6f6")

LW = 250          # lane width
NW = 196          # symbol width
RH = 112          # row height
MARGIN = 30
TITLE_H = 104
LANE_HEAD = 44
FS = 12.5         # text size inside symbols
LH = 15           # line height inside symbols


def text_width(s, size, bold=False):
    return len(s) * size * (0.57 if bold else 0.52)


def wrap_lines(text, width, size=FS):
    lines = []
    for para in str(text).split("\n"):
        line = ""
        for word in para.split():
            trial = f"{line} {word}".strip()
            if line and text_width(trial, size) > width:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return lines


class Node:
    def __init__(self, nid, lane, row, kind, text, partial=False):
        self.id, self.lane, self.row, self.kind, self.text, self.partial = nid, lane, row, kind, text, partial
        inner = {"decision": NW * 0.54, "io": NW - 44, "sub": NW - 34}.get(kind, NW - 22)
        self.lines = wrap_lines(text, inner, FS if kind != "decision" else 11.5)
        n = len(self.lines)
        if kind == "decision":
            self.h = max(80, n * 14 + 50)
        elif kind in ("start", "end"):
            self.h = max(42, n * LH + 18)
        else:
            self.h = max(50, n * LH + 20)
        self.w = NW
        self.cx = 0.0
        self.cy = 0.0

    def anchor(self, side):
        inset = 7 if self.kind == "io" else 0  # the slanted sides of a parallelogram meet mid-height 7 px in
        return {
            "t": (self.cx, self.cy - self.h / 2),
            "b": (self.cx, self.cy + self.h / 2),
            "l": (self.cx - self.w / 2 + inset, self.cy),
            "r": (self.cx + self.w / 2 - inset, self.cy),
        }[side]


class Flow:
    def __init__(self, slug, number, title, lanes, sources, notes=(), lane_width=LW):
        self.slug, self.number, self.title = slug, number, title
        self.lanes, self.sources, self.notes = lanes, sources, list(notes)
        self.nodes = {}
        self.edges = []
        self.gutter_use = {}

    # --- building ------------------------------------------------------------------
    def n(self, nid, lane, row, kind, text, partial=False):
        assert nid not in self.nodes, nid
        lane_index = self.lanes.index(lane) if isinstance(lane, str) else lane
        self.nodes[nid] = Node(nid, lane_index, row, kind, text, partial)
        return nid

    def e(self, a, b, label=None, exit=None, entry=None, side=None, via=None, partial=False):
        self.edges.append(dict(a=a, b=b, label=label, exit=exit, entry=entry, side=side, via=via, partial=partial))

    # --- geometry ------------------------------------------------------------------
    @property
    def rows(self):
        return max(n.row for n in self.nodes.values()) + 1

    def lane_x(self, i):
        return MARGIN + i * LW

    @property
    def title_h(self):
        width = MARGIN * 2 + len(self.lanes) * LW
        return 84 + 15 * len(wrap_lines("Based on: " + self.sources, width - MARGIN * 2, 12)) + 8

    def row_top(self, r):
        return self.title_h + LANE_HEAD + r * RH

    def layout(self):
        for node in self.nodes.values():
            node.cx = self.lane_x(node.lane) + LW / 2
            node.cy = self.row_top(node.row) + RH / 2

    def occupied(self, lane, row):
        return any(n.lane == lane and n.row == row for n in self.nodes.values())

    def column_clear(self, lane, r1, r2):
        """No symbol in `lane` on rows strictly between r1 and r2."""
        return not any(self.occupied(lane, r) for r in range(min(r1, r2) + 1, max(r1, r2)))

    def gutter(self, lane, side, target=None):
        """An x inside the lane margin, offset a little for each connector already there.
        Connectors returning to the same symbol share one line, so they read as a merge."""
        if target is not None and (lane, side, target) in self.gutter_shared:
            return self.gutter_shared[(lane, side, target)]
        key = (lane, side)
        k = self.gutter_use.get(key, 0)
        self.gutter_use[key] = k + 1
        base = self.lane_x(lane)
        x = base + LW - 10 - k * 6 if side == "r" else base + 10 + k * 6
        if target is not None:
            self.gutter_shared[(lane, side, target)] = x
        return x

    def route(self, e):
        s, d = self.nodes[e["a"]], self.nodes[e["b"]]
        if e["via"]:
            exit_side = e["exit"] or "b"
            entry_side = e["entry"] or "t"
            return [s.anchor(exit_side), *e["via"], d.anchor(entry_side)], exit_side
        down = d.row > s.row
        if down:
            exit_side = e["exit"] or "b"
            entry_side = e["entry"] or "t"
        elif d.row == s.row and d.lane != s.lane:
            exit_side = e["exit"] or ("r" if d.lane > s.lane else "l")
            entry_side = e["entry"] or ("l" if d.lane > s.lane else "r")
        else:
            exit_side = e["exit"] or e["side"] or "r"
            entry_side = e["entry"] or (exit_side if d.lane == s.lane else "t")
        p0, pn = s.anchor(exit_side), d.anchor(entry_side)
        sx, sy = p0
        dx, dy = pn

        if down and exit_side == "b" and entry_side == "t":
            yb_d = self.row_top(d.row) + 6
            yb_s = self.row_top(s.row + 1) - 6
            if s.lane == d.lane:
                if self.column_clear(s.lane, s.row, d.row):
                    return [p0, pn], exit_side
                g = self.gutter(s.lane, e["side"] or "r")
                return [p0, (sx, yb_s), (g, yb_s), (g, yb_d), (dx, yb_d), pn], exit_side
            if self.column_clear(s.lane, s.row, d.row + 1) or d.row == s.row + 1:
                if d.row == s.row + 1:
                    ym = (s.anchor("b")[1] + d.anchor("t")[1]) / 2
                    return [p0, (sx, ym), (dx, ym), pn], exit_side
                return [p0, (sx, yb_d), (dx, yb_d), pn], exit_side
            if self.column_clear(d.lane, s.row, d.row):
                return [p0, (sx, yb_s), (dx, yb_s), pn], exit_side
            g = self.gutter(d.lane, "l" if d.lane > s.lane else "r")
            return [p0, (sx, yb_s), (g, yb_s), (g, yb_d), (dx, yb_d), pn], exit_side

        if down and exit_side in ("l", "r") and entry_side == "t":
            between = range(min(s.lane, d.lane) + 1, max(s.lane, d.lane))
            row_clear = d.lane != s.lane and not any(self.occupied(l, s.row) for l in between) and not self.occupied(d.lane, s.row)
            if row_clear and self.column_clear(d.lane, s.row, d.row):
                return [p0, (dx, sy), pn], exit_side
            g = self.gutter(s.lane, exit_side)
            yb_d = self.row_top(d.row) + 6
            return [p0, (g, sy), (g, yb_d), (dx, yb_d), pn], exit_side

        if down and entry_side in ("l", "r"):
            g = self.gutter(d.lane, entry_side, target=(d.id, entry_side))
            if exit_side == "b":
                yb_s = self.row_top(s.row + 1) - 6
                return [p0, (sx, yb_s), (g, yb_s), (g, dy), pn], exit_side
            return [p0, (g, sy), (g, dy), pn], exit_side

        if d.row == s.row and d.lane != s.lane:
            between = range(min(s.lane, d.lane) + 1, max(s.lane, d.lane))
            if not any(self.occupied(l, s.row) for l in between):
                return [p0, pn], exit_side
            yb = self.row_top(s.row) + 6
            g1 = self.gutter(s.lane, exit_side)
            g2 = self.gutter(d.lane, entry_side)
            return [p0, (g1, sy), (g1, yb), (g2, yb), (g2, dy), pn], exit_side

        # back edge (to an earlier row) or same-lane same-row
        g = self.gutter(s.lane, exit_side, target=(d.id, entry_side))
        if entry_side == "b":
            yb = d.anchor("b")[1] + 14
            return [p0, (g, sy), (g, yb), (dx, yb), pn], exit_side
        if d.lane == s.lane or entry_side in ("l", "r"):
            return [p0, (g, sy), (g, dy), pn], exit_side
        yb_d = self.row_top(d.row) + 6
        return [p0, (g, sy), (g, yb_d), (dx, yb_d), pn], exit_side

    # --- drawing -------------------------------------------------------------------
    def shape(self, n):
        x, y, w, h = n.cx - n.w / 2, n.cy - n.h / 2, n.w, n.h
        dash = ' stroke-dasharray="6 4"' if n.partial else ""
        st = f'fill="#ffffff" stroke="{INK}" stroke-width="1.6"{dash}'
        out = []
        if n.kind in ("start", "end"):
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" {st.replace("#ffffff", "#e9e9e9")}/>')
        elif n.kind == "decision":
            out.append(f'<polygon points="{n.cx},{y} {x + w},{n.cy} {n.cx},{y + h} {x},{n.cy}" {st}/>')
        elif n.kind == "io":
            k = 14
            out.append(f'<polygon points="{x + k},{y} {x + w},{y} {x + w - k},{y + h} {x},{y + h}" {st}/>')
        elif n.kind == "sub":
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" {st}/>')
            out.append(f'<line x1="{x + 9}" y1="{y}" x2="{x + 9}" y2="{y + h}" stroke="{INK}" stroke-width="1.2"/>')
            out.append(f'<line x1="{x + w - 9}" y1="{y}" x2="{x + w - 9}" y2="{y + h}" stroke="{INK}" stroke-width="1.2"/>')
        else:
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" {st}/>')
        size = 11.5 if n.kind == "decision" else FS
        lh = 14 if n.kind == "decision" else LH
        top = n.cy - (len(n.lines) - 1) * lh / 2 + size * 0.36
        weight = 700 if n.kind in ("start", "end") else 400
        for i, line in enumerate(n.lines):
            out.append(
                f'<text x="{n.cx}" y="{top + i * lh}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                f'text-anchor="middle" fill="{INK}">{escape(line)}</text>'
            )
        return out

    def connector(self, e):
        pts, exit_side = self.route(e)
        d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f} {y:.1f}" for i, (x, y) in enumerate(pts))
        dash = ' stroke-dasharray="6 4"' if e["partial"] else ""
        out = [f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.4"{dash} marker-end="url(#arrow)"/>']
        if e["label"]:
            (x0, y0), (x1, y1) = pts[0], pts[1]
            size = 11.5
            tw = text_width(e["label"], size, True) + 8
            first_len = abs(x1 - x0) + abs(y1 - y0)
            if exit_side in ("l", "r") and first_len < tw + 10 and len(pts) > 2:
                # Too little room beside the symbol: label the next (vertical) segment instead.
                x2, y2 = pts[2]
                if y2 > y1:
                    lx, ly, anchor = x1 + 5, y1 + 34, "start"
                elif exit_side == "l":
                    lx, ly, anchor = x1 - 5, y1 - 6, "end"
                else:
                    lx, ly, anchor = x1 + 5, y1 - 6, "start"
            elif exit_side == "b":
                lx, ly, anchor = x0 + 6, y0 + 15, "start"
            elif exit_side == "r":
                lx, ly, anchor = x0 + 6, y0 - 6, "start"
            elif exit_side == "l":
                lx, ly, anchor = x0 - 6, y0 - 6, "end"
            else:
                lx, ly, anchor = x0 + 6, y0 - 6, "start"
            bx = lx - 3 if anchor == "start" else lx - tw + 3
            out.append(f'<rect x="{bx}" y="{ly - size}" width="{tw}" height="{size + 5}" fill="#ffffff" opacity="0.9"/>')
            out.append(
                f'<text x="{lx}" y="{ly}" font-family="{FONT}" font-size="{size}" font-weight="700" '
                f'text-anchor="{anchor}" fill="{INK}">{escape(e["label"])}</text>'
            )
        return out

    def legend(self, y, width):
        out = [f'<text x="{MARGIN}" y="{y}" font-family="{FONT}" font-size="13" font-weight="700" fill="{INK}">Legend</text>']
        items = [("start", "Start / end"), ("process", "Process step"), ("decision", "Decision"), ("io", "Input / output"),
                 ("sub", "Shown in another diagram"), ("partial", "Partial in the code")]
        x = MARGIN
        y += 14
        for kind, label in items:
            w, h = 44, 26
            st = f'fill="#ffffff" stroke="{INK}" stroke-width="1.4"'
            if kind == "start":
                out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="13" {st.replace("#ffffff", "#e9e9e9")}/>')
            elif kind == "decision":
                out.append(f'<polygon points="{x + w / 2},{y} {x + w},{y + h / 2} {x + w / 2},{y + h} {x},{y + h / 2}" {st}/>')
            elif kind == "io":
                out.append(f'<polygon points="{x + 8},{y} {x + w},{y} {x + w - 8},{y + h} {x},{y + h}" {st}/>')
            elif kind == "sub":
                out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" {st}/>')
                out.append(f'<line x1="{x + 6}" y1="{y}" x2="{x + 6}" y2="{y + h}" stroke="{INK}"/><line x1="{x + w - 6}" y1="{y}" x2="{x + w - 6}" y2="{y + h}" stroke="{INK}"/>')
            elif kind == "partial":
                out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" {st} stroke-dasharray="6 4"/>')
            else:
                out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" {st}/>')
            out.append(f'<text x="{x + w + 8}" y="{y + 17}" font-family="{FONT}" font-size="12" fill="{INK2}">{escape(label)}</text>')
            x += w + 18 + text_width(label, 12) + 22
            if x > width - 200:
                x = MARGIN
                y += 38
        return out, y + 50

    def render(self):
        self.layout()
        self.gutter_use = {}
        self.gutter_shared = {}
        width = MARGIN * 2 + len(self.lanes) * LW
        body_bottom = self.row_top(self.rows) + 10
        lanes = []
        for i, lane in enumerate(self.lanes):
            x = self.lane_x(i)
            th = self.title_h
            lanes.append(f'<rect x="{x}" y="{th}" width="{LW}" height="{body_bottom - th}" fill="{LANE_FILL[i % 2]}" stroke="{INK}" stroke-width="1.2"/>')
            lanes.append(f'<rect x="{x}" y="{th}" width="{LW}" height="{LANE_HEAD}" fill="#dcdcdc" stroke="{INK}" stroke-width="1.2"/>')
            for j, line in enumerate(wrap_lines(lane, LW - 20, 14)):
                lanes.append(f'<text x="{x + LW / 2}" y="{th + 27 + j * 16 - (len(wrap_lines(lane, LW - 20, 14)) - 1) * 8}" font-family="{FONT}" font-size="14" font-weight="700" text-anchor="middle" fill="{INK}">{escape(line)}</text>')
        edges = []
        for e in self.edges:
            edges += self.connector(e)
        shapes = []
        for node in self.nodes.values():
            shapes += self.shape(node)
        legend, y = self.legend(body_bottom + 34, width)
        notes = []
        if self.notes:
            y += 14
            notes.append(f'<text x="{MARGIN}" y="{y}" font-family="{FONT}" font-size="13" font-weight="700" fill="{INK}">Notes</text>')
            y += 20
            for note in self.notes:
                for k, line in enumerate(wrap_lines(note, width - MARGIN * 2 - 16, 12.5)):
                    prefix = "• " if k == 0 else "   "
                    notes.append(f'<text x="{MARGIN}" y="{y}" font-family="{FONT}" font-size="12.5" fill="{INK2}" xml:space="preserve">{escape(prefix + line)}</text>')
                    y += 17
        height = y + 20
        head = [
            f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>',
            f'<text x="{MARGIN}" y="40" font-family="{FONT}" font-size="21" font-weight="700" fill="{INK}">Flow {escape(self.number)}  {escape(self.title)}</text>',
            f'<text x="{MARGIN}" y="64" font-family="{FONT}" font-size="12.5" fill="{INK2}">Swimlane activity diagram · one lane per actor · read top to bottom</text>',
        ]
        y_src = 84
        for line in wrap_lines("Based on: " + self.sources, width - MARGIN * 2, 12):
            head.append(f'<text x="{MARGIN}" y="{y_src}" font-family="{FONT}" font-size="12" fill="{INK2}">{escape(line)}</text>')
            y_src += 15
        defs = (
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{INK}"/></marker></defs>'
        )
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">\n{defs}\n'
            + "\n".join(head + lanes + edges + shapes + legend + notes)
            + "\n</svg>\n"
        )
        return f"flow-{self.number}-{self.slug}", svg, width, height
