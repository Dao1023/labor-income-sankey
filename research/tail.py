import sys, re
from gov import get, strip_html
u=sys.argv[1]; kw=sys.argv[2]; n=int(sys.argv[3]) if len(sys.argv)>3 else 3000
t=strip_html(get(u))
idxs=[m.start() for m in re.finditer(re.escape(kw), t)]
print("occurrences:", len(idxs), "len", len(t))
s = idxs[-1] if idxs else 0
print(t[s:s+n])
