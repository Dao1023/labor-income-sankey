/* verify-demo.mjs —— 在 Node 里用一个最小 DOM 垫片跑 sankey-demo.html
 *
 * 为什么不是真浏览器：本机 DSH 沙箱禁止启动 Chrome
 *   (crashpad OpenProcess Access denied / mojo platform_channel Check failed；
 *    node child_process.spawn 直接 EPERM；npm 装 jsdom 被策略拦下 "type remote disabled")
 * 所以这里自己实现 demo 实际用到的那一小撮 DOM API，真跑 demo 的同一份脚本，
 * 断言布局数值、hover、导出字符串、响应式重排。
 *
 *   node verify-demo.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const HTML = new URL('./sankey-demo.html', import.meta.url);
const src = readFileSync(HTML, 'utf8');
const code = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
const errs = [];

/* ───────────────────────── 最小 DOM ───────────────────────── */
let uid = 0;
const isText = n => n.tag === '#text';

class N {
  constructor(tag, ns) {
    this.tag = tag; this.ns = ns || null; this.id = ++uid;
    this.attrs = new Map(); this.children = []; this.parentNode = null;
    this._text = null; this._w = 0; this.style = {}; this.listeners = new Map();
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const self = this;
    const list = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (...cs) => { const s = new Set(list()); cs.forEach(c => s.add(c)); self.className = [...s].join(' '); },
      remove: (...cs) => {
        const s = new Set(list()); cs.forEach(c => s.delete(c));
        const out = [...s].join(' ');
        if (out) self.className = out; else self.attrs.delete('class');
      },
      contains: c => list().includes(c),
      toggle: (c, force) => {
        const has = self.className.split(/\s+/).includes(c);
        const on = force === undefined ? !has : !!force;
        if (on && !has) self.className = (self.className + ' ' + c).trim();
        if (!on && has) self.className = list().filter(x => x !== c).join(' ');
        return on;
      }
    };
  }
  get dataset() {
    const o = {};
    for (const [k, v] of this.attrs) if (k.startsWith('data-')) o[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    return o;
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { this.parentNode && this.parentNode.removeChild(this); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = String(v).replace(/<[^>]*>/g, ''); }
  get textContent() {
    if (isText(this)) return this._text;
    if (this._text != null) return this._text;          // innerHTML / textContent 写入的扁平文本
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  get firstChild() { return this.children[0] || null; }
  get clientWidth() { return this._w; }
  set clientWidth(v) { this._w = v; }
  get offsetWidth() { return 0; }
  get offsetHeight() { return 0; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this._w || 1200, height: 640, right: this._w || 1200, bottom: 640 }; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatchEvent(type, ev) {
    ev = ev || {};
    ev.type = type; ev.currentTarget = this; ev.target = ev.target || this;
    (this.listeners.get(type) || []).forEach(fn => fn(ev));
    return true;
  }
  click() { clicks.push(this); }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
  matches(sel) {
    for (const part of sel.split(',').map(s => s.trim())) {
      const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(part);
      if (!m) continue;
      if (m[1] && this.tag !== m[1]) continue;
      const cls = m[2] ? m[2].split('.').filter(Boolean) : [];
      if (!cls.every(c => this.className.split(/\s+/).includes(c))) continue;
      const ats = m[3] ? m[3].match(/\[[^\]]+\]/g) : [];
      if (!ats.every(a => this.hasAttribute(a.slice(1, -1).split('=')[0].trim()))) continue;
      return true;
    }
    return false;
  }
  querySelectorAll(sel) { const out = []; walk(this, n => { if (n !== this && n.matches && n.matches(sel)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  cloneNode(deep) {
    const c = this.tag === 'canvas' ? new Canvas() : new N(this.tag, this.ns);
    for (const [k, v] of this.attrs) c.attrs.set(k, v);
    if (isText(this)) c._text = this._text;
    if (deep) this.children.forEach(ch => c.appendChild(ch.cloneNode(true)));
    return c;
  }
}
function walk(n, fn) { fn(n); n.children.forEach(c => walk(c, fn)); }
const txt = s => { const n = new N('#text'); n._text = String(s); return n; };

class Canvas extends N {
  constructor() { super('canvas'); this.width = 0; this.height = 0; this.ctx = null; }
  getContext() {
    const self = this;
    this.ctx = {
      drawn: null, fillStyle: '',
      fillRect() {},
      drawImage(img, x, y, w, h) { self.ctx.drawn = { src: img._src, x, y, w, h }; }
    };
    return this.ctx;
  }
  toBlob(cb, type) { cb(new Blob(['png-bytes'], { type: type || 'image/png' })); }
}

/* ───────────────────────── 序列化器（XMLSerializer） ───────────────────────── */
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function serialize(n, top) {
  if (isText(n)) return String(n._text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attrs = [...n.attrs].map(([k, v]) => ' ' + k + '="' + escAttr(v) + '"').join('');
  if (!n.children.length && n.tag !== 'style') return '<' + n.tag + attrs + '/>';
  return '<' + n.tag + attrs + '>' + n.children.map(c => serialize(c)).join('') + '</' + n.tag + '>';
}
class XMLSerializer { serializeToString(n) { return serialize(n, true); } }

/* ───────────────────────── 全局垫片 ───────────────────────── */
const clicks = [];
const rafQ = [];
let resizeCb = null;

let lastCanvas = null;
const ids = {};
for (const id of ['sankey', 'chart', 'tip', 'btnSvg', 'btnPng']) ids[id] = new N('div');
ids.sankey = new N('svg', 'http://www.w3.org/2000/svg');
ids.chart.clientWidth = 1200;

const doc = {
  body: new N('body'),
  getElementById: id => ids[id] || null,
  createElementNS: (ns, t) => new N(t, ns),
  createElement: t => {
    if (t === 'canvas') { lastCanvas = new Canvas(); return lastCanvas; }
    return new N(t);
  },
  createTextNode: t => txt(t)
};

class Blob {
  constructor(parts, opts) { this.parts = parts.map(String); this.type = (opts && opts.type) || ''; this.size = this.parts.join('').length; }
}
const urls = new Map();
let urlN = 0;
const URLshim = {
  createObjectURL(b) { const u = 'blob:shim/' + (++urlN); urls.set(u, b); return u; },
  revokeObjectURL(u) { urls.delete(u); }
};
class ImageShim {
  constructor() { this._src = ''; this.onload = null; this.onerror = null; }
  set src(v) { this._src = v; setTimeout(() => this.onload && this.onload({ target: this }), 0); }
  get src() { return this._src; }
}
class ResizeObserverShim { constructor(cb) { resizeCb = cb; this.cb = cb; } observe() {} disconnect() {} }

const win = {
  ResizeObserver: ResizeObserverShim,
  addEventListener() {},
  removeEventListener() {}
};

const g = globalThis;
const prev = {};
const sandbox = {
  window: win, document: doc, XMLSerializer, Blob, URL: URLshim, Image: ImageShim,
  ResizeObserver: ResizeObserverShim,
  requestAnimationFrame: cb => { rafQ.push(cb); return rafQ.length; },
  cancelAnimationFrame: i => { rafQ[i - 1] = null; }
};
const flushRaf = () => { while (rafQ.length) { const cb = rafQ.shift(); if (cb) cb(0); } };

/* ───────────────────────── 跑 demo 的脚本 ───────────────────────── */
const run = new Function(...Object.keys(sandbox), code + '\n//# sourceURL=sankey-demo-inline.js');
try { run(...Object.values(sandbox)); }
catch (e) { errs.push('启动异常: ' + e.message + '\n' + e.stack); }

const LS = win.LaborSankey;
const fail = [];
const ok = [];
const check = (name, cond, detail) => (cond ? ok.push(name) : fail.push(name + (detail ? ' → ' + detail : '')));

check('window.LaborSankey 暴露', !!LS);

if (LS) {
  const s = LS.stats();
  check('节点/连线数量 15/14', s.nodes === 15 && s.links === 14, JSON.stringify(s));
  check('已绘路径数 = 连线数', s.paths === s.links, s.paths + ' vs ' + s.links);
  check('无 NaN/undefined 路径', s.badPaths === 0, 'bad=' + s.badPaths);
  check('标签无重叠', s.labelOverlaps === 0, 'overlaps=' + s.labelOverlaps);
  check('节点全在画布内', s.outOfCanvas === 0, 'out=' + s.outOfCanvas);
  check('ky 为正有限数', isFinite(s.ky) && s.ky > 0, 'ky=' + s.ky);
  check('宽高 1200x640', s.width === 1200 && s.height === 640, s.width + 'x' + s.height);

  /* 几何：守恒 + 边界 */
  const svg = ids.sankey;
  const paths = svg.querySelectorAll('path.link');
  const badD = paths.filter(p => {
    const d = p.getAttribute('d') || '';
    return !/^M[\d.,-]+ C/.test(d) || !/Z$/.test(d) || /NaN|undefined|null/.test(d);
  });
  check('14 条带子 d 结构正确 (M…C…C…Z)', paths.length === 14 && badD.length === 0, 'bad=' + badD.length);

  // 每条带子的吞吐 = 其 value * ky，与节点高一致
  const nodes = svg.querySelectorAll('g.node');
  check('15 个节点组', nodes.length === 15, String(nodes.length));
  const hs = [...nodes].map(g2 => parseFloat(g2.children[0].getAttribute('height')));
  check('最高节点 < 绘图区高 546', Math.max(...hs) > 0 && Math.max(...hs) <= 546, 'maxH=' + Math.max(...hs).toFixed(1));
  check('同列节点不重叠（按 y 排序后间距 >= 16）', (() => {
    const cols = new Map();
    [...nodes].forEach(g2 => {
      const r = g2.children[0], x = r.getAttribute('x');
      if (!cols.has(x)) cols.set(x, []);
      cols.get(x).push([parseFloat(r.getAttribute('y')), parseFloat(r.getAttribute('height'))]);
    });
    for (const arr of cols.values()) {
      arr.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < arr.length; i++) if (arr[i][0] - (arr[i - 1][0] + arr[i - 1][1]) < 15.9) return false;
    }
    return true;
  })());

  // 带宽严格为正
  const widths = paths.map(p => {
    const nums = (p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    return Math.abs(nums[9] - nums[7]); // 下边 y1+w 减上边 y1
  });
  check('所有带宽 > 0', widths.every(w => w > 0), 'min=' + Math.min(...widths).toFixed(2));

  /* hover */
  const link0 = paths[0];
  svg.dispatchEvent('pointermove', { target: link0, clientX: 400, clientY: 300 });
  const tip = ids.tip;
  check('hover 流带 → tooltip 显示', tip.classList.contains('show'), 'class=' + tip.className);
  check('tooltip 文案含 "→"', /→/.test(tip.textContent), tip.textContent.slice(0, 60));
  check('hover → svg 加 focusing', svg.classList.contains('focusing'));
  const on = svg.querySelectorAll('.on');
  check('邻接元素高亮 (≥3 个)', on.length >= 3, 'on=' + on.length);

  const nodeG = nodes[0];
  svg.dispatchEvent('pointermove', { target: nodeG, clientX: 120, clientY: 200 });
  check('hover 节点 → tooltip 含占比', /占总收入/.test(tip.textContent), tip.textContent.slice(0, 60));

  svg.dispatchEvent('pointermove', { target: svg, clientX: 5, clientY: 5 });
  check('移出到空白 → tooltip 收起', !tip.classList.contains('show') && !svg.classList.contains('focusing'));

  /* 导出 SVG */
  const str = LS.svgString();
  check('SVG 字符串带 XML 声明', str.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  check('SVG 带 xmlns', str.includes('xmlns="http://www.w3.org/2000/svg"'));
  check('SVG 带 viewBox', /viewBox="0 0 1200 640"/.test(str));
  check('SVG 内联 <style>', str.includes('<style>') && str.includes('.lbl.name'));
  check('SVG 含 14 条 link path', (str.match(/class="link"/g) || []).length === 14);
  check('SVG 无 NaN/undefined', !/NaN|undefined/.test(str));
  check('SVG 未带 .enter/.focusing 残留', !/class="[^"]*(enter|focusing)/.test(str));
  const opens = (str.match(/<[a-zA-Z]/g) || []).length;
  const closes = (str.match(/<\/[a-zA-Z]/g) || []).length + (str.match(/\/>/g) || []).length;
  check('标签开闭平衡', opens === closes, opens + ' vs ' + closes);

  /* 导出 PNG（canvas 为垫片，验证流程与尺寸） */
  const png = await LS.pngBlob(2);
  check('pngBlob 返回 image/png', png && png.type === 'image/png', png && png.type);
  const cv = lastCanvas;
  check('PNG 画布按 2x 尺寸', !!(cv && cv.width === 2400 && cv.height === 1280), cv ? cv.width + 'x' + cv.height : 'no canvas');
  check('PNG 画布已 drawImage', !!(cv && cv.ctx && cv.ctx.drawn), 'no draw');
} else {
  fail.push('无法继续：LaborSankey 未定义');
}

/* 响应式：把容器改窄，走 ResizeObserver → rAF → measure/render */
if (LS && resizeCb) {
  ids.chart.clientWidth = 700;
  resizeCb([]); flushRaf();
  const s2 = LS.stats();
  check('窄屏 700 重排生效', s2.width === 700, 'w=' + s2.width);
  check('窄屏仍无标签重叠', s2.labelOverlaps === 0, 'overlaps=' + s2.labelOverlaps);
  check('窄屏仍无坏路径', s2.badPaths === 0 && s2.paths === 14, 'bad=' + s2.badPaths + ' paths=' + s2.paths);
  const s3 = ids.sankey.querySelectorAll('path.link').map(p => p.getAttribute('d')).join('');
  check('窄屏无 NaN 坐标', !/NaN|undefined/.test(s3));
  ids.chart.clientWidth = 1200;
  resizeCb([]); flushRaf();
  check('恢复宽屏', LS.stats().width === 1200);
} else { fail.push('ResizeObserver 未被注册'); }

/* 导出落盘，供人工/后续查看 */
if (LS) {
  mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./shots/sankey-export.svg', import.meta.url), LS.svgString(), 'utf8');
}

const report = [
  'PASS ' + ok.length + ' / FAIL ' + fail.length,
  ...(fail.length ? ['失败项:', ...fail.map(f => '  ✗ ' + f)] : []),
  ...(errs.length ? ['运行期异常:', ...errs.map(e => '  ! ' + e)] : []),
  '✓ ' + ok.join('\n✓ ')
].join('\n');
console.log(report);
process.exit(fail.length || errs.length ? 1 : 0);
