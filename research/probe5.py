import ssl, urllib.request, gzip, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
def get(u, n=400000):
    hh={'User-Agent':UA,'Accept-Encoding':'gzip','Accept-Language':'zh-CN,zh;q=0.9'}
    req=urllib.request.Request(u, headers=hh)
    try:
        r=urllib.request.urlopen(req, timeout=25, context=ctx); b=r.read()
        if r.headers.get('Content-Encoding')=='gzip': b=gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')
    except Exception as e: return 'ERR', str(e)
s,h=get("https://fgk.chinatax.gov.cn/zcfgk/index.html")
print(s, len(h) if isinstance(h,str) else h)
print([x for x in re.findall(r'src="([^"]+)"', h) if 'js' in x])
# look for any api hints
print([x for x in re.findall(r'["\'](/[a-zA-Z0-9_/\-]*api[a-zA-Z0-9_/\-]*)["\']', h)][:20])
s2,h2=get("http://www.chinatax.gov.cn/search5/html/mainPage.html?siteCode=bm29000002")
print("SEARCH5", s2, len(h2) if isinstance(h2,str) else h2)
print([x for x in re.findall(r'src="([^"]+)"', h2)][:20] if isinstance(h2,str) else '')
