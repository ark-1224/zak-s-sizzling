"""Rebuilds every diagram: python docs/diagrams/source/build.py [wireframes|flows] [name-prefix]

Writes docs/diagrams/svg/*.svg and docs/diagrams/png/*.png.
"""

import sys

from export import export


def wireframes(prefix=""):
    import screens_admin
    import screens_kiosk

    for module in (screens_kiosk, screens_admin):
        for make in module.SCREENS:
            f = make()
            if not f.number.startswith(prefix):
                continue
            name = f"{f.number}-{module.SLUGS[f.number]}"
            w, h = f.size
            path, size = export(name, f.svg(), w, h)
            print(f"{name}.png  {size[0]}x{size[1]}")


def flows(prefix=""):
    import flows as flow_defs

    for flow in flow_defs.FLOWS:
        name, svg, w, h = flow()
        if not name.startswith(prefix):
            continue
        path, size = export(name, svg, w, h)
        print(f"{name}.png  {size[0]}x{size[1]}")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    prefix = sys.argv[2] if len(sys.argv) > 2 else ""
    if what in ("all", "wireframes"):
        wireframes(prefix)
    if what in ("all", "flows"):
        flows("flow-" + prefix if prefix and not prefix.startswith("flow-") else prefix)
