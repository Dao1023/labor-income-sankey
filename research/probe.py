import ssl, urllib.request, gzip, io, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(u, n=3000):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Accept-Encoding':'gzip'})
    try:
        r = urllib.request.urlopen(req, timeout=25, context=ctx)
        b = r.read()
        if r.headers.get('Content-Encoding')=='gzip':
            b = gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')[:n]
    except Exception as e:
        return 'ERR', str(e)
targets = [
 "https://fgk.chinatax.gov.cn/zcfgk/c100009/c5194614/content.html",
 "https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194785/content.html",
 "https://www.chinatax.gov.cn/chinatax/n810341/n810755/c3967309/content.html",
 "https://www.chinatax.gov.cn/chinatax/n810214/n810641/index.html",
]
for t in targets:
    s,h = get(t)
    print("=====", t, s)
    print(h[:600].replace("\n"," "))
