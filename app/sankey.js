/* 劳动收入组成 · 桑基图渲染器（原生 SVG，零依赖）
   用法：LaborSankey.render(svgEl, graph, { height, tip, onHover })
   graph = { nodes:[{id,label,value,layer,color,order,note}], links:[{source,target,value}] } */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var NODE_W = 22, GAP = 14, LABEL_H = 32, LABEL_GAP = 13;
  var state = { svg: null, W: 0, H: 600, graph: null, nodes: [], links: [], byId: new Map(), ky: 1, tip: null, hover: null };
  var uid = 0;

  function el(tag, attrs, kids) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (kids) [].concat(kids).forEach(function (c) {
      if (c == null || c === '') return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmtMoney(n) {
    var v = Math.round(n);
    return '¥' + v.toLocaleString('en-US');
  }
  function textW(s, size) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += /[\u2E80-\uFFFF]/.test(s[i]) ? size : size * 0.56;
    return w;
  }

  function pads(W) {
    return W < 760 ? { L: 108, R: 132, T: 54, B: 30 } : { L: 148, R: 176, T: 58, B: 30 };
  }

  function layout() {
    var W = state.W, H = state.H, nodes = state.nodes, links = state.links, byId = state.byId;
    var P = pads(W);
    var plotW = W - P.L - P.R;
    var plotH = H - P.T - P.B;
    var maxLayer = 0;
    nodes.forEach(function (n) { if (n.layer > maxLayer) maxLayer = n.layer; });
    var step = maxLayer > 0 ? (plotW - NODE_W) / maxLayer : 0;

    var cols = new Map();
    nodes.forEach(function (n) {
      if (!cols.has(n.layer)) cols.set(n.layer, []);
      cols.get(n.layer).push(n);
    });
    cols.forEach(function (arr) {
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    });

    var ky = Infinity;
    cols.forEach(function (arr) {
      var sum = arr.reduce(function (a, n) { return a + n.value; }, 0);
      if (sum > 0) ky = Math.min(ky, (plotH - GAP * (arr.length - 1)) / sum);
    });
    if (!isFinite(ky) || ky <= 0) ky = 1;
    state.ky = ky;

    cols.forEach(function (arr, L) {
      arr.forEach(function (n) { n.x = P.L + L * step; n.h = n.value * ky; });
      var colH = arr.reduce(function (a, n) { return a + n.h; }, 0) + GAP * (arr.length - 1);
      var y = P.T + Math.max(0, (plotH - colH) / 2);
      arr.forEach(function (n) {
        n.y = y; n.cy = y + n.h / 2; n.cx = n.x + NODE_W / 2;
        y += n.h + GAP;
      });
    });

    var outs = new Map(), ins = new Map();
    nodes.forEach(function (n) { outs.set(n.id, []); ins.set(n.id, []); });
    links.forEach(function (l) {
      outs.get(l.source).push(l);
      ins.get(l.target).push(l);
    });
    outs.forEach(function (a) { a.sort(function (p, q) { return byId.get(p.target).cy - byId.get(q.target).cy; }); });
    ins.forEach(function (a) { a.sort(function (p, q) { return byId.get(p.source).cy - byId.get(q.source).cy; }); });
    outs.forEach(function (a, id) {
      var y = byId.get(id).y;
      a.forEach(function (l) { l.y0 = y; y += l.value * ky; });
    });
    ins.forEach(function (a, id) {
      var y = byId.get(id).y;
      a.forEach(function (l) { l.y1 = y; y += l.value * ky; });
    });

    links.forEach(function (l) {
      l.w = Math.max(0.6, l.value * ky);
      l.x0 = byId.get(l.source).x + NODE_W;
      l.x1 = byId.get(l.target).x;
      l.c = byId.get(l.source).color;
    });
  }

  function ribbon(l) {
    var x0 = l.x0, y0 = l.y0, x1 = l.x1, y1 = l.y1, w = l.w;
    var k = Math.max(6, (x1 - x0) * 0.45);
    return 'M' + r2(x0) + ',' + r2(y0) +
      ' C' + r2(x0 + k) + ',' + r2(y0) + ' ' + r2(x1 - k) + ',' + r2(y1) + ' ' + r2(x1) + ',' + r2(y1) +
      ' L' + r2(x1) + ',' + r2(y1 + w) +
      ' C' + r2(x1 - k) + ',' + r2(y1 + w) + ' ' + r2(x0 + k) + ',' + r2(y0 + w) + ' ' + r2(x0) + ',' + r2(y0 + w) + ' Z';
  }

  function placeLabels(arr, h, gap) {
    if (!arr.length) return;
    h = h || LABEL_H; gap = gap == null ? LABEL_GAP : gap;
    arr.sort(function (a, b) { return a.desired - b.desired; });
    var MIN = 8, MAX = state.H - 6 - h;
    var prev = -Infinity;
    arr.forEach(function (it) { it.top = Math.max(it.desired, MIN, prev + gap + h); prev = it.top; });
    var over = arr[arr.length - 1].top - MAX;
    if (over > 0) arr.forEach(function (it) { it.top -= over; });
    prev = -Infinity;
    arr.forEach(function (it) { it.top = Math.max(it.top, MIN, prev + gap + h); prev = it.top; });
  }

  var STYLE = [
    '.lk{fill-opacity:.4;transition:fill-opacity .18s,opacity .18s}',
    '.lk.on{fill-opacity:.8}',
    '.nd rect{stroke:rgba(15,23,42,.10);stroke-width:1}',
    '.nd{cursor:pointer}',
    '.nl,.lk,.nd{transition:opacity .18s}',
    'svg.focusing .nd,svg.focusing .lk,svg.focusing .nl{opacity:.16}',
    'svg.focusing .nd.on,svg.focusing .lk.on,svg.focusing .nl.on{opacity:1}',
    '.lb-name{font:600 12.5px/1 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;fill:#243044}',
    '.lb-val{font:500 11px/1 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;fill:#78859a;font-variant-numeric:tabular-nums}',
    '.lb-name,.lb-val{paint-order:stroke;stroke:#fdfcf9;stroke-width:3.6px;stroke-linejoin:round}',
    '.lb-name.on{fill:#0f2a4a}',
    '.nl.compact .lb-name{font-size:11.5px}',
    '.lead{stroke:#d7dee8;stroke-width:1;fill:none}',
    '.colh{font:600 10.5px/1 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;fill:#98a4b5;letter-spacing:.09em}',
    '.watermark{font:700 11px/1 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;fill:#b6c0cd;letter-spacing:.14em}',
    '.enter .nd,.enter .lk,.enter .nl{animation:sin .5s cubic-bezier(.2,.7,.3,1) both}',
    '@keyframes sin{from{opacity:0}to{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.enter .nd,.enter .lk,.enter .nl{animation:none}}'
  ].join('');

  function render(svg, graph, opts) {
    opts = opts || {};
    state.svg = svg;
    state.graph = graph;
    state.tip = opts.tip || null;
    state.onHover = opts.onHover || null;
    var host = svg.parentNode;
    state.W = Math.max(360, host.clientWidth || 900);
    state.H = opts.height || Math.max(500, Math.min(660, state.W * 0.64));
    svg.setAttribute('viewBox', '0 0 ' + state.W + ' ' + state.H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', state.H);

    state.nodes = graph.nodes.map(function (n) {
      return { id: n.id, label: n.label, value: Math.max(0, n.value), layer: n.layer, color: n.color,
               order: n.order || 0, note: n.note, sub: n.sub, hero: n.hero, hideLabel: n.hideLabel };
    });
    state.byId = new Map(state.nodes.map(function (n) { return [n.id, n]; }));
    state.links = graph.links.filter(function (l) {
      return state.byId.has(l.source) && state.byId.has(l.target) && l.value > 0.01;
    }).map(function (l) { return { source: l.source, target: l.target, value: l.value, note: l.note }; });

    layout();

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('class', 'sankey enter');

    svg.appendChild(el('style', null, [STYLE]));
    svg.appendChild(el('rect', { x: 0, y: 0, width: state.W, height: state.H, fill: '#fdfcf9' }));

    var P = pads(state.W);
    // 列标题（右端贴齐画布内边距，避免被裁）
    var lastLayer = 0;
    state.nodes.forEach(function (n) { if (n.layer > lastLayer) lastLayer = n.layer; });
    var stepH = lastLayer > 0 ? (state.W - P.L - P.R - NODE_W) / lastLayer : 0;
    (opts.columns || ['收入来源', '税前应发', '扣缴', '去向']).forEach(function (name, L) {
      if (L > lastLayer) return;
      var anchor = L === 0 ? 'start' : (L === lastLayer ? 'end' : 'middle');
      var x = L === 0 ? P.L : (L === lastLayer ? state.W - 16 : P.L + L * stepH + NODE_W / 2);
      svg.appendChild(el('text', { class: 'colh', x: r2(x), y: 26, 'text-anchor': anchor }, [name]));
    });
    svg.appendChild(el('line', { x1: P.L, y1: 38, x2: state.W - 16, y2: 38, stroke: '#e6e2d9', 'stroke-width': 1 }));

    var gLinks = el('g'), gNodes = el('g'), gLabels = el('g');
    svg.appendChild(gLinks); svg.appendChild(gNodes); svg.appendChild(gLabels);

    // 流带
    state.links.forEach(function (l, i) {
      var p = el('path', { class: 'lk', d: ribbon(l), fill: l.c, 'data-kind': 'link', 'data-id': String(i) });
      gLinks.appendChild(p);
      l.el = p;
    });

    // 节点
    state.nodes.forEach(function (n) {
      var rect = el('rect', { x: r2(n.x), y: r2(n.y), width: NODE_W, height: Math.max(2.5, r2(n.h)), rx: 2.5, fill: n.color });
      var g = el('g', { class: 'nd', 'data-kind': 'node', 'data-id': n.id }, [rect]);
      if (n.hero) g.appendChild(el('rect', { x: r2(n.x - 4), y: r2(n.y - 4), width: NODE_W + 8, height: Math.max(2.5, r2(n.h)) + 8,
        rx: 5, fill: 'none', stroke: '#16a34a', 'stroke-width': 1.2, 'stroke-opacity': .38 }));
      gNodes.appendChild(g);
      n.g = g;
    });

    // 标签：首列左、末列右、单节点中间列放上方、多节点中间列放右侧
    var maxLayer = 0;
    state.nodes.forEach(function (n) { if (n.layer > maxLayer) maxLayer = n.layer; });
    var colSum = {}, colCount = {};
    state.nodes.forEach(function (n) {
      colSum[n.layer] = (colSum[n.layer] || 0) + n.value;
      colCount[n.layer] = (colCount[n.layer] || 0) + 1;
    });

    var labels = state.nodes.filter(function (n) {
      if (n.hideLabel || n.h < 5) return false;                       // 太薄的节点只留 tooltip
      if (colSum[n.layer] > 0 && n.value / colSum[n.layer] < 0.006) return false;
      return true;
    }).map(function (n) {
      var side = n.layer === 0 ? 'left'
        : (n.layer === maxLayer ? 'right'
          : (colCount[n.layer] === 1 ? 'top' : (String(n.id).charAt(0) === 'e' ? 'midL' : 'midR')));
      return { n: n, side: side, desired: (side === 'top' ? n.y - LABEL_H - 8 : n.cy - LABEL_H / 2), top: 0 };
    });
    var groups = new Map();
    labels.forEach(function (L) { if (!groups.has(L.side)) groups.set(L.side, []); groups.get(L.side).push(L); });
    var avail = state.H - 16;
    groups.forEach(function (arr) {
      var compact = arr.length * (LABEL_GAP + LABEL_H) > avail;
      arr.forEach(function (it) { it.compact = compact; it.h = compact ? 18 : LABEL_H; });
      placeLabels(arr, compact ? 18 : LABEL_H, compact ? 4 : LABEL_GAP);
    });

    labels.forEach(function (L) {
      var n = L.n, mid = L.top + L.h / 2;
      var anchor = (L.side === 'left' || L.side === 'midL') ? 'end' : (L.side === 'top' ? 'middle' : 'start');
      var x = (L.side === 'left') ? n.x - 11
        : (L.side === 'midL') ? n.x - 12
          : (L.side === 'right') ? n.x + NODE_W + 11
            : (L.side === 'midR') ? n.x + NODE_W + 13 : n.cx;
      var kids = [];
      if (L.side === 'left' && Math.abs(mid - n.cy) > 8) {
        kids.push(el('path', { class: 'lead', d: 'M' + r2(n.x) + ',' + r2(n.cy) + ' L' + r2(n.x - 9) + ',' + r2(mid) }));
      } else if (L.side === 'right' && Math.abs(mid - n.cy) > 8) {
        kids.push(el('path', { class: 'lead', d: 'M' + r2(n.x + NODE_W) + ',' + r2(n.cy) + ' L' + r2(n.x + NODE_W + 9) + ',' + r2(mid) }));
      } else if (L.side === 'midL' && Math.abs(mid - n.cy) > 8) {
        kids.push(el('path', { class: 'lead', d: 'M' + r2(n.x - 2) + ',' + r2(n.cy) + ' L' + r2(x + 5) + ',' + r2(mid) }));
      } else if (L.side === 'midR' && Math.abs(mid - n.cy) > 8) {
        kids.push(el('path', { class: 'lead', d: 'M' + r2(n.x + NODE_W + 2) + ',' + r2(n.cy) + ' L' + r2(x - 5) + ',' + r2(mid) }));
      } else if (L.side === 'top' && n.y - (L.top + L.h) > 8) {
        kids.push(el('path', { class: 'lead', d: 'M' + r2(n.cx) + ',' + r2(n.y) + ' L' + r2(n.cx) + ',' + r2(L.top + L.h) }));
      }
      kids.push(el('text', { class: 'lb-name' + (n.hero ? ' on' : ''), x: r2(x), y: r2(L.top + (L.compact ? 13 : 12)), 'text-anchor': anchor }, [n.label]));
      if (!L.compact) kids.push(el('text', { class: 'lb-val', x: r2(x), y: r2(L.top + 26), 'text-anchor': anchor }, [fmtMoney(n.value)]));
      var g = el('g', { class: 'nl' + (L.compact ? ' compact' : ''), 'data-kind': 'node', 'data-id': n.id }, kids);
      gLabels.appendChild(g);
      n.labelEl = g;
    });

    svg.appendChild(el('text', { class: 'watermark', x: P.L, y: state.H - 6 }, ['单位：元 / 月 · 占比按列内合计']));

    bind();
  }

  /* ---------- 交互 ---------- */
  function bind() {
    var svg = state.svg;
    if (!svg) return;
    svg.onmouseover = function (e) {
      var t = e.target.closest('[data-kind]');
      if (!t) return;
      var kind = t.getAttribute('data-kind'), id = t.getAttribute('data-id');
      focus(kind, id);
      if (state.tip) state.tip(kind, id, e);
    };
    svg.onmousemove = function (e) { if (state.tip) state.tip.move && state.tip.move(e); };
    svg.onmouseout = function (e) {
      if (e.relatedTarget && svg.contains(e.relatedTarget)) return;
      blur();
      if (state.tip) state.tip.hide && state.tip.hide();
    };
    svg.onclick = function (e) {
      var t = e.target.closest('[data-kind]');
      if (t && state.tip && state.tip.click) state.tip.click(t.getAttribute('data-kind'), t.getAttribute('data-id'));
    };
  }

  function focus(kind, id) {
    var svg = state.svg;
    svg.classList.add('focusing');
    var keepNodes = new Set(), keepLinks = new Set();
    if (kind === 'node') {
      keepNodes.add(id);
      state.links.forEach(function (l, i) {
        if (l.source === id) { keepLinks.add(i); keepNodes.add(l.target); }
        if (l.target === id) { keepLinks.add(i); keepNodes.add(l.source); }
      });
    } else {
      var l = state.links[+id];
      if (!l) return;
      keepLinks.add(+id); keepNodes.add(l.source); keepNodes.add(l.target);
      state.links.forEach(function (m, i) {
        if (m.source === l.source && m.target === l.target) keepLinks.add(i);
      });
    }
    state.nodes.forEach(function (n) {
      var on = keepNodes.has(n.id);
      n.g.classList.toggle('on', on);
      if (n.labelEl) n.labelEl.classList.toggle('on', on);
    });
    state.links.forEach(function (m, i) { m.el.classList.toggle('on', keepLinks.has(i)); });
  }
  function blur() {
    var svg = state.svg;
    if (!svg) return;
    svg.classList.remove('focusing');
    state.nodes.forEach(function (n) { n.g.classList.remove('on'); if (n.labelEl) n.labelEl.classList.remove('on'); });
    state.links.forEach(function (m) { m.el.classList.remove('on'); });
  }

  /* ---------- 导出 ---------- */
  function svgString() {
    var svg = state.svg.cloneNode(true);
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('width', state.W);
    svg.setAttribute('height', state.H);
    svg.classList.remove('focusing');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function exportSVG(name) {
    download(name || 'labor-income.svg', new Blob([svgString()], { type: 'image/svg+xml;charset=utf-8' }));
  }
  function exportPNG(name, scale) {
    scale = scale || 2;
    var str = svgString();
    var img = new Image();
    var blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = state.W * scale; c.height = state.H * scale;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fdfcf9'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { download(name || 'labor-income.png', b); }, 'image/png');
    };
    img.src = url;
  }

  root.LaborSankey = {
    render: render, exportSVG: exportSVG, exportPNG: exportPNG,
    focus: focus, blur: blur, fmt: fmtMoney, state: state
  };
})(window);
