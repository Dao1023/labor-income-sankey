import base64, json, os, sys

root = ".publish"
out = ".bodies"
os.makedirs(os.path.join(out, "blobs"), exist_ok=True)
files = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != ".git"]
    for fn in filenames:
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, root).replace("\\", "/")
        files.append((rel, full))
files.sort()

manifest = []
for i, (rel, full) in enumerate(files):
    data = open(full, "rb").read()
    body = {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"}
    with open(os.path.join(out, "blobs", "%03d.json" % i), "w", encoding="utf-8") as f:
        json.dump(body, f)
    manifest.append((i, rel, len(data)))

with open(os.path.join(out, "manifest.tsv"), "w", encoding="utf-8") as f:
    for i, rel, n in manifest:
        f.write("%03d\t%s\t%d\n" % (i, rel, n))
print("files:", len(manifest))
