import ssl, urllib.request, gzip, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(u, n=200000):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Accept-Encoding':'gzip'})
    try:
        r = urllib.request.urlopen(req, timeout=25, context=ctx)
        b = r.read()
        if r.headers.get('Content-Encoding')=='gzip': b = gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')
    except Exception as e:
        return 'ERR', str(e)
for u in ["https://fgk.chinatax.gov.cn/zcfgk/xhtml/js/header.js"]:
    s,h=get(u); print("==",u,s,len(h))
    print(h[:4000])
