import sys, re
from gov import get, strip_html
u=sys.argv[1]; pat=sys.argv[2]; n=int(sys.argv[3]) if len(sys.argv)>3 else 800
t=strip_html(get(u))
print("LEN", len(t))
for m in re.finditer(pat, t):
    print("……", t[max(0,m.start()-n//3):m.start()+n].replace("\n"," / "))
    print("-----")
