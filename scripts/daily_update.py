#!/usr/bin/env python3
"""AlfaEstate dashboard daily updater — hardened, all-or-nothing.

Usage:
    python3 daily_update.py <current_index.html> <values.json> <output.html>

Contract:
  * Every field in values.json MUST match exactly one data-field element,
    or the run aborts (exit 1). No partial output is ever written.
  * Freshness checks compare new editorial content against the CURRENT html;
    violations abort (exit 2) so the caller can regenerate and retry.
  * A full replacement + similarity summary table is printed on every run.

values.json schema (all top-level keys optional unless noted):
  fields        {data-field-name: "new text", ...}                (required)
  classes       {data-field-name: "full new class attribute value"}
  hrefs         {data-field-href-name: "new href"}
  news          [{"name": str, "date": str, "url": str, "icon": str}, ...]
  tip_index     int   (writes data-tip-index attr on #tipPills)
  skip_freshness  [field names to exempt this run, e.g. first population]
"""
import sys, json, re, difflib

# Editorial fields subject to freshness rules: (field, rule, threshold)
#   rule "exact"  -> fail only if new == old
#   rule "sim"    -> fail if similarity ratio >= threshold
FRESHNESS_RULES = [
    ("headline",        "sim",   0.90),
    ("lede",            "sim",   0.90),
    ("briefing-p1",     "sim",   0.85),
    ("briefing-p2",     "sim",   0.85),
    ("impact-p1",       "sim",   0.85),
    ("impact-p2",       "sim",   0.85),
    ("tip-topic-today", "exact", None),
    ("social-hook",     "exact", None),
]

# Fields that carry verbatim facts — never subject to freshness (stability is correct)
FACT_FIELDS = {
    "boc-rate", "boc-status", "boc-next", "variable-rate", "variable-desc",
    "variable-note", "fixed-rate", "fixed-desc", "fixed-note", "fed-rate",
    "fed-status", "fed-note", "us-30yr-rate", "us-30yr-change", "us-30yr-note",
    "header-date", "source-date-boc", "source-date-ratehub", "source-date-freddie",
    "gta-sales", "gta-sales-change", "gta-sales-note", "gta-price",
    "gta-price-change", "gta-price-note", "gta-listings", "gta-listings-change",
    "gta-listings-note", "gta-latest-month", "gta-source-month", "gta-regional-note",
    "gta-regional-period", "weekly-updated",
}

