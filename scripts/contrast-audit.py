#!/usr/bin/env python3
"""WCAG contrast audit of the theme tokens in src/renderer/styles/globals.css.

Checks every theme (default/clay x light/dark) for the colour pairs the UI
actually draws: body and muted text on each surface, text on the sidebar and
header, text on primary buttons and title bars, status colours used as text,
and borders against surfaces. Exits non-zero if any pair is below its target.

    python3 scripts/contrast-audit.py
"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "src/renderer/styles/globals.css"

# Selector chains in cascade order for each theme.
THEMES = {
    "default light": ["@theme", ":root"],
    "default dark": ["@theme", ":root", ".dark"],
    "clay light": ["@theme", ":root", ".theme-clay"],
    "clay dark": ["@theme", ":root", ".dark", ".theme-clay", ".theme-clay.dark"],
}

TEXT, LARGE, UI = 7.0, 4.5, 3.0  # body text (AAA), small secondary text (AA), borders/icons
CHECKS = [
    # (foreground, background, minimum)
    *[("--color-text", bg, TEXT) for bg in ("--color-background", "--color-surface", "--color-surface-2", "--color-surface-3")],
    *[("--color-muted", bg, LARGE) for bg in ("--color-background", "--color-surface", "--color-surface-2", "--color-surface-3")],
    ("--color-primary", "--color-surface", LARGE),
    ("--color-on-primary", "--color-primary", LARGE),
    ("--color-on-primary", "--color-primary-hover", LARGE),
    ("--color-sidebar-foreground", "--color-sidebar", TEXT),
    ("--color-sidebar-foreground-muted", "--color-sidebar", LARGE),
    ("--color-sidebar-section", "--color-sidebar", LARGE),
    ("--color-sidebar-active-text", "--color-sidebar-active-bg", LARGE),
    ("--color-header-foreground", "--color-header", TEXT),
    ("--color-header-muted", "--color-header", LARGE),
    *[(f, "--color-surface", LARGE) for f in ("--color-status-info", "--color-status-in-progress",
                                              "--color-status-blocked", "--color-status-done",
                                              "--color-warning", "--color-alert", "--color-accent")],
    ("--color-border", "--color-surface", UI),
    ("--color-border", "--color-background", UI),
    ("--color-border-strong", "--color-surface", UI),
    ("--note-h1", "--color-surface", LARGE),
    ("--note-h2", "--color-surface", LARGE),
    ("--note-h3", "--color-surface", LARGE),
    ("--note-link", "--color-surface", LARGE),
    ("--note-code", "--note-code-bg", LARGE),
    ("--note-pre-text", "--note-pre-bg", TEXT),
]


def blocks(css):
    """First declaration block for each selector of interest."""
    found = {}
    for m in re.finditer(r"(^|\n)\s*(@theme|[.:][\w.:-]+)\s*\{([^}]*)\}", css):
        sel = m.group(2)
        if sel in ("@theme", ":root", ".dark", ".theme-clay", ".theme-clay.dark") and sel not in found:
            found[sel] = dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(3)))
    return found


def parse_color(value):
    value = value.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", value)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [a]
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)", value)
    if m:
        a = m.group(4)
        alpha = 1.0 if a is None else (float(a[:-1]) / 100 if a.endswith("%") else float(a))
        return [float(m.group(i)) / 255 for i in (1, 2, 3)] + [alpha]
    return None


def resolve(tokens, name, depth=0):
    value = tokens.get(name)
    if value is None or depth > 10:
        return None
    m = re.fullmatch(r"var\((--[\w-]+)(?:,\s*(.+))?\)", value.strip())
    if m:
        got = resolve(tokens, m.group(1), depth + 1)
        return got if got is not None else (parse_color(m.group(2)) if m.group(2) else None)
    return parse_color(value)


def over(fg, bg):
    a = fg[3]
    return [fg[i] * a + bg[i] * (1 - a) for i in range(3)] + [1.0]


def luminance(c):
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c[:3]]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def main():
    css = CSS.read_text()
    found = blocks(css)
    failures = 0
    for theme, chain in THEMES.items():
        tokens = {}
        for sel in chain:
            tokens.update(found.get(sel, {}))
        base = resolve(tokens, "--color-background")
        rows = []
        for fg_name, bg_name, minimum in CHECKS:
            fg, bg = resolve(tokens, fg_name), resolve(tokens, bg_name)
            if fg is None or bg is None:
                failures += 1
                rows.append(f"  ??? unresolved  {fg_name} on {bg_name}")
                continue
            bg = over(bg, base) if bg[3] < 1 else bg
            fg = over(fg, bg) if fg[3] < 1 else fg
            r = ratio(fg, bg)
            ok = r >= minimum
            failures += not ok
            rows.append(f"  {'ok ' if ok else 'LOW'} {r:5.2f} (min {minimum:g})  {fg_name} on {bg_name}")
        print(theme)
        print("\n".join(rows))
    print(f"\n{failures} pair(s) below target")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
