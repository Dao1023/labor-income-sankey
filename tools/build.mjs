/* 把 ui/index.html 引用的脚本（含 vendor/echarts.min.js）内联成单文件
   产出：dist/labor-income.html 与 docs/index.html（GitHub Pages） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(root, 'ui');

let html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
let inlined = 0;

html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (tag, src) => {
  const file = path.resolve(uiDir, src);
  if (!fs.existsSync(file)) throw new Error(`脚本不存在: ${src}`);
  const code = fs.readFileSync(file, 'utf8');
  if (code.includes('</script')) throw new Error(`${src} 含有 </script 字面量，无法安全内联`);
  inlined++;
  return `<script>\n${code}\n</script>`;
});

if (/<script[^>]+src=/.test(html)) throw new Error('仍有外部脚本引用');
if (/<link[^>]+href=/.test(html)) throw new Error('仍有外部样式引用');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const out1 = path.join(root, 'dist', 'labor-income.html');
const out2 = path.join(root, 'docs', 'index.html');
fs.writeFileSync(out1, html);
fs.writeFileSync(out2, html);
fs.writeFileSync(path.join(root, 'docs', '.nojekyll'), '');

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`inlined ${inlined} scripts`);
console.log(`  dist/labor-income.html  ${kb} KB`);
console.log(`  docs/index.html         ${kb} KB (Pages)`);
