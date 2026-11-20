import ssl, urllib.request, gzip, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(u, n=100000):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Accept-Encoding':'gzip'})
    try:
        r = urllib.request.urlopen(req, timeout=25, context=ctx)
        b = r.read()
        if r.headers.get('Content-Encoding')=='gzip': b = gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')
    except Exception as e:
        return 'ERR', str(e)
s,h = get("https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194785/content.html")
print(s)
# strip tags
txt = re.sub(r'(?is)<(script|style).*?</\1>',' ',h)
txt = re.sub(r'(?s)<[^>]+>',' ',txt)
txt = re.sub(r'&nbsp;',' ',txt); txt = re.sub(r'\s+',' ',txt)
print(txt[:2500])
print("---SCRIPTS---")
print(re.findall(r'src="([^"]+)"', h)[:20])
