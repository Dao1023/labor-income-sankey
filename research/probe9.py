import ssl, urllib.request, gzip, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
def get(u):
    hh={'User-Agent':UA,'Accept-Encoding':'gzip'}
    req=urllib.request.Request(u, headers=hh)
    r=urllib.request.urlopen(req, timeout=25, context=ctx); b=r.read()
    if r.headers.get('Content-Encoding')=='gzip': b=gzip.decompress(b)
    return r.status, b.decode('utf-8','ignore')
s,h=get("http://www.chinatax.gov.cn/search5/static/js/common/searchInit.js")
print(s,len(h))
for m in re.finditer(r'(ctx\s*\+[^;\n]{0,120})', h):
    print(m.group(1)[:140])
print("---")
for m in re.finditer(r'url\s*:\s*[^,\n]{0,120}', h):
    print(m.group(0)[:140])
