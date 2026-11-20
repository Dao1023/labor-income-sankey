import ssl, sys, urllib.request, urllib.parse, gzip, re, html
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
def get(u, n=400000):
    hh={'User-Agent':UA,'Accept-Encoding':'gzip','Accept':'text/html,application/xhtml+xml','Accept-Language':'zh-CN,zh;q=0.9'}
    req = urllib.request.Request(u, headers=hh)
    r = urllib.request.urlopen(req, timeout=25, context=ctx)
    b=r.read()
    if r.headers.get('Content-Encoding')=='gzip': b=gzip.decompress(b)
    return r.status, b.decode('utf-8','ignore')
def clean(s):
    s=re.sub(r'(?s)<[^>]+>','',s); s=html.unescape(s); return re.sub(r'\s+',' ',s).strip()
def search(q, n=12):
    s,h = get('https://cn.bing.com/search?q='+urllib.parse.quote(q)+'&ensearch=0&count=20')
    out=[]
    for m in re.finditer(r'<li class="b_algo".*?</li>', h, re.S):
        blk=m.group(0)
        a=re.search(r'<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not a: continue
        p=re.search(r'<p[^>]*>(.*?)</p>', blk, re.S)
        out.append((clean(a.group(2)), a.group(1), clean(p.group(1))[:200] if p else ''))
    return out[:n]
if __name__=='__main__':
    q=' '.join(sys.argv[1:])
    for t,u,p in search(q):
        print(f"- {t}\n  {u}\n  {p}\n")
