"""Writes erd.mmd (a Mermaid entity-relationship diagram) from apps/api/prisma/schema.prisma.

    python docs/manuscript-fixes/erd_from_schema.py

Table and column names are the PostgreSQL ones (@@map / @map). Relations come from the
fields that hold a foreign key (@relation(fields: [...])); a unique foreign key is one-to-one.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA = HERE.parent.parent / "apps" / "api" / "prisma" / "schema.prisma"
OUT = HERE / "erd.mmd"

TYPES = {"String": "varchar", "Int": "int", "Boolean": "boolean", "DateTime": "timestamp", "Decimal": "decimal", "Json": "json"}

text = SCHEMA.read_text(encoding="utf-8")
models = {m.group(1): m.group(2) for m in re.finditer(r"^model (\w+) \{(.*?)^\}", text, re.S | re.M)}
enums = {m.group(1): m.group(2) for m in re.finditer(r"^enum (\w+) \{(.*?)^\}", text, re.S | re.M)}
enum_names = {name: (re.search(r'@@map\("(\w+)"\)', body) or [None, name])[1] for name, body in enums.items()}
table_of = {name: (re.search(r'@@map\("(\w+)"\)', body) or [None, name])[1] for name, body in models.items()}

entities, relations = [], []
for name, body in models.items():
    table = table_of[name]
    uniques = {f for grp in re.findall(r"@@unique\(\[([^\]]+)\]\)", body) for f in [g.strip() for g in grp.split(",")] if "," not in grp}
    columns, fk_fields = [], {}
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("@@"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        field, ftype = parts[0], parts[1]
        base = ftype.rstrip("?[]")
        rel = re.search(r"@relation\(.*fields: \[(\w+)\]", line)
        if rel:
            fk_fields[rel.group(1)] = base
            continue
        if base in models:  # the other side of a relation
            continue
        col = (re.search(r'@map\("(\w+)"\)', line) or [None, field])[1]
        sql = "uuid" if "@db.Uuid" in line else (enum_names.get(base) or TYPES.get(base, base.lower()))
        key = "PK" if "@id" in line else "UK" if "@unique" in line or field in uniques else ""
        columns.append((field, sql, col, key))
    lines = []
    for field, sql, col, key in columns:
        if field in fk_fields:
            key = "FK" if not key else f"{key}, FK"
            parent = table_of[fk_fields[field]]
            one_to_one = "UK" in key
            relations.append(f'    {parent} ||--{"o|" if one_to_one else "o{"} {table} : "{col}"')
        lines.append(f"        {sql} {col}{' ' + key if key else ''}")
    entities.append(f"    {table} {{\n" + "\n".join(lines) + "\n    }")

header = [
    "%% Entity Relationship Diagram, generated from apps/api/prisma/schema.prisma by erd_from_schema.py.",
    "%% Table and column names are the PostgreSQL names (@@map / @map). Enum types: "
    + "; ".join(f"{enum_names[n]} ({', '.join(v for v in re.findall(r'^\s*(\w+)\s*$', b, re.M))})" for n, b in enums.items())
    + ".",
    "",
    "erDiagram",
]
OUT.write_text("\n".join(header + sorted(set(relations)) + [""] + entities) + "\n", encoding="utf-8", newline="\n")
print(f"wrote {OUT.name}: {len(models)} tables, {len(set(relations))} relations")
