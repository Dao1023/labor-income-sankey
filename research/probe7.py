import ssl, urllib.request, gzip, re
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
s,h=get("http://www.chinatax.gov.cn/search5/html/searchResult.html?siteCode=bm29000002&searchWord=%E4%B8%AA%E4%BA%BA%E6%89%80%E5%BE%97%E7%A8%8E&left_right_index=0&searchSource=0")
print(s, len(h) if isinstance(h,str) else h)
print([x for x in re.findall(r'src="([^"]+)"',h) if '.js' in x])
