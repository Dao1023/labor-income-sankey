/* 把 app/ 的四个脚本内联进 index.html，产出单文件 dist/labor-income.html */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const appDir = path.join(root, 'app');
const distDir = path.join(root, 'dist');

let html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const files = ['data.js', 'engine.js', 'sankey.js', 'app.js'];
let inlined = 0;

for (const f of files) {
  const tag = `<script src="${f}"></script>`;
  if (!html.includes(tag)) throw new Error(`未找到脚本标签: ${tag}`);
  const code = fs.readFileSync(path.join(appDir, f), 'utf8');
  if (code.includes('</script')) throw new Error(`${f} 含有 </script，无法安全内联`);
  html = html.replace(tag, () => `<script>\n${code}\n</script>`);
  inlined++;
}

if (/<script[^>]+src=/.test(html)) throw new Error('仍有外部脚本引用');
fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, 'labor-income.html');
fs.writeFileSync(out, html);
console.log(`inlined ${inlined} scripts -> ${path.relative(root, out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
