import json, urllib.parse, sys
from gov import get, strip_html
def run(q, sf=None, t="zhengcelibrary", typ="gwyzcwjk", n=8):
    url = ("https://sousuo.www.gov.cn/search-gov/data?t=%s&q=%s&timetype=timeqb&sort=pubtime&sortType=1&p=1&n=%d&type=%s" % (t, urllib.parse.quote(q), n, typ))
    if sf is not None: url += "&searchfield="+sf
    try: d=json.loads(get(url))
    except Exception as e: print("ERR",e); return
    cnt=0
    for cat,v in (d.get("searchVO") or {}).get("catMap",{}).items():
        for it in (v.get("listVO") or []):
            cnt+=1
            if cnt<=6:
                print("  -", strip_html(it.get("title") or "")[:90], "|", it.get("pcode"), "|", it.get("pubtimeStr"))
                print("   ", it.get("url"))
    print("TOTAL", cnt, "q=",q,"sf=",sf,"t=",t)
for q in ["解除劳动合同一次性补偿","一次性补偿收入","内部退养","提前退休"]:
    run(q, "")
print("=== type all ===")
run("解除劳动合同一次性补偿", None, "zhengcelibrary", "all")
run("个人所得税法实施条例", None)
