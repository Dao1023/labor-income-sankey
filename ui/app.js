/* app.js — 劳动收入组成桑基图
   ------------------------------------------------------------------
   本文件由上游 profitbridge/ui/app.js（2319 行，ECharts 5.5.1）改造而来：
   「公司 / 季度 / 分部 / 币种 / 语言 / 行业 / bar 视图」那一层整块删除，
   数据来源换成 ui/labor.js（LaborBridge）+ app/engine.js（LaborEngine）。

   完全原样保留、一个字没改的上游实现（详见 research/rebuild-notes.md）：
     sankeyPads() / sankeyBaseHeight() / checkConsistency() 的判据骨架 /
     导出管线（exportOption / _svgEsc / svgWithHeader / exportPNG / exportSVG）/
     renderSnapDots() / markNearDot() / initTimelineDrag() 的指针骨架 /
     renderTimeline() 的刻度绘制 / 委托点击 / fill+thumb 定位 /
     renderChart() 的 ECharts 参数（nodeWidth 30 / nodeGap 22 / 标签字阶 /
     白描边 2.5 / emphasis.focus:'adjacency' / setOption(...,true)）。
   仅两处按本主题需要改写：initTimelineDrag 去掉 setPointerCapture（CDP 下会
   stall，改为 window 级 pointermove + dragging 标志），buildGraph 的函数体
   改为调用 LaborBridge.build()。 */
'use strict';

/* ------------------------------------------------------------------ *
 * 文案（上游 I18N 只留中文，删掉语言切换）
 * ------------------------------------------------------------------ */
const I18N = {
  zh: {
    appTitle: '劳动收入组成',
    viewBridge: '个人视角',
    viewCost: '单位成本视角',
    pctBtn: '占比',
    exportPNG: '导出 PNG',
    exportSVG: '导出 SVG',
    ofGross: '占应发',
    ofCost: '占成本',
    ofRev: '占流水',
    noteBtn: '口径说明',
    source: '数据来源'
  }
};
const t = k => I18N.zh[k] || k;

/* ------------------------------------------------------------------ *
 * 数据与状态
 * ------------------------------------------------------------------ */
const LABOR = window.LABOR_DATA;
const engine = window.LaborEngine;
const bridge = window.LaborBridge;
if (!LABOR || !engine || !bridge) throw new Error('data.js / engine.js / labor.js 未加载');

let chart = null;      // echarts instance
let lastFocus = null;  // dialog focus return

const STEP_N = 20;     // 薪资滑杆的档位数（21 个落点）

const state = {
  caseId: 'bigtech',
  city: 'sh',
  gross: 40000,
  view: 'bridge',      // 'bridge' = 个人视角 | 'cost' = 单位成本视角
  mode: { pct: false }
};

const money = v => bridge.money(v);
const fmtPct = v => (v * 100).toFixed(1) + '%';
const fmtPct1 = v => v.toFixed(1) + '%';

/* ------------------------------------------------------------------ *
 * 案例 / 城市 / 薪资档位
 * ------------------------------------------------------------------ */
function cases() { return bridge.cases(); }
function cityList() { return bridge.cityList(); }
function curCase() {
  const list = cases();
  return list.find(c => c.id === state.caseId) || list[0];
}
function curCity() {
  return LABOR.cities[state.city] || cityList()[0];
}

