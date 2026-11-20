import sys, json, urllib.parse
from gov import get, strip_html
def run(q, n=8):
    url = ("https://sousuo.www.gov.cn/search-gov/data?t=zhengcelibrary&q=%s&timetype=timeqb&sort=pubtime&sortType=1&searchfield=title&p=1&n=%d&type=gwyzcwjk" % (urllib.parse.quote(q), n))
    try: d=json.loads(get(url))
    except Exception as e:
        print("ERR",e); return
    print("### "+q)
    c=0
    for cat,v in (d.get("searchVO") or {}).get("catMap",{}).items():
        for it in (v.get("listVO") or []):
            c+=1
            if c>7: break
            print("  %s | %s | %s\n    %s" % (strip_html(it.get("title") or "")[:70], it.get("pcode"), it.get("pubtimeStr"), it.get("url")))
    if c==0: print("  (none)")
for q in sys.argv[1:]: run(q)
