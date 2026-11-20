import sys, re
from gov import get
u=sys.argv[1]
h=get(u)
for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
    txt=re.sub(r'<[^>]+>','',m.group(2)).strip()
    if any(k in txt for k in ('附件','税率表','下载','.pdf','.doc')) or any(k in m.group(1) for k in ('.pdf','.doc','.xls','附件')):
        print(txt[:40], '|', m.group(1))
