import ssl, urllib.request, urllib.parse, gzip, re
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
def get(u, ref=None, n=200000):
    hh={'User-Agent':UA,'Accept-Encoding':'gzip','Accept':'text/html,application/xhtml+xml','Accept-Language':'zh-CN,zh;q=0.9'}
    if ref: hh['Referer']=ref
    req = urllib.request.Request(u, headers=hh)
    try:
        r = urllib.request.urlopen(req, timeout=25, context=ctx)
        b = r.read()
        if r.headers.get('Content-Encoding')=='gzip': b=gzip.decompress(b)
        return r.status, b.decode('utf-8','ignore')
    except Exception as e:
        return 'ERR', str(e)
q = urllib.parse.quote('site:fgk.chinatax.gov.cn 全年一次性奖金')
tests = {
 'bing': f'https://cn.bing.com/search?q={q}&ensearch=0',
 'so360': f'https://www.so.com/s?q={q}',
 'baidu': f'https://www.baidu.com/s?wd={q}',
 'sogou': f'https://www.sogou.com/web?query={q}',
 'ddg': 'https://html.duckduckgo.com/html/?q='+q,
}
for k,u in tests.items():
    s,h=get(u)
    links = re.findall(r'(https?://[^\s"\'<>]*chinatax\.gov\.cn[^\s"\'<>]*)', h) if isinstance(h,str) else []
    print("=====",k,s,len(h) if isinstance(h,str) else h)
    print(list(dict.fromkeys(links))[:8])
    if s=='ERR' or (isinstance(h,str) and ('验证' in h[:3000] or 'captcha' in h.lower()[:3000])):
        print("BODY:", h[:300].replace("\n"," "))
