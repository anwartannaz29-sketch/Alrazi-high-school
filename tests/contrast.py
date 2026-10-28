"""tests/contrast.py — يحسب نسب التباين WCAG لأزواج الألوان الأساسية من css/styles.css (الوضعان). تشغيل: python tests/contrast.py"""
import re, sys, os
css = open(os.path.join(os.path.dirname(__file__), "..", "css", "styles.css"), encoding="utf-8").read()
def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css, re.S); return dict(re.findall(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})", m.group(1)))
light = block(":root"); dark = {**light, **block(':root[data-theme="dark"]')}
def lum(h):
    c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]; c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]; return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def ratio(a, b): la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + .05) / (lb + .05)
PAIRS = [("text","bg",4.5),("text","surface",4.5),("text","tint",4.5),("muted","bg",4.5),("muted","surface",4.5),("muted","tint",4.5),("primary-ink","bg",4.5),("secondary","bg",4.5),("secondary","surface",4.5),("primary-ink","surface",4.5),
 ("on-primary","primary",4.5),("on-accent","accent",4.5),("gold-ink","bg",4.5),("gold-ink","surface",4.5),("danger","surface",4.5),("success","surface",4.5),("warning","surface",4.5),("info","surface",4.5),
 ("accent","hero-bg",4.5)]
bad = 0
for name, T in (("light", light), ("dark", dark)):
    for a, b, need in PAIRS:
        T2 = dict(T); T2["#f7f5ef"] = "#F7F5EF"
        r = ratio(T[a], T[b]); ok = r >= need; bad += not ok; print(("PASS " if ok else "FAIL ") + f"{name}: {a} on {b} = {r:.2f} (need {need})")
    band = T["primary-ink"] if name == "light" else "#14281F"   # خلفية شريط الإحصائيات و"اليوم في الرازي"
    for fg, label in ((T["accent"], "accent"), ("#F7F5EF" if name == "light" else T["text"], "text")):
        r = ratio(fg, band); ok = r >= 4.5; bad += not ok; print(("PASS " if ok else "FAIL ") + f"{name}: {label} on dark band {band} = {r:.2f}")
    r = ratio("#F7F5EF", T["hero-bg"]); ok = r >= 4.5; bad += not ok; print(("PASS " if ok else "FAIL ") + f"{name}: hero text #F7F5EF on hero-bg = {r:.2f}")
print(f"\n{'all passed' if not bad else str(bad)+' FAILED'}"); sys.exit(1 if bad else 0)