/* 当前案例的薪资档位数组：lo → hi 等分 20 档，取整到 10 元 */
function stepsOf() {
  const c = curCase();
  const lo = c.lo, hi = c.hi, n = STEP_N, out = [];
  if (!(hi > lo)) return [lo];
  for (let i = 0; i <= n; i++) {
    let v = Math.round((lo + (hi - lo) * i / n) / 10) * 10;
    v = Math.max(lo, Math.min(hi, v));
    if (!out.length || v > out[out.length - 1]) out.push(v);
  }
  return out;
}
function nearestIndex(v) {
  const s = stepsOf();
  let bi = 0, bd = Infinity;
  for (let i = 0; i < s.length; i++) {
    const d = Math.abs(s[i] - v);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function curIndex() { return nearestIndex(state.gross); }
function snapGross(v) {
  const s = stepsOf();
  return s[nearestIndex(v)];
}

/* ------------------------------------------------------------------ *
 * 计算：LaborEngine.compute(case, { city, gross })
 * ------------------------------------------------------------------ */
function computeNow() {
  const c = curCase();
  const r = engine.compute(c, { city: state.city, gross: state.gross });
  return { c: c, r: r, meta: bridge.metaOf(c, r), formula: bridge.formulaOf(c, r) };
}
function pctBaseOf(r) {
  return state.view === 'cost' ? r.cost : (r.agPay === 'worker' ? r.revenue : r.gross);
}
function pctWordOf(r) {
  return state.view === 'cost' ? t('ofCost') : (r.agPay === 'worker' ? t('ofRev') : t('ofGross'));
}

/* ------------------------------------------------------------------ *
 * 图构建：上游 buildGraph(qv, segList) 的函数体换成 LaborBridge.build()
 * ------------------------------------------------------------------ */
function buildGraph(bundle, employerView) {
  return bridge.build(bundle.c, bundle.r, employerView);
}

/* 节点名带前缀（inc0: / d: / t: / u:），显示时剥掉 */
const displayName = n => String(n.name).replace(/^[a-z0-9]+:/i, '');
const labelName = n => displayName(n);

/* 金额文案：元/月，千分位 */
const amtText = v => Math.round(Math.abs(v)).toLocaleString('en-US');
const dispSym = () => '¥';

/* 节点 id → 中文标签（调试元数据 / tooltip 用） */
const labelOfGraph = (g, id) => {
  const n = g.nodes.find(x => x.name === id);
  return (n && n.labelText) || displayName({ name: id });
};

/* ------------------------------------------------------------------ *
 * 一致性校验（上游 checkConsistency 的结构，判据换成本主题的闭合关系）
 * ------------------------------------------------------------------ */
function checkConsistency(bundle, g) {
  const r = bundle.r;
  const inMap = Object.create(null);
  const outMap = Object.create(null);
  g.nodes.forEach(n => { inMap[n.name] = 0; outMap[n.name] = 0; });
  g.links.forEach(l => { inMap[l.target] += l.value; outMap[l.source] += l.value; });

  const out = {
    caseId: r.caseId, city: r.city.id, gross: +r.gross.toFixed(2),
    view: state.view, inputSum: null, gross: r.gross, ok: null, errors: []
  };
  g.nodes.forEach(n => {
    const i = inMap[n.name], o = outMap[n.name];
    if (i > 0.004 && Math.abs(i - n.value) > 0.05) out.errors.push(n.labelText + ' 流入 ' + i.toFixed(2) + ' ≠ ' + n.value.toFixed(2));
    if (o > 0.004 && Math.abs(o - n.value) > 0.05) out.errors.push(n.labelText + ' 流出 ' + o.toFixed(2) + ' ≠ ' + n.value.toFixed(2));
  });
  const gn = g.nodes.find(n => n.name === 'gross');
  out.inputSum = gn ? +inMap['gross'].toFixed(2) : null;
  out.ok = out.errors.length === 0 && !!gn && Math.abs(gn.value - r.gross) < 0.05;
  if (!out.ok) console.warn('[labor] 桑基图不闭合：', out);
  return out;
}

/* ------------------------------------------------------------------ *
 * 布局：上游 sankeyPads() 原样保留
 * ------------------------------------------------------------------ */
function sankeyPads(hasAgg) {
  const host = document.getElementById('sankey');
  const w = (host && host.clientWidth) || 1072;
  const base = Math.round(Math.max(60, Math.min(170, w * 0.22)));
  const left = hasAgg ? Math.min(210, base + 40) : base;
  return { w: w, base: base, left: left, right: base, compact: base < 170 };
}

/* ------------------------------------------------------------------ *
 * 渲染桑基图（上游 renderChart 的结构与全部 ECharts 参数）
 * ------------------------------------------------------------------ */
function chartTitleOf(bundle) {
  const suffix = state.view === 'cost' ? '（单位成本）' : '';
  return bundle.c.name + ' · ' + t('appTitle') + suffix;
}

function renderChart() {
  const bundle = computeNow();
  window.__bundle = bundle;
  const g = buildGraph(bundle, state.view === 'cost');
  renderLegend(g);
  window.__bridgeCheck = checkConsistency(bundle, g);
  window.__sankeyMeta = {
    caseId: state.caseId,
    city: state.city,
    gross: state.gross,
    view: state.view,
    pct: state.mode.pct,
    nodes: g.nodes.map(n => ({ id: n.name, name: n.labelText || displayName(n), value: +n.value.toFixed(4), depth: n.depth })),
    links: g.links.map(l => ({ source: labelOfGraph(g, l.source), target: labelOfGraph(g, l.target), value: +l.value.toFixed(4) }))
  };
  document.getElementById('chartTitle').textContent = chartTitleOf(bundle);

  const pads = sankeyPads(false);
  const compactLabel = pads.compact;
  const pctBase = pctBaseOf(bundle.r);
  const pctWord = pctWordOf(bundle.r);

  /* 标签字阶：16/700 + 14/600，白描边 2.5（窄屏 13/11.5） */
  const labelRich = {
    n: { fontSize: compactLabel ? 13 : 16, fontWeight: 700, color: '#1e293b', lineHeight: compactLabel ? 17 : 21, textBorderColor: '#fff', textBorderWidth: 2.5 },
    v: { fontSize: compactLabel ? 11.5 : 14, fontWeight: 600, color: '#52607a', lineHeight: compactLabel ? 15 : 18, textBorderColor: '#fff', textBorderWidth: 2.5 },
    p: { fontSize: compactLabel ? 11.5 : 14, fontWeight: 700, color: '#2563eb', lineHeight: compactLabel ? 15 : 18, textBorderColor: '#fff', textBorderWidth: 2.5 }
  };

  /* 两行标签：名称 / （占比 ·）金额。占比是叠加，不是切换。 */
  /* 单行标签：小节点只写名字，金额与占比留给 tooltip */
  function shortNodeLabel(p) {
    return '{n|' + ((p.data && p.data.labelText) || labelName(p)) + '}';
  }

  function nodeLabel(p) {
    const amt = dispSym() + amtText(p.value);
    const nm = (p.data && p.data.labelText) || labelName(p);
    /* 阶段节点是中间态：只写「缴 X 后」，数值由带子宽度表达；单行显示，
       七列并排时才不会和扣缴节点的两行标签互相压字。 */
    /* 阶段节点：名称 + 累计剩余，瀑布的递减线必须看得见数字 */
    if (p.data && p.data.stage) {
      const line1 = '{s|' + nm + '}  {sv|' + dispSym() + amtText(p.value) + '}';
      if (!state.mode.pct) return line1;
      const pc0 = pctBase > 0 ? p.value / pctBase * 100 : 0;
      return line1 + '\n' + '{p|' + fmtPct1(pc0) + ' ' + pctWord + '}';
    }
    let body = '{n|' + nm + '}';
    const parts = [];
    /* 「税前应发」恒为 100%，占比行没有信息量，只留名称 + 金额 */
    if (state.mode.pct && p.name !== 'gross') {
      const pc = pctBase > 0 ? p.value / pctBase * 100 : 0;
      parts.push('{p|' + fmtPct1(pc) + ' ' + pctWord + '}');
    }
    parts.push('{v|' + amt + '}');
    body += '\n' + parts.join(' · ');
    return body;
  }

  const labelOf = new Map(g.nodes.map(n => [n.name, n.labelText]));
  const data = g.nodes.map(n => {
    const d = { name: n.name, value: n.value, depth: n.depth, labelText: n.labelText, stage: n.stage, noLabel: n.noLabel, baseNote: n.baseNote, ownerNote: n.ownerNote, detailNote: n.detailNote, itemStyle: n.itemStyle };
    /* 位置由 labor.js 给：左侧收入 / 扣缴在上 / 瀑布主干在下 / 去向在右 */
    let pos = n.pos || 'top';
    d.label = { position: pos, distance: 8, formatter: nodeLabel };
    /* 极小节点：标签（两行 37px）比色块还高，画出来只会互相压字。
       1.5% 以下不画标签——它的去向节点仍带名字和金额，信息不丢。 */
    if (n.name === 'd:tax') d.label = { position: 'bottom', distance: 6, formatter: nodeLabel };
    else if (n.noLabel) d.label = { show: false };
    else if (n.name === 't:other') d.label = { position: 'right', distance: 8, formatter: shortNodeLabel };
    else if (state.view === 'cost' && /^t:(ppool|medpool|unemp|injury)$/.test(n.name) && n.value >= 20) {
      d.label = { position: 'right', distance: 8, formatter: shortNodeLabel };  /* 单位视角的统筹池：再小也要有名有姓 */
    } else if ((pctBase > 0 && n.value / pctBase < 0.03) && /^t:/.test(n.name) && n.name !== 't:net') {
      /* 去向列不到 3% 的账户：只留一行名字，两行会和小节点压字 */
      d.label = { position: 'right', distance: 8, formatter: shortNodeLabel };
    } else if (!/^d:/.test(n.name) && (n.value < 2 || (pctBase > 0 && n.value / pctBase < 0.012))) d.label = { show: false };
    return d;
  });

  const series = {
    type: 'sankey',
    layout: 'none',
    nodeAlign: 'justify',
    nodeWidth: 30,
    nodeGap: 22,
    left: pads.left,
    right: Math.max(pads.right, state.mode.pct ? (compactLabel ? 148 : 206) : 0),
    top: 60,
    bottom: g.nodes.some(n => n.name === 't:other') ? 58 : 40,
    emphasis: { focus: 'adjacency' },
    label: { fontSize: compactLabel ? 12 : 15, formatter: nodeLabel, rich: labelRich, textBorderColor: '#fff', textBorderWidth: 2.5 },
    data: data,
    links: g.links
  };
  if (compactLabel) {
    series.avoidLabelOverlap = true;
    series.labelLayout = { hideOverlap: true };
  } else {
    /* 中文标签比上游的「NVDA ¥1.2B」宽得多，扣缴列相邻小节点的两行标签会叠：
       让 ECharts 只做纵向位移避让，不隐藏任何标签。 */
    series.labelLayout = { moveOverlap: 'shiftY' };
  }

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: p => {
        if (p.dataType === 'edge') {
          return (labelOf.get(p.data.source) || displayName({ name: p.data.source })) + ' → ' +
            (labelOf.get(p.data.target) || displayName({ name: p.data.target })) +
            '<br/><b>' + dispSym() + amtText(p.data.value) + '</b>';
        }
        const pc = pctBase > 0 ? p.value / pctBase * 100 : 0;
        const bn = p.data && p.data.baseNote;
        const ow = p.data && p.data.ownerNote;
        return '<b>' + ((p.data && p.data.labelText) || labelName(p)) + '</b><br/>' + dispSym() + amtText(p.value) +
          '<br/>' + fmtPct1(pc) + ' ' + pctWord +
          (bn ? '<br/><span style="color:#52607a">' + bn + '</span>' : '') +
          (ow ? '<br/><span style="color:#52607a">' + ow + '</span>' : '') +
          (p.data && p.data.detailNote ? '<br/><span style="color:#52607a">' + p.data.detailNote + '</span>' : '');
      }
    },
    series: [series]
  }, true);

  /* 导出用的静态 option：奶油底、关动画、去 tooltip（上游 __lastOption 同义） */
  window.__lastOption = {
    backgroundColor: '#f2efe9',
    tooltip: undefined,
    series: [series]
  };
}

