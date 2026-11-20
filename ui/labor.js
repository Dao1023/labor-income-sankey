/* labor.js — 数据桥接：把 app/data.js + app/engine.js 的计算结果变成 ECharts sankey 的 nodes/links
   个人视角：收入构成 → 税前应发 → 个人扣缴 → 去向
   单位成本：在每列并行一条「单位附加成本 → 单位缴纳 → 对应统筹池」的支干 */
(function (root) {
  'use strict';

  var PAL = {
    income: '#3b82c4',
    gross: '#1d55a5',
    deduct: '#e29a3c',
    net: '#16a34a',
    acct: '#0ea5e9',
    fund: '#0d9488',
    pool: '#8b5cf6',
    tax: '#dc2626',
    agency: '#94a3b8',
    unit: '#64748b'
  };

  var TAX_NAME = { wage: '工资薪金', service: '劳务报酬', business: '经营所得', intern: '实习 / 劳务', none: '未申报' };
  var SI_NAME = { full: '单位足额缴纳', min: '按最低基数缴', self: '灵活就业自缴', none: '无社保', injury: '仅缴工伤', project: '项目制 / 按次' };

  function r2(v) { return Math.round(v * 100) / 100; }
  function money(v) { return '¥' + Math.round(v).toLocaleString('en-US'); }
  function pct(v, base) { return base > 0 ? Math.round(v / base * 1000) / 10 : 0; }
  function pctText(v, base) { var p = pct(v, base); return p >= 10 ? Math.round(p) + '%' : (p ? p + '%' : ''); }

  function metaOf(c, r) {
    var parts = [];
    if (c.legal) parts.push(c.legal);
    parts.push('税目 ' + (TAX_NAME[(c.tax && c.tax.type) || 'wage'] || '工资薪金'));
    parts.push('社保 ' + (SI_NAME[r.siMode] || ''));
    return parts.join(' · ');
  }

  function build(c, r, employerView) {
    var nodes = [], links = [], dests = {}, destOrder = [];

    function N(id, label, value, depth, color, pos) {
      if (!(value > 0.5)) return null;
      nodes.push({
        name: id, value: r2(value), depth: depth, labelText: label, pos: pos || 'top',
        pct: pctOf(value), pctLine: pctLine(value),
        itemStyle: { color: color, borderColor: 'rgba(15,23,42,.12)', borderWidth: 1 }
      });
      return id;
    }
    function L(a, b, v, color) {
      if (!a || !b || !(v > 0.5)) return;
      links.push({
        source: a, target: b, value: r2(v),
        lineStyle: { color: color, opacity: 0.52, curveness: 0.5 }
      });
    }
    function DEST(id, name, color, amount, depth) {
      if (!(amount > 0.5)) return;
      if (!dests[id]) { dests[id] = { name: name, color: color, amount: 0, depth: depth }; destOrder.push(id); }
      dests[id].amount += amount;
    }

    var G = r.gross;
    // 百分比口径：个人视角看「占应发」，单位成本看「占成本」，流水类案例看「占流水」
    var PCTBASE = employerView ? (r.cost || G) : (r.agPay === 'worker' ? r.revenue : G);
    var PCTWORD = employerView ? '占成本' : (r.agPay === 'worker' ? '占流水' : '占应发');
    function pctOf(v) { return PCTBASE > 0 ? Math.round(v / PCTBASE * 1000) / 10 : 0; }
    function pctLine(v) { return pctOf(v).toFixed(1) + '% ' + PCTWORD + ' · ' + money(v); }
    var cut = r.revenue - G;
    var cutLabel = r.agPay === 'worker' ? '平台抽成' : ((c.tax && c.tax.type === 'business') ? '运营成本' : '其他扣减');

    /* ---------- 第 1 列：收入构成 / 订单流水 ---------- */
    if (cut > 0.5) {
      N('src', r.agPay === 'worker' ? '订单 / 客户流水' : '客户付款', r.revenue, 0, PAL.income, 'left');
      N('cut', cutLabel, cut, 1, PAL.agency, 'top');
      L('src', 'cut', cut, PAL.agency);
      DEST('t:agency', '平台 / 中介', PAL.agency, cut, 2);
      L('cut', 't:agency', cut, PAL.agency);
      L('src', 'gross', G, PAL.income);
    } else {
      (r.comps || []).forEach(function (cp, i) {
        if (!(cp.value > 0.5)) return;
        N('inc' + i, cp.label, cp.value, 0, PAL.income, 'left');
        L('inc' + i, 'gross', cp.value, PAL.income);
      });
    }
    N('gross', '税前应发', G, 1, PAL.gross, 'top');

    /* ---------- 第 2 列：个人扣缴（合计） ---------- */
    var P = r.p;
    var deduct = (P.si || 0) + (P.hf || 0) + (P.annuity || 0) + (P.tax || 0);
    if (deduct > 0.5) {
      N('ded', '个人扣缴', deduct, 2, PAL.deduct, 'top');
      L('gross', 'ded', deduct, PAL.deduct);

      if (P.pensionAcct > 0.5) { DEST('t:pacct', '养老个人账户', PAL.acct, P.pensionAcct, 3); L('ded', 't:pacct', P.pensionAcct, PAL.acct); }
      if (P.medical > 0.5) { DEST('t:med', '医保统筹', PAL.pool, P.medical, 3); L('ded', 't:med', P.medical, PAL.pool); }
      if (P.unemp > 0.5) { DEST('t:unemp', '失业统筹', PAL.pool, P.unemp, 3); L('ded', 't:unemp', P.unemp, PAL.pool); }
      if (P.hf > 0.5) { DEST('t:hf', '公积金账户', PAL.fund, P.hf, 3); L('ded', 't:hf', P.hf, PAL.fund); }
      if (P.annuity > 0.5) { DEST('t:ann', '年金账户', PAL.fund, P.annuity, 3); L('ded', 't:ann', P.annuity, PAL.fund); }
      if (P.tax > 0.5) { DEST('t:tax', '个税 · 国库', PAL.tax, P.tax, 3); L('ded', 't:tax', P.tax, PAL.tax); }
      if (P.pensionPool > 0.5) { DEST('t:ppool', '养老统筹', PAL.pool, P.pensionPool, 3); L('ded', 't:ppool', P.pensionPool, PAL.pool); }
    }

    DEST('t:net', '到手现金', PAL.net, r.net, 3);
    L('gross', 't:net', r.net, PAL.net);

    /* ---------- 单位成本支干 ---------- */
    var E = r.er;
    var eTotal = (E.si || 0) + (E.hf || 0) + (E.annuity || 0) + (E.agency || 0);
    if (employerView && eTotal > 0.5) {
      N('u:extra', '单位附加成本', eTotal, 0, PAL.unit, 'left');
      N('unit', '单位缴纳', eTotal, 1, PAL.unit, 'top');
      L('u:extra', 'unit', eTotal, PAL.unit);

      if (E.pension > 0.5) { DEST('t:ppool', '养老统筹', PAL.pool, E.pension, 3); L('unit', 't:ppool', E.pension, PAL.pool); }
      if (E.medical > 0.5) { DEST('t:med', '医保统筹', PAL.pool, E.medical, 3); L('unit', 't:med', E.medical, PAL.pool); }
      if (E.unemp > 0.5) { DEST('t:unemp', '失业统筹', PAL.pool, E.unemp, 3); L('unit', 't:unemp', E.unemp, PAL.pool); }
      if (E.injury > 0.5) { DEST('t:injury', '工伤统筹', PAL.pool, E.injury, 3); L('unit', 't:injury', E.injury, PAL.pool); }
      if (E.hf > 0.5) { DEST('t:hf', '公积金账户', PAL.fund, E.hf, 3); L('unit', 't:hf', E.hf, PAL.fund); }
      if (E.annuity > 0.5) { DEST('t:ann', '年金账户', PAL.fund, E.annuity, 3); L('unit', 't:ann', E.annuity, PAL.fund); }
      if (E.agency > 0.5) { DEST('t:agency', '中介 / 平台', PAL.agency, E.agency, 3); L('unit', 't:agency', E.agency, PAL.agency); }
    }

    /* ---------- 汇总去向节点（按「到手 → 账户 → 税 → 统筹」排，避免乱序） ---------- */
    var ORDER = ['t:net', 't:hf', 't:pacct', 't:ann', 't:tax', 't:med', 't:unemp', 't:ppool', 't:injury', 't:agency'];
    destOrder.sort(function (a, b) {
      var ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    destOrder.forEach(function (id) {
      var d = dests[id];
      nodes.push({
        name: id, value: r2(d.amount), depth: d.depth,
        pct: pctOf(d.amount), pctLine: pctLine(d.amount),
        labelText: d.name,
        pos: d.depth >= 3 ? 'right' : 'top',
        itemStyle: { color: d.color, borderColor: 'rgba(15,23,42,.12)', borderWidth: 1 }
      });
    });

    return { nodes: nodes, links: links, title: c.name, meta: metaOf(c, r) };
  }

  root.LaborBridge = { build: build, money: money, TAX_NAME: TAX_NAME, SI_NAME: SI_NAME };
})(window);
