import ssl, urllib.request, gzip
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
def get(u):
    hh={'User-Agent':UA,'Accept-Encoding':'gzip'}
    req=urllib.request.Request(u, headers=hh)
    try:
        r=urllib.request.urlopen(req, timeout=25, context=ctx); b=r.read()
        if r.headers.get('Content-Encoding')=='gzip': b=gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')
    except Exception as e: return 'ERR', str(e)
for u in ["http://www.chinatax.gov.cn/search5/static/common/config.js",
          "https://fgk.chinatax.gov.cn/zcfgk/xhtml/js/index.js"]:
    s,h=get(u); print("=====",u,s,len(h) if isinstance(h,str) else h)
    print(h[:3000] if isinstance(h,str) else h)