NEWS_START = "<!-- LOCAL-NEWS-START -->"
NEWS_END = "<!-- LOCAL-NEWS-END -->"


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def similarity(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def get_field(html, field):
    """Return (open_tag_match, inner_text) for a data-field element, or None."""
    m = re.search(r'<[^>]*?data-field="' + re.escape(field) + r'"[^>]*?>', html)
    if not m:
        return None
    rest = html[m.end():]
    close = re.search(r"</[a-zA-Z0-9]+>", rest)
    if not close:
        return None
    return m, rest[: close.start()]


def set_field(html, field, new_text, new_class=None):
    """Replace inner text (and optionally class attr) of the data-field element.
    Returns (html, old_text). Raises ValueError if not found or ambiguous."""
    matches = re.findall(r'data-field="' + re.escape(field) + r'"', html)
    if len(matches) == 0:
        raise ValueError(f'data-field "{field}" not found')
    if len(matches) > 1:
        raise ValueError(f'data-field "{field}" matched {len(matches)} times — ambiguous')
    got = get_field(html, field)
    if got is None:
        raise ValueError(f'data-field "{field}" element malformed')
    m, old = got
    open_tag = m.group(0)
    if new_class is not None:
        new_open = re.sub(r'class="[^"]*"', 'class="' + new_class + '"', open_tag, count=1)
    else:
        new_open = open_tag
    start, end = m.start(), m.end() + len(old)
    html = html[:start] + new_open + new_text + html[end:]
    return html, old


def set_href(html, name, new_href):
    pat = r'(<a[^>]*?data-field-href="' + re.escape(name) + r'"[^>]*?href=")[^"]*(")'
    n = len(re.findall(pat, html))
    if n != 1:
        raise ValueError(f'data-field-href "{name}" matched {n} times (need exactly 1)')
    return re.sub(pat, lambda mm: mm.group(1) + new_href + mm.group(2), html, count=1)


def build_news_block(items):
    lis = []
    for it in items:
        for k in ("name", "date", "url"):
            if not it.get(k):
                raise ValueError(f"news item missing required key '{k}': {it}")
        icon = (it.get("icon") or it["name"][0]).strip()[:1].upper()
        lis.append(
            '        <li>\n'
            f'          <a href="{it["url"]}" target="_blank" rel="noopener">\n'
            f'            <span class="source-icon">{icon}</span>\n'
            '            <span class="source-text">\n'
            f'              <span class="source-name">{it["name"]}</span>\n'
            f'              <span class="source-date">{it["date"]}</span>\n'
            '            </span>\n'
            '          </a>\n'
            '        </li>'
        )
    return "\n".join(lis)


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    src, values_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    html = open(src).read()
    original = html
    original_size = len(html)
    values = json.load(open(values_path))

    fields = values.get("fields", {})
    classes = values.get("classes", {})
    hrefs = values.get("hrefs", {})
    news = values.get("news")
    tip_index = values.get("tip_index")
    skip_freshness = set(values.get("skip_freshness", []))

    if not fields and not news and tip_index is None and not hrefs:
        print("values.json contains nothing to do — aborting.")
        sys.exit(1)

    rows = []       # (field, old, new, changed, note)
    errors = []

    # ---------- capture old values for freshness BEFORE any mutation ----------
    old_values = {}
    for f in fields:
        got = get_field(html, f)
        old_values[f] = got[1] if got else None

    # ---------- freshness gate (abort BEFORE writing anything) ----------
    fresh_report = []
    fresh_fail = False
    for field, rule, threshold in FRESHNESS_RULES:
        if field not in fields or field in skip_freshness:
            continue
        old = old_values.get(field)
        if old is None or "Placeholder" in old:
            continue
        new = fields[field]
        sim = similarity(old, new)
        if rule == "exact":
            failed = norm(old) == norm(new)
            verdict = "FAIL (exact repeat)" if failed else "ok"
        else:
            failed = sim >= threshold
            verdict = f"FAIL (>= {threshold})" if failed else "ok"
        fresh_report.append((field, f"{sim:.2f}", verdict))
        fresh_fail |= failed

    print("\nFRESHNESS CHECK (new vs currently-published content)")
    print(f"{'field':<18} {'similarity':>10}  verdict")
    print("-" * 48)
    for f, s, v in fresh_report:
        print(f"{f:<18} {s:>10}  {v}")
    if not fresh_report:
        print("(no editorial fields updated this run)")
    if fresh_fail:
        print("\nFRESHNESS FAILURE — regenerate the failing fields and rerun. "
              "Nothing was written.")
        sys.exit(2)

    # ---------- apply field replacements ----------
    for field, new_text in fields.items():
        try:
            html, old = set_field(html, field, new_text, classes.get(field))
            rows.append((field, old, new_text, norm(old) != norm(new_text)))
        except ValueError as e:
            errors.append(str(e))

    # ---------- hrefs ----------
    for name, url in hrefs.items():
        try:
            html = set_href(html, name, url)
            rows.append((f"href:{name}", "(url)", url, True))
        except ValueError as e:
            errors.append(str(e))

    # ---------- news block ----------
    if news is not None:
        s, e = html.find(NEWS_START), html.find(NEWS_END)
        if s == -1 or e == -1 or e < s:
            errors.append("LOCAL-NEWS markers not found")
        elif len(news) < 2:
            errors.append(f"need >= 2 verified news items, got {len(news)}")
        else:
            try:
                block = build_news_block(news)
                html = html[: s + len(NEWS_START)] + "\n" + block + "\n" + html[e:]
                rows.append(("local-news", f"{html.count('<li>', s, e)} items(old)",
                             f"{len(news)} items", True))
            except ValueError as ex:
                errors.append(str(ex))

    # ---------- tip rotation state ----------
    if tip_index is not None:
        pat = r'(id="tipPills"[^>]*data-tip-index=")(\d+)(")'
        m = re.search(pat, html)
        if not m:
            errors.append("tipPills data-tip-index attribute not found")
        else:
            old_idx = int(m.group(2))
            if old_idx == tip_index:
                errors.append(
                    f"tip_index {tip_index} equals current index — rotation did not advance")
            else:
                html = re.sub(pat, lambda mm: mm.group(1) + str(tip_index) + mm.group(3),
                              html, count=1)
                rows.append(("tip-index", str(old_idx), str(tip_index), True))

    # ---------- report ----------
    print("\nREPLACEMENT SUMMARY")
    print(f"{'field':<22} {'changed':<8} old -> new (truncated)")
    print("-" * 100)
    for field, old, new, changed in rows:
        o = re.sub(r"\s+", " ", str(old))[:36]
        n = re.sub(r"\s+", " ", str(new))[:36]
        print(f"{field:<22} {'yes' if changed else 'no':<8} {o!r} -> {n!r}")

    if errors:
        print("\nERRORS — output NOT written (all-or-nothing):")
        for e in errors:
            print("  *", e)
        sys.exit(1)

    # ---------- sanity: size must not drift ----------
    new_size = len(html)
    if not (0.98 * original_size < new_size < 1.03 * original_size):
        print(f"\nABORTED — size sanity failed: {original_size} -> {new_size}")
        sys.exit(1)
    if html == original:
        print("\nNo effective change produced — refusing to write a no-op file.")
        sys.exit(1)

    open(out, "w").write(html)
    changed_ct = sum(1 for r in rows if r[3])
    print(f"\nOK — {len(rows)} replacements ({changed_ct} changed), "
          f"{original_size:,} -> {new_size:,} chars. Wrote {out}")


if __name__ == "__main__":
    main()
