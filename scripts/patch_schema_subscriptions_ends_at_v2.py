from pathlib import Path
import re
import sys

p = Path("src/vestnik/schema.py")
s = p.read_text("utf-8", errors="replace")

idx_line = 'await session.execute(text("create index if not exists ix_subscriptions_ends_at on subscriptions(ends_at);"))'
if idx_line not in s:
    print("ERROR: subscriptions ends_at index line not found", file=sys.stderr)
    sys.exit(2)

ensure_block = """
    subscriptions_cols = await _get_table_columns(session, "subscriptions")
    await _ensure_column(session, subscriptions_cols, "subscriptions", "user_id", "alter table subscriptions add column user_id integer;")
    await _ensure_column(session, subscriptions_cols, "subscriptions", "starts_at", "alter table subscriptions add column starts_at timestamptz;")
    await _ensure_column(session, subscriptions_cols, "subscriptions", "ends_at", "alter table subscriptions add column ends_at timestamptz;")
    await _ensure_column(session, subscriptions_cols, "subscriptions", "status", "alter table subscriptions add column status varchar(32);")
    await _ensure_column(session, subscriptions_cols, "subscriptions", "created_at", "alter table subscriptions add column created_at timestamptz;")
""".rstrip("\n")

# If already patched, do nothing
if 'subscriptions_cols = await _get_table_columns(session, "subscriptions")' not in s:
    s = s.replace(idx_line, ensure_block + "\n\n    " + idx_line.lstrip(), 1)

# ---- Patch check_schema required_cols ----
# Find required_cols dict entry for subscriptions if exists; else insert near deliveries/subscriptions-ish
entry_pat = re.compile(r'("subscriptions"\s*:\s*\[)([^\]]*)(\])', re.S)
m = entry_pat.search(s)

needed = ["user_id", "starts_at", "ends_at", "status", "created_at"]

if not m:
    # insert after deliveries if present; else after posts_cache; else before closing brace of required_cols dict
    ins_after = None
    m2 = re.search(r'("deliveries"\s*:\s*\[[^\]]*\]\s*,\s*\n)', s, flags=re.S)
    if m2:
        ins_after = m2.group(1)
    else:
        m3 = re.search(r'("posts_cache"\s*:\s*\[[^\]]*\]\s*,\s*\n)', s, flags=re.S)
        if m3:
            ins_after = m3.group(1)

    if ins_after:
        insert = ins_after + '        "subscriptions": ["' + '", "'.join(needed) + '"],\n'
        s = s.replace(ins_after, insert, 1)
    else:
        # fallback: locate required_cols = { ... } and inject before the closing }
        m4 = re.search(r"(required_cols\s*=\s*\{\n)(.*?)(\n\s*\}\s*\n)", s, flags=re.S)
        if not m4:
            print("ERROR: required_cols dict not found for insertion", file=sys.stderr)
            sys.exit(2)
        body = m4.group(2)
        body = body.rstrip() + '\n        "subscriptions": ["' + '", "'.join(needed) + '"],'
        s = s[:m4.start(2)] + body + s[m4.end(2):]
else:
    inside = m.group(2)
    items = [x.strip().strip('"') for x in inside.split(",") if x.strip()]
    for col in needed:
        if col not in items:
            items.append(col)
    new_inside = ", ".join([f'"{x}"' for x in items])
    s = s[:m.start(2)] + new_inside + s[m.end(2):]

p.write_text(s, "utf-8")
print("OK: patched src/vestnik/schema.py (subscriptions ends_at + check_schema)")
