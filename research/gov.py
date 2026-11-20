import sys, json, ssl, re, urllib.parse, urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        raw = r.read()
    for enc in ("utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "ignore")


def strip_html(html):
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<br\s*/?>", "\n", html)
    html = re.sub(r"(?is)</(p|div|tr|h\d|li|table)>", "\n", html)
    html = re.sub(r"(?s)<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    lines = [re.sub(r"[ \t\u3000]+", " ", ln).strip() for ln in html.splitlines()]
    out, prev = [], None
    for ln in lines:
        if not ln:
            continue
        if ln == prev:
            continue
        out.append(ln)
        prev = ln
    return "\n".join(out)


def search(q, n=10):
    url = ("https://sousuo.www.gov.cn/search-gov/data?t=zhengcelibrary&q=" + urllib.parse.quote(q)
           + "&timetype=timeqb&sort=pubtime&sortType=1&searchfield=title&p=1&n=%d&type=gwyzcwjk" % n)
    d = json.loads(get(url))
    sv = d.get("searchVO") or {}
    cats = sv.get("catMap") or {}
    total = 0
    for cat, v in cats.items():
        for it in (v.get("listVO") or []):
            total += 1
            title = re.sub(r"(?s)<[^>]+>", "", it.get("title") or "")
            print("- [%s] %s | %s | %s" % (cat, title, it.get("pcode") or "-", it.get("pubtimeStr") or "-"))
            print("  " + (it.get("url") or ""))
            s = strip_html(it.get("summary") or "").replace("\n", " ")
            if s:
                print("  " + s[:180])
    if total == 0:
        print("(no results)")


def page(url, limit=6000, start=None):
    t = strip_html(get(url))
    idx = t.find(start) if start else 0
    if idx > 0:
        t = t[idx:]
    print(t[:limit])


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "s":
        search(" ".join(sys.argv[2:]))
    elif mode == "s2":
        search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 10)
    elif mode == "p":
        page(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 6000)
    elif mode == "p2":
        page(sys.argv[2], int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else None)