/* ------------------------------------------------------------------ *
 * 左栏：30 个案例格（纯文字 + 色块，无 emoji）
 * ------------------------------------------------------------------ */
function renderLogoRail() {
  const rail = document.getElementById('logoRail');
  if (!rail) return;
  const list = cases();
  if (!rail.dataset.built) {
    /* 按用工形态分组：组标题 + 组内按 cases 原顺序，不重排 */
    const groups = bridge.groups();
    rail.innerHTML = groups.map(g => {
      const rows = list.filter(c => c.group === g.id).map(c =>
        '<div class="logo" role="button" tabindex="0" data-id="' + c.id + '" aria-pressed="false" title="' + c.name + '">' +
          c.name +
        '</div>'
      ).join('');
      return rows ? '<div class="grp">' + g.name + '</div>' + rows : '';
    }).join('');
    rail.dataset.built = '1';
    rail.addEventListener('click', e => {
      const el = e.target.closest('.logo');
      if (el) selectCase(el.dataset.id);
    });
    rail.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const el = e.target.closest('.logo');
      if (!el) return;
      e.preventDefault();
      selectCase(el.dataset.id);
    });
  }
  Array.prototype.forEach.call(rail.querySelectorAll('.logo'), el => {
    const on = el.dataset.id === state.caseId;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  syncLogoToggle();
}
function syncLogoToggle() {
  const btn = document.getElementById('logoToggle');
  if (!btn) return;
  const n = cases().length;
  btn.querySelector('#logoCount').textContent = n + ' 个案例';
  btn.setAttribute('aria-expanded', document.getElementById('logoRail').classList.contains('open') ? 'true' : 'false');
}
function selectCase(id) {
  const c = cases().find(x => x.id === id);
  if (!c) return;
  state.caseId = id;
  state.gross = snapGross(c.gross);
  render();
}

/* ------------------------------------------------------------------ *
 * 底部薪资滑杆（上游季度时间轴：刻度绘制 / 委托点击 / fill+thumb 定位）
 * ------------------------------------------------------------------ */
function shortMoney(v) {
  if (v >= 10000) return '¥' + (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return '¥' + Math.round(v).toLocaleString('en-US');
}

function setStep(i) {
  const s = stepsOf();
  if (!s.length) return;
  i = Math.max(0, Math.min(s.length - 1, i | 0));
  if (s[i] === state.gross) { renderTimeline(); return; }
  state.gross = s[i];
  render();
}

function renderTimeline() {
  const box = document.getElementById('tlTicks');
  const s = stepsOf();
  const n = s.length;
  const cur = curIndex();

  /* 刻度：下限 / 三等分 / 上限，外加当前档（避免第 6 个刻度把行挤爆） */
  const show = [];
  const push = i => { if (i >= 0 && i < n && show.indexOf(i) < 0) show.push(i); };
  [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1, cur].forEach(push);
  show.sort((a, b) => a - b);

  box.innerHTML = show.map(i => {
    const act = i === cur;
    return '<div class="tl-tick' + (act ? ' active' : '') + '" data-i="' + i + '" title="' + money(s[i]) + ' / 月">' +
      '<div class="q">' + shortMoney(s[i]) + '</div>' +
      (act ? '<div class="d">' + money(s[i]) + '</div>' : '') +
    '</div>';
  }).join('');

  const pct = n > 1 ? cur / (n - 1) * 100 : 0;
  document.getElementById('tlFill').style.width = pct + '%';
  document.getElementById('tlThumb').style.left = pct + '%';
  document.getElementById('tlNow').textContent = money(s[cur]);

  const th = document.getElementById('tlThumb');
  th.setAttribute('aria-valuemin', money(s[0]));
  th.setAttribute('aria-valuemax', money(s[n - 1]));
  th.setAttribute('aria-valuenow', money(s[cur]));
  th.setAttribute('aria-valuetext', money(s[cur]) + ' / 月');

  renderSnapDots(n);
  markNearDot(cur);
}

/* 每个薪资档位一个落点 */
function renderSnapDots(n) {
  const track = document.querySelector('#timeline .tl-track');
  if (!track) return;
  Array.prototype.forEach.call(track.querySelectorAll('.tl-dot'), d => d.remove());
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'tl-dot';
    d.dataset.i = i;
    d.style.left = (n > 1 ? i / (n - 1) * 100 : 0) + '%';
    track.appendChild(d);
  }
}
function markNearDot(idx) {
  Array.prototype.forEach.call(document.querySelectorAll('#timeline .tl-dot'), d => {
    d.classList.toggle('near', Number(d.dataset.i) === idx);
  });
}

/* 上游 initTimelineDrag 的交互骨架；刻意不用 setPointerCapture（CDP 合成
   输入下会 stall），改用 window 级 pointermove + dragging 标志，松手用最后
   一次 clientX 再取值，不回写位置（不回弹）。 */
function initTimelineDrag() {
  const tl = document.getElementById('timeline');
  const track = document.getElementById('tlTrack');
  const thumb = document.getElementById('tlThumb');
  if (!tl || !track || !thumb) return;
  let dragging = false;
  let lastX = 0;

  const indexAt = clientX => {
    const r = track.getBoundingClientRect();
    const n = stepsOf().length;
    if (n <= 1) return 0;
    return Math.round((clientX - r.left) / Math.max(1, r.width) * (n - 1));
  };
  const apply = clientX => {
    const i = indexAt(clientX);
    setStep(i);
    markNearDot(Math.max(0, Math.min(stepsOf().length - 1, i)));
  };

  thumb.addEventListener('pointerenter', () => tl.classList.add('hover'));
  thumb.addEventListener('pointerleave', () => { if (!dragging) tl.classList.remove('hover'); });

  thumb.addEventListener('pointerdown', e => {
    dragging = true;
    lastX = e.clientX;
    tl.classList.add('dragging');
    apply(e.clientX);
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    lastX = e.clientX;
    apply(e.clientX);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    tl.classList.remove('dragging');
    apply(lastX);
    markNearDot(curIndex());
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  /* 点轨道任意位置直接跳档（落在 thumb 上时交给 pointerdown 处理） */
  track.addEventListener('pointerdown', e => {
    if (e.target === thumb) return;
    apply(e.clientX);
  });

  /* 刻度委托点击 + 就近中心（防刻度命中区互相吞） */
  document.getElementById('tlTicks').addEventListener('click', e => {
    const hit = e.target.closest('.tl-tick');
    if (hit) { setStep(Number(hit.dataset.i)); return; }
    const ticks = Array.prototype.slice.call(document.querySelectorAll('#tlTicks .tl-tick'));
    if (!ticks.length) return;
    let best = ticks[0], bd = Infinity;
    ticks.forEach(tk => {
      const r = tk.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - e.clientX);
      if (d < bd) { bd = d; best = tk; }
    });
    setStep(Number(best.dataset.i));
  });

  /* 键盘：方向键 / Home / End（上游没有，清单要求补 aria） */
  thumb.addEventListener('keydown', e => {
    const n = stepsOf().length;
    const cur = curIndex();
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'PageUp') next = cur + 5;
    else if (e.key === 'PageDown') next = cur - 5;
    if (next == null) return;
    e.preventDefault();
    setStep(next);
  });
}

/* ------------------------------------------------------------------ *
 * URL hash：案例 / 城市 / 薪资 / 视角 / 占比
 * ------------------------------------------------------------------ */
function hashString() {
  const c = curCase();
  const p = new URLSearchParams();
  if (state.caseId !== 'bigtech') p.set('c', state.caseId);
  if (state.city !== 'sh') p.set('city', state.city);
  if (Math.round(state.gross) !== Math.round(snapGross(c.gross))) p.set('g', String(Math.round(state.gross)));
  if (state.view !== 'bridge') p.set('v', 'cost');
  if (state.mode.pct) p.set('pct', '1');
  return p.toString();
}
function syncHash() {
  const h = hashString();
  const base = location.pathname + location.search;
  const url = base + (h ? '#' + h : '');
  if (url === base + location.hash) return;
  try { history.replaceState(null, '', url); } catch (e) { location.hash = h; }
}
function applyHash() {
  const raw = String(location.hash || '').replace(/^#/, '');
  if (!raw) { state.gross = snapGross(state.gross); return; }
  let p;
  try { p = new URLSearchParams(raw); } catch (e) { return; }
  const list = cases();
  const cid = p.get('c');
  if (cid && list.some(c => c.id === cid)) state.caseId = cid;
  const city = p.get('city');
  if (city && LABOR.cities[city]) state.city = city;
  const g = p.get('g');
  state.gross = snapGross(g != null && isFinite(+g) ? +g : curCase().gross);
  if (p.get('v') === 'cost') state.view = 'cost';
  if (p.get('pct') === '1') state.mode.pct = true;
}

/* ------------------------------------------------------------------ *
 * 页面渲染
 * ------------------------------------------------------------------ */
function renderMeta(bundle) {
  const c = bundle.c, r = bundle.r;
  const bits = [];
  bits.push(state.view === 'cost' ? t('viewCost') : t('viewBridge'));
  bits.push(r.city.name);
  bits.push(c.legal);
  bits.push('税目 ' + bundle.meta.tax);
  bits.push('社保 ' + bundle.meta.si);
  bits.push('应发 ' + money(r.gross) + '/月');
  if (r.revenue > r.gross + 0.5) bits.push('流水 ' + money(r.revenue) + '/月');
  document.getElementById('metaLine').innerHTML =
    bits.map(b => '<span>' + b + '</span>').join(' · ');
}

/* 公式带：图下方、滑杆上方的一行灰字，逐项展开税基与档位（数字全部来自引擎） */
/* 图例按图上真实出现的颜色生成，没有「平台 / 中介」的案例就不显示那一项 */
function renderLegend(g) {
  const el = document.getElementById('chartLegend');
  if (!el || !g) return;
  const have = new Set(g.nodes.map(n => n.itemStyle && n.itemStyle.color));
  const items = [['#16a34a', '你的现金'], ['#0ea5e9', '你的账户'], ['#8b5cf6', '共担池'],
                 ['#dc2626', '税'], ['#94a3b8', '平台 / 中介 · 其他']];
  el.innerHTML = items.filter(it => have.has(it[0]))
    .map(it => '<span><i style="background:' + it[0] + '"></i>' + it[1] + '</span>').join('');
}

function renderFormula(bundle) {
  const el = document.getElementById('formulaLine');
  if (!el) return;
  el.textContent = bundle.formula || '';
}

function renderControls() {
  document.getElementById('brand').textContent = t('appTitle');
  const personal = state.view !== 'cost';
  const b1 = document.getElementById('btnViewBridge');
  const b2 = document.getElementById('btnViewCost');
  document.getElementById('lblViewBridge').textContent = t('viewBridge');
  document.getElementById('lblViewCost').textContent = t('viewCost');
  b1.classList.toggle('active', personal);
  b1.setAttribute('aria-pressed', personal ? 'true' : 'false');
  b2.classList.toggle('active', !personal);
  b2.setAttribute('aria-pressed', !personal ? 'true' : 'false');
  document.getElementById('lblPct').textContent = t('pctBtn');
  const bp = document.getElementById('btnPct');
  bp.classList.toggle('active', state.mode.pct);
  bp.setAttribute('aria-pressed', state.mode.pct ? 'true' : 'false');
  document.getElementById('lblExportPNG').textContent = t('exportPNG');
  document.getElementById('lblExportSVG').textContent = t('exportSVG');
  document.getElementById('btnNote').textContent = t('noteBtn');
  const sel = document.getElementById('citySelect');
  if (sel && !sel.dataset.built) {
    sel.innerHTML = cityList().map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
    sel.dataset.built = '1';
  }
  if (sel) sel.value = state.city;
}

function render() {
  const bundle = computeNow();
  window.__bundle = bundle;
  renderMeta(bundle);
  renderFormula(bundle);
  renderControls();
  renderLogoRail();
  renderTimeline();
  syncChartHeightForNotes();
  renderChart();
  if (chart) chart.resize();
  document.documentElement.lang = 'zh-CN';
  syncHash();
}

/* ------------------------------------------------------------------ *
 * 图表高度（上游 sankeyBaseHeight / syncChartHeightForNotes）
 * ------------------------------------------------------------------ */
const SANKEE_BASE_H = 660; // must match #sankey's CSS height in index.html

function sankeyBaseHeight() {
  const w = window.innerWidth;
  if (w <= 400) return 480;
  if (w <= 768) return 520;
  return SANKEE_BASE_H;
}
function syncChartHeightForNotes() {
  const sk = document.getElementById('sankey');
  if (!sk) return;
  /* 桌面端 meta 行有 36px 预留：换成多行时把图表让出超出部分；
     窄屏 #sankey 固定 520 / 480（清单 A10 的硬指标），不再二次压缩。 */
  const meta = document.getElementById('metaLine');
  let extra = 0;
  if (meta && window.innerWidth > 768) extra = Math.max(0, meta.offsetHeight - 36);
  sk.style.height = Math.max(240, sankeyBaseHeight() - extra) + 'px';
}

/* ------------------------------------------------------------------ *
 * 导出（上游 exportHeaderData / exportWatermark / exportFileName /
 *       svgWithHeader / exportPNG / exportSVG 的结构）
 * ------------------------------------------------------------------ */
function exportHeaderData() {
  const bundle = window.__bundle || computeNow();
  const m = bundle.meta;
  return {
    title: (document.getElementById('chartTitle').textContent || '').trim(),
    line: m.city + ' · ' + m.legal + ' · 税目 ' + m.tax
  };
}
function exportOption() {
  const base = window.__lastOption || (chart && chart.getOption()) || {};
  const opt = Object.assign({}, base, { backgroundColor: '#f2efe9', animation: false, tooltip: undefined });
  /* 导出画布固定 1600×900，比屏幕宽；照搬屏幕的左右留白会把首列名称和
     右侧「占比 · 金额」顶出画布。这里只给导出用的桑基列换一组固定留白，
     其余选项（含 tooltip:undefined）保持上游写法。 */
  if (Array.isArray(opt.series) && opt.series[0] && opt.series[0].type === 'sankey') {
    opt.series = opt.series.map(s => Object.assign({}, s, { left: 300, right: 270 }));
  }
  return opt;
}
function exportWatermark() {
  const meta = LABOR.meta || {};
  return '劳动收入组成 · 数据更新 ' + String(meta.updated || '').slice(0, 4) + ' · 单位 ¥/月';
}
function exportFileName(ext) {
  return 'labor_income_' + state.caseId + '_' + state.city + '_' + Math.round(state.gross) + '.' + ext;
}
const _svgEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgWithHeader(rawSvg) {
  const m = String(rawSvg).match(/^<svg[^>]*>/);
  if (!m) return rawSvg;
  const openTag = m[0];
  const wAttr = /width="([\d.]+)"/.exec(openTag);
  const hAttr = /height="([\d.]+)"/.exec(openTag);
  const W = wAttr ? Math.round(+wAttr[1]) : 1200;
  const H0 = hAttr ? Math.round(+hAttr[1]) : 900;
  const headH = 96, wmH = 40, H = H0 + headH + wmH;
  const hd = exportHeaderData();
  const wm = exportWatermark();
  const fam = "'Segoe UI','Microsoft YaHei',sans-serif";
  const inner = String(rawSvg).slice(openTag.length).replace(/<\/svg>\s*$/, '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f2efe9"/>' +
    '<text x="' + (W / 2) + '" y="40" text-anchor="middle" font-family="' + fam + '" font-size="30" font-weight="800" fill="#1d55a5">' + _svgEsc(hd.title) + '</text>' +
    '<text x="' + (W / 2) + '" y="72" text-anchor="middle" font-family="' + fam + '" font-size="15" fill="#475569">' + _svgEsc(hd.line) + '</text>' +
    '<g transform="translate(0,96)">' + inner + '</g>' +
    '<text x="' + (W / 2) + '" y="' + (H - 14) + '" text-anchor="middle" font-family="' + fam + '" font-size="11" fill="#52607a">' + _svgEsc(wm) + '</text>' +
  '</svg>';
}

function downloadURL(url, name) {
  const a = document.createElement('a');
  a.download = name;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function exportPNG() {
  const W = 1600, H = 900, headH = 96, wmH = 40, ratio = 2;
  const off = echarts.init(document.createElement('div'), null, { renderer: 'canvas', width: W, height: H });
  off.setOption(exportOption());
  const chartUrl = off.getDataURL({ type: 'png', pixelRatio: ratio, backgroundColor: '#f2efe9' });
  off.dispose();
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = chartUrl; });

  const cv = document.createElement('canvas');
  cv.width = W * ratio;
  cv.height = (H + headH + wmH) * ratio;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f2efe9';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, headH * ratio, W * ratio, H * ratio);

  const hd = exportHeaderData();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1d55a5';
  ctx.font = '800 ' + (30 * ratio) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText(hd.title, cv.width / 2, 40 * ratio);
  ctx.fillStyle = '#475569';
  ctx.font = (15 * ratio) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText(hd.line, cv.width / 2, 74 * ratio);
  ctx.fillStyle = '#52607a';
  ctx.font = (11 * ratio) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText(exportWatermark(), cv.width / 2, (H + headH + wmH / 2) * ratio);

  const dataUrl = cv.toDataURL('image/png');
  downloadURL(dataUrl, exportFileName('png'));
  return dataUrl;
}

function exportSVG() {
  const W = 1600, H = 900;
  const off = echarts.init(document.createElement('div'), null, { renderer: 'svg', width: W, height: H });
  off.setOption(exportOption());
  const raw = off.renderToSVGString();
  off.dispose();
  const svg = svgWithHeader(raw);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadURL(url, exportFileName('svg'));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return svg;
}

/* ------------------------------------------------------------------ *
 * 口径说明弹窗（上游没有；清单要求 Esc / role=dialog / 焦点归还）
 * ------------------------------------------------------------------ */
function noteHtml(bundle) {
  const c = bundle.c, r = bundle.r, m = bundle.meta;
  const rows = [];
  rows.push('<p><b>' + c.name + '</b> · ' + c.legal + ' · ' + r.city.name + '</p>');
  rows.push('<p class="k">应发 ' + money(r.gross) + '/月 · 用工总成本 ' + money(r.cost) + '/月 · 到手 ' + money(r.net) + '/月</p>');
  if (c.note) rows.push('<p>' + c.note + '</p>');
  if (c.caveat) rows.push('<p class="k">口径提示：' + c.caveat + '</p>');
  rows.push('<p class="k">社保：' + m.si + '（基数 ' + money(r.siBase) + '） · 公积金：' + (r.hfRate * 100).toFixed(0) + '%（基数 ' + money(r.hfBase) + '） · 税目：' + m.tax + '</p>');
  if (m.sources && m.sources.length) {
    rows.push('<p class="src">' + t('source') + '：' + m.sources.map(s => '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>').join('；') + '</p>');
  }
  rows.push('<p class="src">' + m.year + ' · 更新 ' + m.updated + ' · 金额单位 ¥/月；本图为口径示意，不构成税务或法律意见。</p>');
  return rows.join('');
}
function openNote() {
  const bundle = window.__bundle || computeNow();
  lastFocus = document.activeElement;
  document.getElementById('noteBody').innerHTML = noteHtml(bundle);
  document.getElementById('noteModal').hidden = false;
  document.getElementById('noteX').focus();
}
function closeNote() {
  const modal = document.getElementById('noteModal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ------------------------------------------------------------------ *
 * 控件
 * ------------------------------------------------------------------ */
function initControls() {
  initTimelineDrag();

  document.getElementById('btnPct').addEventListener('click', () => {
    state.mode.pct = !state.mode.pct;
    render();
  });
  document.getElementById('btnViewBridge').addEventListener('click', () => {
    if (state.view === 'bridge') return;
    state.view = 'bridge';
    render();
  });
  document.getElementById('btnViewCost').addEventListener('click', () => {
    if (state.view === 'cost') return;
    state.view = 'cost';
    render();
  });
  document.getElementById('btnExportPNG').addEventListener('click', () => { exportPNG(); });
  document.getElementById('btnExportSVG').addEventListener('click', () => { exportSVG(); });

  document.getElementById('btnNote').addEventListener('click', openNote);
  document.getElementById('noteX').addEventListener('click', closeNote);
  document.getElementById('noteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('noteModal')) closeNote();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeNote();
  });

  const sel = document.getElementById('citySelect');
  if (sel) {
    sel.addEventListener('change', () => {
      state.city = sel.value;
      render();
    });
  }

  const toggle = document.getElementById('logoToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.getElementById('logoRail').classList.toggle('open');
      syncLogoToggle();
    });
  }
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */
function main() {
  chart = echarts.init(document.getElementById('sankey'), null, { renderer: 'svg' });

  /* 点节点高亮相邻（上游无，清单要求新增） */
  chart.on('click', p => {
    if (p && p.dataType === 'node') {
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: p.name });
    }
  });
  /* 点空白清除选中 */
  chart.getZr().on('click', e => {
    if (!e.target) chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
  });

  applyHash();
  initControls();
  window.addEventListener('resize', () => {
    syncChartHeightForNotes();
    renderChart();
    if (chart) chart.resize();
  });
  render();
  window.__ready = true;
  /* 自检用钩子：批量渲染 30 案例 × 6 城 × 2 视角 × 占比开关（见 research/rebuild-notes.md） */
  window.__laborTest = {
    state: state,
    set: function (patch) { Object.assign(state, patch); render(); },
    bridge: bridge,
    engine: engine
  };
}

main();
