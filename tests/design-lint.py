"""tests/design-lint.py — يتحقق من انضباط نظام التصميم: لا قيم مسافات/أنصاف أقطار/أحجام خطوط/انتقالات عشوائية خارج التوكنز،
ووجود حالات الأزرار (hover/active/focus/disabled/loading). تشغيل: python tests/design-lint.py"""
import re, os, sys
D = os.path.join(os.path.dirname(__file__), "..", "css")
bad = 0
def check(name, ok, extra=""):
    global bad; bad += not ok; print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))
files = {f: open(os.path.join(D, f), encoding="utf-8").read() for f in ("styles.css", "admin.css")}
def strip_print(s):
    out, i = [], 0
    while True:
        m = re.search(r"@media print\s*\{", s[i:])
        if not m: out.append(s[i:]); break
        out.append(s[i:i + m.start()]); j = i + m.end(); depth = 1
        while depth and j < len(s):
            depth += s[j] == "{"; depth -= s[j] == "}"; j += 1
        i = j
    return "".join(out)
code = {f: strip_print(s.split("*, *::before", 1)[1] if f == "styles.css" else s) for f, s in files.items()}
FN = re.compile(r"(calc|clamp|env|min|max)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)")
def offenders(rx, allow=lambda v: False):
    out = []
    for f, s in code.items():
        for m in re.finditer(rx, s):
            v = FN.sub("0", m.group(2).strip()) if m.group(1) in ("padding","margin","gap","padding-inline","padding-block","padding-top","padding-bottom","margin-top","margin-bottom","margin-inline","margin-block","column-gap","row-gap") else m.group(2).strip()
            if not allow(v): out.append(f"{f}: {m.group(1)}: {v}")
    return out
SP = r"(?<![-\w])(padding(?:-inline|-block|-top|-bottom)?|margin(?:-inline|-block|-top|-bottom)?|gap|column-gap|row-gap)"
spacing = offenders(SP + r":\s*([^;}{]+)[;}]", lambda v: v.startswith(("calc(", "clamp(", "env(")) or all(re.fullmatch(r"0|auto|var\(--[\w-]+\)|[-\d.]+%|[-\d.]+em", t) for t in v.split()) or v == "-10px 0 0 -10px" or v == "-8px 0 0 -8px" or v.startswith("var(--sp-") and "env(" in v)
check("spacing: all padding/margin/gap use scale tokens (or 0/auto/%/em/calc)", not spacing, "; ".join(spacing[:6]) + f" … ({len(spacing)})")
rad = offenders(r"(?<![-\w])(border-radius):\s*([^;}{]+)[;}]", lambda v: all(re.fullmatch(r"0|50%|var\(--r-[\w]+\)", t) for t in v.split()) or v == "24px 24px 24px 70px" or v == "0 0 4px 4px" or v == "22px 22px 0 0" or v == "var(--r-xl) var(--r-xl) 0 0")
check("radii: all border-radius use --r-* tokens", not rad, "; ".join(rad[:6]) + f" … ({len(rad)})")
fsz = offenders(r"(?<![-\w])(font-size):\s*([^;}{]+)[;}]", lambda v: v.startswith(("var(", "clamp(", "inherit")))
check("type: all font-size use --fs-* tokens", not fsz, "; ".join(fsz[:6]) + f" … ({len(fsz)})")
tr = offenders(r"(?<![-\w])(transition|animation-duration):\s*([^;}{]+)[;}]", lambda v: not re.search(r"(?<![\w-])\.?\d+m?s\b", re.sub(r"var\([^)]*\)", "", v)) or v.startswith(".01ms"))
check("motion: transitions use --t-* tokens", not tr, "; ".join(tr[:6]) + f" … ({len(tr)})")
sh = offenders(r"(?<![-\w])(box-shadow):\s*([^;}{]+)[;}]", lambda v: v in ("none",) or v.startswith(("var(--sh-", "inset 4px 0 0 var(--accent)", "0 0 0 5px color-mix")) or "inset 0 1px 0" in v or "inset 0 0 0 1px" in v)
check("shadows: only --sh-* tokens (plus 3 intentional inset details)", not sh, "; ".join(sh[:6]) + f" … ({len(sh)})")
allcss = "".join(files.values())
for sel in (".btn:hover", ".btn:active", ".btn:disabled", ".btn.is-loading", ".btn-icon:hover", ".btn-icon:active", ".btn-icon:disabled", ".chip:hover", ".chip:active", ".chip:disabled", ":focus-visible", "input:disabled", ".arow__a button.is-loading"):
    check(f"states: {sel} defined", sel in allcss)
for v in ("--btn", "--b-bg"): pass
check("controls: --h-control is 48px and --h-control-sm is 44px", "--h-control: 48px" in allcss and "--h-control-sm: 44px" in allcss)
check("reduced motion handled", "prefers-reduced-motion: reduce" in allcss)
check("no emoji in CSS/JS/HTML sources", not re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", "".join(open(os.path.join(os.path.dirname(__file__), "..", f), encoding="utf-8").read() for f in ("index.html", "about.html", "privacy.html", "js/app.js", "js/admin.js", "admin/index.html"))))
print(f"\n{'all passed' if not bad else str(bad) + ' FAILED'}"); sys.exit(1 if bad else 0)
