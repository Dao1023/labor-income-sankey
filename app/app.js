/* 劳动收入组成 · UI 与图形组装 */
(function (root) {
  'use strict';

  var D = root.LABOR_DATA, E = root.LaborEngine, K = root.LaborSankey;

  var C = {
    gross: '#1d55a5',
    src: ['#2563eb', '#3b82c4', '#0ea5e9', '#6366f1', '#0891b2', '#7c3aed', '#d4a017'],
    personal: { pension: '#0ea5e9', pool: '#9b8af0', medical: '#6366f1', unemp: '#a78bfa', hf: '#0d9488', annuity: '#0f766e', tax: '#e11d48' },
    employer: { pension: '#b9c0cb', medical: '#c8ced8', other: '#d5dae2', hf: '#9aa6b2', annuity: '#aab4c0', agency: '#d9a45b' },
    sink: { net: '#16a34a', acct: '#0ea5e9', hf: '#0d9488', annuity: '#0f766e', social: '#7c3aed', medical: '#6366f1', tax: '#e11d48', agency: '#d97706', cost: '#a16207' }
  };

  var S = {
    caseId: 'gov-civil',
    city: 'sh',
    gross: null,
    employer: false,
    deductions: 3000,
    fundRate: null
  };

  var G = null;

  function $(sel, r) { return (r || document).querySelector(sel); }
  function $$(sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); }
  function fmt(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function caseById(id) { for (var i = 0; i < D.cases.length; i++) if (D.cases[i].id === id) return D.cases[i]; return D.cases[0]; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ───────────────── 图结构 ───────────────── */
  function buildGraph(r, c, employerView) {
    var nodes = [], links = [], detail = {};
    function add(id, label, value, layer, color, order, extra) {
      if (!(value > 0.01)) return null;
      var n = { id: id, label: label, value: value, layer: layer, color: color, order: order || 0 };
      if (extra) for (var k in extra) n[k] = extra[k];
      nodes.push(n);
      return n;
    }
    function link(s, t, v, note) { if (v > 0.01) links.push({ source: s, target: t, value: v, note: note }); }

    var hasRevenueCut = r.revenue - r.gross > 0.5;
    var taxLabel = r.tax.kind === 'service' ? '个税（预扣）' : (r.tax.kind === 'business' ? '经营所得个税' : '个人所得税');

    /* L0 来源 */
    if (hasRevenueCut) {
      add('rev', c.group === 'platform' ? '订单流水' : (c.id === 'construction' ? '工程款' : '经营流水'), r.revenue, 0, '#d4a017', 10);
    } else {
      r.comps.forEach(function (x) {
        add('src' + x.i, x.label, x.value, 0, C.src[x.i], 10 + x.i);
      });
    }

    /* L1 应发 */
    add('gross', c.group === 'platform' || c.tax.type === 'business' ? '个人应发' : '税前应发', r.gross, 1, C.gross, 10);

    /* 单位支干 */
    var erTotal = r.er.si + r.er.hf + r.er.annuity + r.er.agency;
    if (employerView && erTotal > 0.5) {
      add('er0', '单位附加成本', erTotal, 0, '#94a3b8', 0);
      add('er1', '单位缴纳', erTotal, 1, '#94a3b8', 0);
      link('er0', 'er1', erTotal);
    }

    /* L2 扣缴项 */
    var p = r.p;
    var pItems = [
      ['p-pension-a', '养老 8%（个人账户）', p.pensionAcct, C.personal.pension, 10, 'sink-acct', '进你自己名下，退休后按月领取，可继承'],
      ['p-pension-p', '养老 12%（自缴统筹）', p.pensionPool, C.personal.pool, 10.5, 'sink-social', '灵活就业者自己承担的单位部分，进统筹基金'],
      ['p-medical', '医疗（个人）', p.medical, C.personal.medical, 11, 'sink-medical', '医保统筹'],
      ['p-unemp', '失业（个人）', p.unemp, C.personal.unemp, 12, 'sink-social', '失业保险基金'],
      ['p-hf', '公积金（个人）', p.hf, C.personal.hf, 13, 'sink-hf', '住房公积金个人账户'],
      ['p-annuity', '年金（个人）', p.annuity, C.personal.annuity, 14, 'sink-annuity', '职业/企业年金个人账户'],
      ['p-tax', taxLabel, r.tax.withheld, C.personal.tax, 15, 'sink-tax', r.tax.kind === 'service' ? '预扣，年度汇算多退少补' : '国库']
    ];
    pItems.forEach(function (it) {
      if (!(it[2] > 0.01)) return;
      add(it[0], it[1], it[2], 2, it[3], it[4]);
      link('gross', it[0], it[2]);
      link(it[0], it[5], it[2], it[6]);
    });

    /* L3 去向 */
    var net = add('sink-net', '到手现金', r.net, 3, C.sink.net, 0, { hero: true });
    link('gross', 'sink-net', r.net, '扣除五险一金与个税后的可支配现金');

    if (p.pensionAcct > 0.5) add('sink-acct', '养老个人账户', p.pensionAcct, 3, C.sink.acct, 1);
    var hfTotal = p.hf + r.er.hf;
    if (hfTotal > 0.5) add('sink-hf', '公积金账户', hfTotal, 3, C.sink.hf, 2);
    var anTotal = p.annuity + r.er.annuity;
    if (anTotal > 0.5) add('sink-annuity', '年金账户', anTotal, 3, C.sink.annuity, 3);
    var socialTotal = p.pensionPool + p.unemp + r.er.pension + r.er.unemp + r.er.injury;
    if (socialTotal > 0.5) add('sink-social', '社保统筹', socialTotal, 3, C.sink.social, 4);
    var medTotal = p.medical + r.er.medical;
    if (medTotal > 0.5) add('sink-medical', '医保统筹', medTotal, 3, C.sink.medical, 5);
    if (r.tax.withheld > 0.5) add('sink-tax', '国库（个税）', r.tax.withheld, 3, C.sink.tax, 6);

    /* 平台抽成 / 中介管理费 */
    var agencyDeduct = r.er.agencyDeduct || 0;
    var agencyClient = r.er.agency || 0;
    var agencyTotal = agencyDeduct + (employerView ? agencyClient : 0);
    if (agencyTotal > 0.5) {
      add('sink-agency', (c.si && c.si.agency && c.si.agency.label) || '平台 / 中介', agencyTotal, 3, C.sink.agency, 7,
        { note: agencyDeduct > 0 ? '从流水里直接扣走' : '用工单位在工资之外另付' });
      if (agencyDeduct > 0.5) link('rev', 'sink-agency', agencyDeduct, '平台/中介从流水里抽走');
    }
    var extra = r.er.extra || 0;
    if (extra > 0.5) {
      add('sink-cost', '经营成本', extra, 3, C.sink.cost, 8, { note: '车辆、油电、设备等自付成本' });
      if (hasRevenueCut) link('rev', 'sink-cost', extra);
    }

    /* 流水 → 应发 */
    if (hasRevenueCut) {
      link('rev', 'gross', r.gross);
    } else {
      r.comps.forEach(function (x) { if (x.value > 0.5) link('src' + x.i, 'gross', x.value); });
    }

    /* 单位分项 */
    if (employerView && erTotal > 0.5) {
      var erItems = [
        ['e-pension', '养老（单位）', r.er.pension, C.employer.pension, 0, 'sink-social'],
        ['e-medical', '医疗（单位）', r.er.medical, C.employer.medical, 1, 'sink-medical'],
        ['e-other', '失业+工伤（单位）', r.er.unemp + r.er.injury, C.employer.other, 2, 'sink-social'],
        ['e-hf', '公积金（单位）', r.er.hf, C.employer.hf, 3, 'sink-hf'],
        ['e-annuity', '年金（单位）', r.er.annuity, C.employer.annuity, 4, 'sink-annuity'],
        ['e-agency', '管理费 / 服务费', r.er.agency, C.employer.agency, 5, 'sink-agency']
      ];
      erItems.forEach(function (it) {
        if (!(it[2] > 0.01)) return;
        add(it[0], it[1], it[2], 2, it[3], it[4]);
        link('er1', it[0], it[2]);
        link(it[0], it[5], it[2]);
      });
      // 若管理费存在但 sink 未创建（极端情况）
      if (r.er.agency > 0.5 && !nodes.some(function (n) { return n.id === 'sink-agency'; })) {
        add('sink-agency', '管理费 / 中介', r.er.agency, 3, C.sink.agency, 6);
      }
    }

    /* 细节说明 */
    nodes.forEach(function (n) {
      var rows = [
        ['占本列合计', pct(n.value / (nodes.filter(function (m) { return m.layer === n.layer; })
          .reduce(function (a, m) { return a + m.value; }, 0) || 1), 1)],
        ['占税前应发', pct(n.value / (r.gross || 1), 1)]
      ];
      if (hasRevenueCut) rows.push(['占订单流水', pct(n.value / (r.revenue || 1), 1)]);
      detail[n.id] = { title: n.label, value: n.value, color: n.color, rows: rows, note: n.note || '' };
    });

    return { nodes: nodes, links: links, detail: detail };
  }

  /* ───────────────── tooltip ───────────────── */
  var tipEl, tipTimer;
  function tipFn(kind, id, e) {
    var st = K.state;
    var html = '';
    if (kind === 'node') {
      var n = null;
      st.nodes.forEach(function (m) { if (m.id === id) n = m; });
      if (!n) return;
      var d = G.detail[n.id] || {};
      html = '<div class="tt-h"><span class="dot" style="background:' + n.color + '"></span>' + esc(n.label) + '</div>' +
        '<div class="tt-v">' + fmt(n.value) + '<span>/ 月</span></div>' +
        (d.rows ? '<div class="tt-rows">' + d.rows.map(function (r) {
          return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
        }).join('') + '</div>' : '') +
        (d.note ? '<div class="tt-note">' + esc(d.note) + '</div>' : '');
    } else {
      var l = st.links[+id];
      if (!l) return;
      var s = st.byId.get(l.source), t = st.byId.get(l.target);
      html = '<div class="tt-h">' + esc(s.label) + ' <i>→</i> ' + esc(t.label) + '</div>' +
        '<div class="tt-v">' + fmt(l.value) + '<span>/ 月</span></div>' +
        '<div class="tt-rows"><div><span>占来源</span><b>' + pct(l.value / (s.value || 1), 1) + '</b></div></div>' +
        (l.note ? '<div class="tt-note">' + esc(l.note) + '</div>' : '');
    }
    tipEl.innerHTML = html;
    tipEl.classList.add('show');
    tipMove(e);
  }
  tipFn.move = function (e) { if (e) tipMove(e); };
  tipFn.hide = function () { tipEl.classList.remove('show'); };
  function tipMove(e) {
    if (!e || !tipEl) return;
    var host = $('#chartWrap').getBoundingClientRect();
    var x = e.clientX - host.left + 16, y = e.clientY - host.top + 14;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    if (x + w > host.width - 8) x = e.clientX - host.left - w - 14;
    if (y + h > host.height - 8) y = host.height - h - 8;
    tipEl.style.transform = 'translate(' + Math.max(6, x) + 'px,' + Math.max(6, y) + 'px)';
  }

  /* ───────────────── 渲染 ───────────────── */
  function currentCase() { return caseById(S.caseId); }

  function recompute() {
    var c = currentCase();
    var r = E.compute(c, {
      gross: S.gross, city: S.city, deductions: S.deductions,
      fundRate: S.fundRate == null ? undefined : S.fundRate
    });
    G = buildGraph(r, c, S.employer && canEmployer(c));
    K.render($('#sankey'), G, { tip: tipFn, height: 600 });
    renderStats(r, c);
    renderTable(r, c);
    renderMeta(r, c);
  }

  function canEmployer(c) {
    return !!(c.si && c.si.mode !== 'none' && c.si.mode !== 'self' && c.si.mode !== 'project' && c.si.mode !== 'injury') ||
      (c.si && c.si.agency && c.si.agency.pay === 'client');
  }

  function renderStats(r, c) {
    var cashRate = r.gross > 0 ? r.net / r.gross : 0;
    var assetMonthly = r.hfMonthly + r.annuityMonthly + r.p.pensionAcct;
    var taxRate = r.annual > 0 ? r.tax.final / r.annual : 0;
    var hasEr = canEmployer(c);
    var workerCut = r.agPay === 'worker';
    var second = hasEr
      ? { k: '单位总成本', v: fmt(r.cost), u: '/ 月', sub: (r.net > 0 ? (r.cost / r.net).toFixed(2) + '× 到手现金' : '—'), tone: 'blue' }
      : { k: '订单 / 合同流水', v: fmt(r.revenue), u: '/ 月',
          sub: workerCut
            ? '到手 / 流水 ' + pct(r.stats.takeRate) + ' · ' + (r.net > 0 ? (r.revenue / r.net).toFixed(2) : '—') + '× 流水'
            : '客户或平台支付总额',
          tone: 'blue' };
    var cards = [
      { k: '到手现金', v: fmt(r.net), u: '/ 月',
        sub: workerCut ? '占流水 ' + pct(r.stats.takeRate) : '现金到手率 ' + pct(cashRate), tone: 'green' },
      second,
      { k: '锁定在你名下的钱', v: fmt(assetMonthly), u: '/ 月', sub: '公积金 + 年金 + 养老个人账户', tone: 'teal' },
      { k: '个人所得税', v: fmt(r.tax.final / 12), u: '/ 月',
        sub: '有效税率 ' + pct(taxRate) + (r.tax.refundable > 0 ? ' · 预扣可退 ' + fmt(r.tax.refundable / 12) : ''), tone: 'red' }
    ];
    $('#stats').innerHTML = cards.map(function (c) {
      return '<div class="stat ' + c.tone + '"><div class="stat-k">' + c.k + '</div>' +
        '<div class="stat-v">' + c.v + '<span>' + c.u + '</span></div>' +
        '<div class="stat-s">' + c.sub + '</div></div>';
    }).join('');
  }

  function renderTable(r, c) {
    var rows = [];
    function row(label, val, cls, indent) {
      rows.push('<div class="tr ' + (cls || '') + (indent ? ' ind' : '') + '"><span>' + label + '</span><b>' + (val < 0 ? '−' : '') + fmt(Math.abs(val)) + '</b></div>');
    }
    if (r.revenue - r.gross > 0.5) {
      row('订单 / 合同流水', r.revenue, 'strong');
      if (r.er.agencyDeduct) row('平台 / 中介抽成', -r.er.agencyDeduct, 'sub', 1);
      var extraOnly = r.er.extra - r.er.agencyDeduct;
      if (extraOnly > 0.5) row('经营成本', -extraOnly, 'sub', 1);
    }
    row('税前应发（月）', r.gross, 'strong');
    if (r.p.pension) row('养老（个人）', -r.p.pension, 'sub', 1);
    if (r.p.medical) row('医疗（个人）', -r.p.medical, 'sub', 1);
    if (r.p.unemp) row('失业（个人）', -r.p.unemp, 'sub', 1);
    if (r.p.hf) row('公积金（个人）', -r.p.hf, 'sub', 1);
    if (r.p.annuity) row('年金（个人）', -r.p.annuity, 'sub', 1);
    if (r.tax.withheld) row(r.tax.kind === 'service' ? '个税（预扣）' : '个人所得税', -r.tax.withheld, 'tax', 1);
    row('到手现金', r.net, 'net');

    if (canEmployer(c)) {
      rows.push('<div class="tr-sep"></div>');
      row('单位五险一金', r.er.si + r.er.hf + r.er.annuity, 'sub');
      if (r.er.agency) row('管理费 / 服务费', r.er.agency, 'sub');
      row('用工总成本', r.cost, 'strong cost');
    }
    if (r.tax.refundable > 0.5) {
      rows.push('<div class="tr-sep"></div>');
      row('年度汇算后可退', r.tax.refundable, 'refund');
    }
    $('#table').innerHTML = rows.join('');
    $('#tableNote').textContent = r.tax.kind === 'service'
      ? '劳务报酬按次预扣，年度汇算按 80% 并入综合所得，多数情况下可退税。'
      : (r.tax.kind === 'none' ? '按「未申报」建模：制度上仍属劳务报酬，付款方应预扣个税；现金结算、无合同、无社保，欠薪几乎无法维权。'
      : (r.tax.kind === 'business' ? '经营所得已扣除成本与 6 万元费用扣除；个体户 ≤200 万部分减半征收。'
        : '按年度综合所得计算后摊到每月；年终奖单独计税（政策执行至 2027-12-31）。'));
  }

  function renderMeta(r, c) {
    $('#caseName').textContent = c.name;
    $('#caseLegal').textContent = c.legal;
    $('#caseIcon').textContent = c.icon;
    $('#caseTag').textContent = c.tag || '';
    $('#caseNote').textContent = c.note || '';
    $('#caseCaveat').textContent = c.caveat || '';
    $('#grossLabel').textContent = (c.tax.type === 'business' || c.group === 'platform' ? '月均流水' : '税前月均') ;
    $('#grossVal').textContent = fmt(r.revenue);
    $('#sliderHint').textContent = c.tax.type === 'business' || c.group === 'platform'
      ? '流水 = 平台/客户支付总额，扣掉抽成后才是个人的应发' : '含年终奖、股权等全部收入的月度摊薄';
  }

  /* ───────────────── 控件 ───────────────── */
  function initCity() {
    $('#city').innerHTML = Object.keys(D.cities).map(function (k) {
      return '<option value="' + k + '"' + (k === S.city ? ' selected' : '') + '>' + D.cities[k].name + '</option>';
    }).join('');
    $('#city').onchange = function () { S.city = this.value; recompute(); };
  }

  function initGroups() {
    $('#groups').innerHTML = D.groups.map(function (g) {
      return '<button class="chip' + (g.id === 'gov' ? ' on' : '') + '" data-g="' + g.id + '">' +
        '<span>' + g.icon + '</span>' + g.name + '</button>';
    }).join('');
    $$('#groups .chip').forEach(function (b) {
      b.onclick = function () {
        $$('#groups .chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        renderCases(b.getAttribute('data-g'));
      };
    });
    renderCases('gov');
  }

  function renderCases(groupId) {
    var list = D.cases.filter(function (c) { return c.group === groupId; });
    $('#cases').innerHTML = list.map(function (c) {
      return '<button class="case' + (c.id === S.caseId ? ' on' : '') + '" data-id="' + c.id + '">' +
        '<span class="ci">' + c.icon + '</span>' +
        '<span class="cm"><b>' + c.name + '</b><i>' + fmt(c.gross) + ' · ' + (c.tag || '') + '</i></span>' +
        '</button>';
    }).join('');
    $$('#cases .case').forEach(function (b) {
      b.onclick = function () { selectCase(b.getAttribute('data-id')); };
    });
  }

  function selectCase(id) {
    S.caseId = id;
    var c = currentCase();
    S.gross = c.gross;
    S.fundRate = null;
    $$('#cases .case').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-id') === id); });
    var g = $('#groups .chip[data-g="' + c.group + '"]');
    if (g && !g.classList.contains('on')) { $$('#groups .chip').forEach(function (x) { x.classList.remove('on'); }); g.classList.add('on'); renderCases(c.group); }
    initSlider();
    syncFundSeg(c);
    var canEr = canEmployer(c);
    var btn = $('#viewToggle [data-view="cost"]');
    btn.disabled = !canEr;
    btn.title = canEr ? '' : '该形态没有单位缴费';
    if (!canEr && S.employer) { S.employer = false; syncView(); }
    recompute();
  }

  function syncFundSeg(c) {
    var v = c.si && c.si.fund;
    var any = !!(v > 0);
    var btns = $$('#fundSeg button');
    btns.forEach(function (b) {
      b.disabled = !any;
      b.classList.toggle('on', any && Math.abs(+b.getAttribute('data-v') - v) < 1e-6);
    });
    S.fundRate = null;
  }

  function initSlider() {
    var c = currentCase();
    var min = Math.max(1000, Math.floor(c.lo * 0.55 / 100) * 100);
    var max = Math.ceil(c.hi * 1.7 / 100) * 100;
    var r = $('#rGross');
    r.min = min; r.max = max; r.step = 100; r.value = clamp(S.gross, min, max);
    $('#grossMin').textContent = fmt(min);
    $('#grossMax').textContent = fmt(max);
  }

  function syncView() {
    $$('#viewToggle button').forEach(function (b) {
      b.classList.toggle('on', (b.getAttribute('data-view') === 'cost') === S.employer);
    });
    document.body.classList.toggle('employer-view', S.employer);
  }

  /* ───────────────── 启动 ───────────────── */
  function init() {
    tipEl = $('#tip');
    initCity();
    initGroups();

    $('#rGross').oninput = function () {
      S.gross = +this.value;
      $('#grossVal').textContent = fmt(S.gross);
      recompute();
    };
    $('#rDeduct').oninput = function () {
      S.deductions = +this.value;
      $('#deductVal').textContent = fmt(S.deductions);
      recompute();
    };
    $$('#fundSeg button').forEach(function (b) {
      b.onclick = function () {
        $$('#fundSeg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.fundRate = +b.getAttribute('data-v');
        recompute();
      };
    });
    $$('#viewToggle button').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        S.employer = b.getAttribute('data-view') === 'cost';
        syncView();
        recompute();
      };
    });
    $('#btnSvg').onclick = function () { K.exportSVG(slug() + '.svg'); };
    $('#btnPng').onclick = function () { K.exportPNG(slug() + '.png', 2); };
    $('#btnInfo').onclick = function () { $('#infoModal').showModal(); };
    $('#btnCloseInfo').onclick = function () { $('#infoModal').close(); };
    $('#infoModal').onclick = function (e) { if (e.target === this) this.close(); };

    $('#srcList').innerHTML = D.meta.sources.map(function (s) {
      return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a></li>';
    }).join('');

    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { if (G) K.render($('#sankey'), G, { tip: tipFn, height: 600 }); }, 140);
    });

    selectCase(S.caseId);
    syncView();
  }

  function slug() {
    var c = currentCase();
    return '劳动收入-' + c.name + '-' + D.cities[S.city].name;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  root.LaborApp = { state: S, recompute: recompute, selectCase: selectCase };
})(window);
