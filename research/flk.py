import sys, json, ssl, urllib.parse, urllib.request
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36','Accept':'application/json'}
q=sys.argv[1]
u=("https://flk.npc.gov.cn/api/?type=&searchType=title%3Bvague&sortTr=f_bbrq_s%3Bdesc&gbrqStart=&gbrqEnd=&sxrqStart=&sxrqEnd=&sort=true&page=1&size=10&keyword="+urllib.parse.quote(q))
req=urllib.request.Request(u, headers=UA)
try:
    d=json.loads(urllib.request.urlopen(req, timeout=25, context=ctx).read().decode('utf-8'))
except Exception as e:
    print("ERR", e); sys.exit()
print(json.dumps(d, ensure_ascii=False)[:300])
for it in (d.get('result') or {}).get('data',[]):
    print("-", it.get('title'), "|", it.get('publish'), "|", it.get('status'), "|", it.get('id'))
