/* app.js — 渲染管线（fork 自 profitbridge/app.js，删掉公司/季度/币种/语言层，只留桑基渲染 + 导出）
   数据层：app/data.js；计算层：app/engine.js；桥接层：ui/labor.js */
(function () {
  'use strict';

  var D = window.LABOR_DATA;
  var E = window.LaborEngine;
  var B = window.LaborBridge;
  var money = B.money;

  var state = { caseId: 'bigtech', city: 'sh', gross: null, employer: false };
  var chart = null;
  var byId = {};
  var lastGraph = null;
  var pctMode = false;
  try { pctMode = localStorage.getItem('labor.pct') === '1'; } catch (e) {}
  var PAD = { left: 152, right: 176, top: 46, bottom: 26 };

  /* 左侧格子的 2–3 字标签（原项目这里是公司 logo，改成案例） */
  var SHORT = {
    'gov-civil': '公务员', 'gov-teacher': '教师', 'gov-doctor': '医生', 'gov-army': '文职', 'gov-social': '社工',
    'soe-regular': '国企', 'soe-dispatch': '国企派',
    'private-regular': '民企', 'sales': '销售', 'factory': '计件工', 'parttime-hourly': '小时工',
    'dispatch': '派遣', 'outsource-onsite': '驻场', 'outsource-biz': '个体户', 'gig-platform': '平台',
    'bigtech': '大厂', 'finance': '金融', 'foreign': '外企', 'lawfirm': '律所',
    'freelance': '自由', 'rider': '骑手', 'driver': '司机', 'streamer': '主播', 'nanny': '家政',
    'daylabor': '日结', 'construction': '建筑工', 'retired': '返聘', 'intern': '实习', 'sidegig': '副业', 'remote': '远程'
  };

  var GROUP_TINT = {
    gov: { bg: '#e8eefa', fg: '#1d55a5' },
    soe: { bg: '#e6f4f1', fg: '#0f766e' },
    private: { bg: '#fdeee5', fg: '#c2410c' },
    dispatch: { bg: '#f0eafd', fg: '#7c3aed' },
    bigtech: { bg: '#fbeaea', fg: '#b91c1c' },
    platform: { bg: '#e8f5ea', fg: '#15803d' },
    nonstd: { bg: '#faf1e0', fg: '#a16207' }
  };

  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  D.cases.forEach(function (c) { byId[c.id] = c; });
  function current() { return byId[state.caseId] || D.cases[0]; }
  function compute() {
    var c = current();
    return E.compute(c, { gross: state.gross, city: state.city });
  }

  /* ---------- 左栏：案例格子 ---------- */
  function renderRail() {
    var rail = q('#logoRail');
    rail.innerHTML = D.cases.map(function (c) {
      var t = GROUP_TINT[c.group] || GROUP_TINT.private;
      var label = SHORT[c.id] || c.name.slice(0, 3);
      var on = c.id === state.caseId ? ' active' : '';
      return '<div class="logo caseMon' + on + '" data-id="' + c.id + '" title="' + c.name + '"' +
        ' style="background:' + t.bg + ';color:' + t.fg + '">' + label + '</div>';
    }).join('');
  }

  function paintRail() {
    qa('#logoRail .logo').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === state.caseId);
    });
  }

  /* ---------- 底部：月收入滑杆 ---------- */
  function rangeOf(c) {
    return {
      min: Math.max(1000, Math.round(c.lo * 0.55 / 100) * 100),
      max: Math.max(Math.round(c.hi * 1.7 / 100) * 100, Math.round(c.lo * 0.55 / 100) * 100 + 1000)
    };
  }

  function renderTimeline() {
    var c = current(), rg = rangeOf(c), v = clamp(state.gross, rg.min, rg.max);
    var p = (v - rg.min) / (rg.max - rg.min) * 100;
    q('#tlFill').style.width = p + '%';
    q('#tlThumb').style.left = p + '%';
    q('#tlNow').textContent = money(v);
    var cp = Math.max(9, Math.min(91, p));
    q('#tlTicks').innerHTML =
      '<div class="tl-tick" data-v="' + rg.min + '"><div class="q">' + money(rg.min) + '</div><div class="d">下限</div></div>' +
      '<div class="tl-tick active" data-v="' + v + '" style="position:absolute;left:' + cp + '%;transform:translateX(-50%)">' +
        '<div class="q">' + money(v) + '</div><div class="d">当前</div></div>' +
      '<div class="tl-tick" data-v="' + rg.max + '" style="margin-left:auto"><div class="q">' + money(rg.max) + '</div><div class="d">上限</div></div>';
  }

  function bindSlider() {
    var track = q('#tlTrack');
    function setFromEvent(ev) {
      var c = current(), rg = rangeOf(c);
      var r = track.getBoundingClientRect();
      var ratio = clamp((ev.clientX - r.left) / r.width, 0, 1);
      var step = rg.max - rg.min > 20000 ? 500 : 100;
      var v = Math.round((rg.min + ratio * (rg.max - rg.min)) / step) * step;
      state.gross = clamp(v, rg.min, rg.max);
      renderChart();
    }
    track.addEventListener('pointerdown', function (ev) {
      track.setPointerCapture(ev.pointerId);
      setFromEvent(ev);
      track.dataset.drag = '1';
    });
    track.addEventListener('pointermove', function (ev) {
      if (track.dataset.drag === '1') setFromEvent(ev);
    });
    track.addEventListener('pointerup', function (ev) {
      track.dataset.drag = '';
      try { track.releasePointerCapture(ev.pointerId); } catch (e) {}
    });
    q('#tlTicks').addEventListener('click', function (ev) {
      var t = ev.target.closest('.tl-tick');
      if (!t) return;
      state.gross = +t.dataset.v;
      renderChart();
    });
  }

  /* ---------- 桑基图 ---------- */
  function nodeOf(name) { return (chart && chart.__nodes ? chart.__nodes[name] : null); }

  function labelOf(names) {
    var m = chart.__labels || {};
    return m[names] || names;
  }

  function optionOf(g) {
    var labels = {};
    g.nodes.forEach(function (n) { labels[n.name] = n.labelText; });
    chart.__labels = labels;

    var data = g.nodes.map(function (n) {
      var pos = n.pos === 'left' ? 'left' : n.pos === 'right' ? 'right' : 'top';
      return {
        name: n.name,
        value: n.value,
        depth: n.depth,
        itemStyle: n.itemStyle,
        label: {
          position: pos,
          distance: 9,
          formatter: '{n|' + n.labelText + '}\n{v|' + money(n.value) + '}'
        }
      };
    });

    return {
      animationDuration: 420,
      animationDurationUpdate: 320,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(255,255,255,.97)',
        borderColor: '#dbe3ef',
        borderWidth: 1,
        padding: [8, 11],
        textStyle: { color: '#1e293b', fontSize: 12.5 },
        extraCssText: 'box-shadow:0 6px 20px rgba(30,41,59,.14);border-radius:8px;',
        formatter: function (p) {
          if (p.dataType === 'edge') {
            var nb = nodeOf(p.data.target);
          return labelOf(p.data.source) + ' → ' + labelOf(p.data.target) +
              '<br/><b style="font-size:14px">' + money(p.data.value) + '</b>' +
              (nb ? '<span style="color:#94a3b8"> · ' + (p.data.value / nb.value * nb.pct).toFixed(1) + '%</span>' : '');
          }
          var n = nodeOf(p.data.name) || {};
          return '<b>' + labelOf(p.data.name) + '</b><br/><b style="font-size:14px">' + money(p.value) + '</b>' +
            (n.pct != null ? '<span style="color:#94a3b8"> · ' + n.pct.toFixed(1) + '%</span>' : '');
        }
      },
      series: [{
        type: 'sankey',
        layout: 'none',
        nodeAlign: 'justify',
        nodeWidth: 26,
        nodeGap: 22,
        left: PAD.left,
        right: PAD.right,
        top: PAD.top,
        bottom: PAD.bottom,
        draggable: false,
        nodeSort: null,
        data: data,
        links: g.links,
        label: { show: false },
        lineStyle: { color: 'source', opacity: 0.55, curveness: 0.5 },
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.9 } }
      }]
    };
  }

  function renderChart() {
    var c = current();
    var r = compute();
    var g = B.build(c, r, state.employer);

    q('#chartTitle').textContent = c.name;
    q('#metaLine').textContent = g.meta;
    renderTimeline();

    chart.__nodes = {};
    g.nodes.forEach(function (n) { chart.__nodes[n.name] = n; });
    chart.setOption(optionOf(g), true);
    lastGraph = g;
    drawLabels(g);
    document.title = c.name + ' · 劳动收入组成';
  }


  /* ---------- 标签层：ECharts 的 sankey 标签不做避让，这里自己排 ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function geomMap() {
    var m = {};
    try {
      var gp = chart.getModel().getSeriesByIndex(0).getGraph();
      gp.nodes.forEach(function (n) {
        var l = n.getLayout && n.getLayout();
        if (l) m[n.id] = l;
      });
    } catch (e) {}
    return m;
  }

  function spread(items, LH, minY, maxY) {
    items.forEach(function (it) { it.y = it.cy; });
    var last = -1e9, i;
    for (i = 0; i < items.length; i++) {
      if (items[i].y < last + LH) items[i].y = last + LH;
      last = items[i].y;
    }
    var over = last - maxY;
    if (over > 0) for (i = 0; i < items.length; i++) items[i].y -= over;
    if (items.length && items[0].y < minY) {
      var d = minY - items[0].y;
      for (i = 0; i < items.length; i++) items[i].y += d;
    }
  }

  function block(it, x, y, anchor) {
    var second = pctMode ? (it.pctLine || money(it.value)) : money(it.value);
    return '<text class="lb" x="' + x + '" y="' + (y - 2) + '" text-anchor="' + anchor + '">' +
      '<tspan x="' + x + '">' + esc(it.text) + '</tspan>' +
      '<tspan class="lbv" x="' + x + '" dy="15">' + second + '</tspan></text>';
  }
  function leader(x0, y0, x1, y1) {
    return '<path class="ld" d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '"/>';
  }

  function drawLabels(g) {
    var host = q('#sankey');
    if (!host) return;
    var W = host.clientWidth, H = host.clientHeight;
    var ovl = host.querySelector('svg.ovl');
    if (!ovl) {
      ovl = document.createElementNS(NS, 'svg');
      ovl.setAttribute('class', 'ovl');
      host.appendChild(ovl);
    }
    ovl.setAttribute('width', W);
    ovl.setAttribute('height', H);
    ovl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var geo = geomMap();
    var cols = {}, maxDepth = 0;
    g.nodes.forEach(function (n) {
      var l = geo[n.name];
      if (!l) return;
      var d = l.depth;
      maxDepth = Math.max(maxDepth, d);
      (cols[d] = cols[d] || []).push({
        id: n.name, text: n.labelText, value: n.value, pct: n.pct || 0, pctLine: n.pctLine,
        x: PAD.left + l.x, dx: l.dx,
        top: PAD.top + l.y, cy: PAD.top + l.y + l.dy / 2
      });
    });

    var out = [];
    Object.keys(cols).forEach(function (k) {
      var depth = +k, items = cols[k];
      items.sort(function (a, b) { return a.cy - b.cy; });
      if (depth === 0 || depth === maxDepth) {
        var side = depth === 0 ? -1 : 1;
        var anchor = depth === 0 ? 'end' : 'start';
        spread(items, 38, PAD.top + 6, H - PAD.bottom);
        items.forEach(function (it) {
          var ax = it.x + side * (depth === 0 ? -12 : it.dx + 12);
          out.push(block(it, ax, it.y, anchor));
          if (Math.abs(it.y - it.cy) > 10) {
            out.push(leader(it.x + (depth === 0 ? 0 : it.dx), it.cy, ax + side * -1 * 4, it.y));
          }
        });
      } else {
        items.forEach(function (it) { it.y = it.top - 21; });
        spread(items, 38, PAD.top + 6, H - PAD.bottom);
        items.forEach(function (it) {
          var cx = it.x + it.dx / 2;
          out.push(block(it, cx, it.y, 'middle'));
          if (Math.abs(it.y - (it.top - 21)) > 10) out.push(leader(cx, it.y + 12, cx, it.top - 4));
        });
      }
    });
    ovl.innerHTML = out.join('');
  }

  /* ---------- 顶栏控件 ---------- */
  function bindControls() {
    var sel = q('#citySelect');
    sel.innerHTML = Object.keys(D.cities).map(function (k) {
      return '<option value="' + k + '">' + D.cities[k].name + '</option>';
    }).join('');
    sel.value = state.city;
    sel.addEventListener('change', function () {
      state.city = sel.value;
      renderChart();
    });

    /* 事件委托：只绑一次，列表重建也不会丢 */
    q('#logoRail').addEventListener('click', function (ev) {
      var cell = ev.target.closest('.logo');
      if (!cell) return;
      selectCase(cell.dataset.id);
    });

    var person = q('#btnViewPerson'), cost = q('#btnViewCost');
    person.addEventListener('click', function () {
      state.employer = false;
      person.classList.add('active'); cost.classList.remove('active');
      renderChart();
    });
    cost.addEventListener('click', function () {
      state.employer = true;
      cost.classList.add('active'); person.classList.remove('active');
      renderChart();
    });

    q('#btnPct').addEventListener('click', function () { applyPct(!pctMode); });
    q('#btnExportPNG').addEventListener('click', exportPNG);
    q('#btnExportSVG').addEventListener('click', exportSVG);
    q('#btnNote').addEventListener('click', showNote);
  }

  function applyPct(on) {
    pctMode = !!on;
    var btn = q('#btnPct');
    if (btn) btn.classList.toggle('active', pctMode);
    try { localStorage.setItem('labor.pct', pctMode ? '1' : '0'); } catch (e) {}
    if (lastGraph) drawLabels(lastGraph);
  }

  function selectCase(id) {
    if (!byId[id]) return;
    state.caseId = id;
    state.gross = byId[id].gross;
    paintRail();
    var cell = q('#logoRail .logo.active');
    if (cell && cell.scrollIntoView) cell.scrollIntoView({ block: 'nearest' });
    renderChart();
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }

  /* ---------- 导出 ---------- */
  function exportOption(c, g, w, h) {
    var o = optionOf(g);
    o.animation = false;
    o.backgroundColor = '#f2efe9';
    o.series[0].top = 84;
    o.series[0].bottom = 30;
    o.graphic = [
      { type: 'text', left: 26, top: 20, style: { text: '劳动收入组成 · ' + c.name, font: '700 19px "Microsoft YaHei",sans-serif', fill: '#1d55a5' } },
      { type: 'text', left: 26, top: 50, style: { text: g.meta, font: '12px "Microsoft YaHei",sans-serif', fill: '#64748b' } },
      { type: 'text', right: 26, top: 22, style: { text: D.meta.year + ' · 近似建模', font: '12px "Microsoft YaHei",sans-serif', fill: '#94a3b8' } }
    ];
    return o;
  }

  function withOffscreen(renderer, cb) {
    var host = document.createElement('div');
    var w = q('#sankey').clientWidth || 1200;
    var h = (q('#sankey').clientHeight || 620) + 60;
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + w + 'px;height:' + h + 'px;';
    document.body.appendChild(host);
    var inst = echarts.init(host, null, { renderer: renderer, width: w, height: h });
    var c = current();
    inst.setOption(exportOption(c, B.build(c, compute(), state.employer), w, h), true);
    var out;
    try { out = cb(inst, w, h, c); } finally {
      setTimeout(function () {
        try { inst.dispose(); } catch (e) {}
        host.remove();
      }, 60);
    }
    return out;
  }

  function download(name, dataUrl) {
    var a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportPNG() {
    withOffscreen('canvas', function (inst, w, h, c) {
      var url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#f2efe9' });
      download('labor-income-' + c.id + '.png', url);
    });
  }

  function exportSVG() {
    withOffscreen('svg', function (inst, w, h, c) {
      var host = inst.getDom().querySelector('svg');
      var clone = host.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      var src = new XMLSerializer().serializeToString(clone);
      var head = '<?xml version="1.0" encoding="UTF-8"?>\n';
      download('labor-income-' + c.id + '.svg',
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(head + src));
    });
  }

  /* ---------- 数据口径 ---------- */
  function showNote() {
    var c = current();
    var rows = D.meta.sources.map(function (s) {
      return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a></li>';
    }).join('');
    var html = '<h3>' + c.name + ' 的口径</h3>' +
      '<p class="p">' + (c.note || '') + '</p>' +
      (c.caveat ? '<p class="p warn"><b>注意：</b>' + c.caveat + '</p>' : '') +
      '<p class="p">社保按 ' + D.meta.year + ' 各市基数上下限与费率；个税按 ' + D.meta.taxYear + ' 综合所得年度税率表计算后折月；公积金属个人资产，单独成流；单位缴纳只在「单位成本」视角出现。</p>' +
      '<p class="p">参考来源：</p><ul class="src">' + rows + '</ul>' +
      '<p class="p dim">仅供理解结构，不构成法律或税务意见。</p>';
    var mask = document.createElement('div');
    mask.className = 'noteMask';
    mask.innerHTML = '<div class="noteBox"><button class="noteX" aria-label="关闭">×</button>' + html + '</div>' +
      '<style>.noteMask{position:fixed;inset:0;background:rgba(15,23,42,.32);display:flex;align-items:center;justify-content:center;z-index:99}' +
      '.noteBox{background:#fff;max-width:620px;max-height:78vh;overflow:auto;border-radius:14px;padding:22px 26px;font-size:13px;line-height:1.62;color:#334155;box-shadow:0 20px 60px rgba(15,23,42,.25)}' +
      '.noteBox h3{font-size:16px;color:#1d55a5;margin-bottom:8px}.noteBox .p{margin:8px 0}.noteBox .warn{color:#b45309;background:#fef6e7;border-radius:8px;padding:8px 10px}' +
      '.noteBox .dim{color:#94a3b8;font-size:12px}.noteBox ul{margin:6px 0 6px 18px}.noteBox .src a{color:#2563eb;text-decoration:none}' +
      '.noteX{position:absolute;top:12px;right:16px;border:none;background:none;font-size:22px;color:#94a3b8;cursor:pointer}</style>';
    mask.addEventListener('click', function (ev) {
      if (ev.target === mask || ev.target.classList.contains('noteX')) mask.remove();
    });
    document.body.appendChild(mask);
  }

  /* ---------- 启动 ---------- */
  function init() {
    chart = echarts.init(q('#sankey'), null, { renderer: 'svg' });
    var hash = (location.hash || '').replace('#', '');
    if (byId[hash]) state.caseId = hash;
    state.gross = byId[state.caseId].gross;
    renderRail();
    bindControls();
    bindSlider();
    renderChart();
    applyPct(pctMode);
    window.addEventListener('resize', function () {
      chart.resize();
      if (lastGraph) drawLabels(lastGraph);
    });
    window.LaborApp = {
      selectCase: selectCase,
      recompute: renderChart,
      setEmployer: function (v) {
        state.employer = !!v;
        q('#btnViewCost').classList.toggle('active', state.employer);
        q('#btnViewPerson').classList.toggle('active', !state.employer);
        renderChart();
      },
      state: state,
      chart: chart
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
