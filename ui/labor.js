/* labor.js — 劳动收入组成 · 数据桥接
   把 app/data.js（30 个用工案例 + 6 城费率）与 app/engine.js（LaborEngine.compute）的
   计算结果，翻译成上游桑基图（ui/app.js）直接可用的 nodes / links / meta。

   这一层只做「数值 → 图元」的映射：不发请求、不碰 DOM、不管布局。
   节点 name 带 1~3 字符的前缀（inc0: / gross / d: / t: / u:），保证 ECharts 里全局唯一；
   显示用的中文标签放在 labelText，app.js 的 displayName() 负责剥前缀。

   四列（个人视角）：收入构成 → 税前应发 → 个人扣缴 → 去向
   顶部并行支干（单位成本视角）：单位附加成本 → 单位缴纳 → 单位五险一金分项 → 同一去向列
   当「平台抽成 / 运营成本」发生在流水层（revenue > gross）时，收入构成按比例分叉：
   一部分进「税前应发」，一部分进「平台抽成 / 运营成本」，后者落到去向列的「平台 / 中介」。 */
(function (root) {
  'use strict';

  var D = root.LABOR_DATA;
  var E = root.LaborEngine;
  if (!D || !E) throw new Error('ui/labor.js 需要先加载 ../app/data.js 与 ../app/engine.js');

  /* ---------- 配色（沿用旧版语义色，不做渐变） ---------- */
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
  var INCOME_COLORS = (D.compColors || ['#2563eb', '#3b82c4', '#0ea5e9', '#6366f1', '#0891b2', '#7c3aed', '#d4a017']).slice();

  var TAX_NAME = { wage: '工资薪金', service: '劳务报酬', business: '经营所得', intern: '实习 / 劳务', none: '未申报' };
  var SI_NAME = { full: '单位足额缴纳', min: '按最低基数缴', self: '灵活就业自缴', none: '无社保', injury: '仅缴工伤', project: '项目制 / 按次' };

  /* 左栏 30 个案例格用的短名（2–3 字，纯文字，禁止 emoji） */
  var SHORT = {
    'gov-civil': '公务员', 'gov-teacher': '教师', 'gov-doctor': '医生', 'gov-army': '文职', 'gov-social': '社工',
    'soe-regular': '国企', 'soe-dispatch': '国企派', 'private-regular': '民企', sales: '销售', factory: '计件工',
    'parttime-hourly': '小时工', dispatch: '派遣工', 'outsource-onsite': '驻场', 'outsource-biz': '外包',
    'gig-platform': '灵工', bigtech: '大厂', finance: '金融', foreign: '外企', lawfirm: '律所',
    freelance: '设计师', rider: '骑手', driver: '网约车', streamer: '主播', nanny: '家政',
    daylabor: '日结', construction: '建筑工', retired: '返聘', intern: '实习', sidegig: '副业', remote: '跨境'
  };
  /* 分组底色：左栏色块 / 案例格 */
  var GROUP_TINT = {
    gov: '#2563eb', soe: '#0e7490', private: '#7c3aed', dispatch: '#b45309',
    bigtech: '#1d55a5', platform: '#0d9488', nonstd: '#64748b'
  };

  function money(v) { return '¥' + Math.round(v).toLocaleString('en-US'); }
  function pctOf(v, base) { return base > 0 ? v / base * 100 : 0; }
  function fmtPct(v) { return v.toFixed(1) + '%'; }

  function metaOf(c, r) {
    var taxType = (c.tax && c.tax.type) || 'wage';
    return {
      cityId: r.city.id,
      city: r.city.name,
      legal: c.legal || '',
      tax: TAX_NAME[taxType] || TAX_NAME.wage,
      taxType: taxType,
      si: SI_NAME[r.siMode] || '',
      siMode: r.siMode,
      gross: r.gross,
      revenue: r.revenue,
      cost: r.cost,
      net: r.net,
      agPay: r.agPay,
      updated: (D.meta && D.meta.updated) || '',
      year: (D.meta && D.meta.year) || '',
      taxYear: (D.meta && D.meta.taxYear) || '',
      sources: (D.meta && D.meta.sources) || [],
      note: c.note || '',
      caveat: c.caveat || '',
      tag: c.tag || ''
    };
  }

  /* ---------- 主构建 ---------- */
  function build(c, r, employerView) {
    var nodes = [];
    var links = [];
    var dests = {};
    var destOrder = [];

    var G = r.gross;
    var revenue = r.revenue;
    var cost = r.cost;
    var cut = Math.max(0, revenue - G);

    /* 百分比口径：个人视角「占应发」，单位成本「占成本」，流水类（平台抽成）「占流水」 */
    var pctBase = employerView ? cost : (r.agPay === 'worker' ? revenue : G);
    var pctWord = employerView ? '占成本' : (r.agPay === 'worker' ? '占流水' : '占应发');

    function fill(name, label, value, depth, color, pos) {
      if (!(value > 0.004)) return null;
      var p = pctOf(value, pctBase);
      nodes.push({
        name: name,
        value: value,
        depth: depth,
        labelText: label,
        pos: pos || 'top',
        pct: p,
        pctLine: fmtPct(p) + ' ' + pctWord + ' · ' + money(value),
        itemStyle: { color: color, borderColor: 'rgba(15,23,42,.12)', borderWidth: 1 }
      });
      return name;
    }
    function flow(a, b, v, color) {
      if (!a || !b || !(v > 0.004)) return;
      links.push({ source: a, target: b, value: v, lineStyle: { color: color, opacity: 0.52, curveness: 0.5 } });
    }
    function sink(id, label, color, amount, depth) {
      if (!(amount > 0.004)) return;
      if (!dests[id]) { dests[id] = { label: label, color: color, amount: 0, depth: depth }; destOrder.push(id); }
      dests[id].amount += amount;
    }

    /* ---------- 第 1 列：收入构成（按案例的 7 项拆分） ---------- */
    var grossRatio = revenue > 0 ? G / revenue : 1;
    (r.comps || []).forEach(function (cp, i) {
      if (!(cp.value > 0.004)) return;
      var id = fill('inc' + i, cp.label, cp.value, 0, INCOME_COLORS[i] || PAL.income, 'left');
      if (!id) return;
      /* 流水层有抽成时，按比例分叉：一部分形成应发，一部分被平台/中介拿走 */
      var toGross = cp.value * grossRatio;
      var toCut = cp.value - toGross;
      flow(id, 'gross', toGross, PAL.income);
      if (toCut > 0.004) flow(id, 'cut', toCut, PAL.agency);
    });

    /* ---------- 第 2 列：税前应发 ---------- */
    fill('gross', '税前应发', G, 1, PAL.gross, 'top');

    /* 流水层抽成（平台 / 中介 / 运营成本） */
    if (cut > 0.004) {
      var cutLabel = r.agPay === 'worker' ? '平台抽成'
        : ((c.tax && c.tax.type === 'business') ? '运营成本' : '其他扣减');
      var cutDest = r.agPay === 'worker' ? '平台 / 中介'
        : ((c.tax && c.tax.type === 'business') ? '运营成本' : '其他扣减');
      fill('cut', cutLabel, cut, 1, PAL.agency, 'top');
      flow('cut', 't:agency', cut, PAL.agency);
      sink('t:agency', cutDest, PAL.agency, cut, 2);
    }

    /* ---------- 第 3 列：个人扣缴（六项分列） ---------- */
    var P = r.p;
    var items = [
      { id: 'd:pension', label: '养老', v: P.pension, dests: [['t:pacct', '养老个人账户', PAL.acct, P.pensionAcct], ['t:ppool', '养老统筹', PAL.pool, P.pensionPool]] },
      { id: 'd:medical', label: '医疗', v: P.medical, dests: [['t:med', '医保统筹', PAL.pool, P.medical]] },
      { id: 'd:unemp', label: '失业', v: P.unemp, dests: [['t:unemp', '失业统筹', PAL.pool, P.unemp]] },
      { id: 'd:hf', label: '公积金', v: P.hf, dests: [['t:hf', '公积金账户', PAL.fund, P.hf]] },
      { id: 'd:annuity', label: '年金', v: P.annuity, dests: [['t:ann', '年金账户', PAL.fund, P.annuity]] },
      { id: 'd:tax', label: '个税', v: P.tax, dests: [['t:tax', '国库 · 个税', PAL.tax, P.tax]] }
    ];
    items.forEach(function (it) {
      var id = fill(it.id, it.label, it.v, 2, PAL.deduct, 'right');
      if (!id) return;
      flow('gross', id, it.v, PAL.deduct);
      it.dests.forEach(function (d) {
        if (!(d[3] > 0.004)) return;
        flow(id, d[0], d[3], d[2]);
        sink(d[0], d[1], d[2], d[3], 3);
      });
    });

    /* 到手现金：应发的剩余部分。ECharts 的层级由连边推导（1→2），所以它与扣缴六项
       同列；去向列放的是各项扣缴真正落进去的账户。 */
    fill('t:net', '到手现金', r.net, 2, PAL.net, 'right');
    flow('gross', 't:net', r.net, PAL.net);
    sink('t:net', '到手现金', PAL.net, r.net, 2);

    /* ---------- 单位成本支干（只在单位成本视角出现） ---------- */
    var ER = r.er;
    var eTotal = (ER.si || 0) + (ER.hf || 0) + (ER.annuity || 0) + (ER.agency || 0);
    if (employerView && eTotal > 0.004) {
      fill('u:extra', '单位附加成本', eTotal, 0, PAL.unit, 'left');
      fill('unit', '单位缴纳', eTotal, 1, PAL.unit, 'top');
      flow('u:extra', 'unit', eTotal, PAL.unit);

      var parts = [
        ['u:pension', '单位养老', ER.pension, 't:ppool', '养老统筹', PAL.pool],
        ['u:medical', '单位医疗', ER.medical, 't:med', '医保统筹', PAL.pool],
        ['u:unemp', '单位失业', ER.unemp, 't:unemp', '失业统筹', PAL.pool],
        ['u:injury', '单位工伤', ER.injury, 't:injury', '工伤统筹', PAL.pool],
        ['u:hf', '单位公积金', ER.hf, 't:hf', '公积金账户', PAL.fund],
        ['u:annuity', '单位年金', ER.annuity, 't:ann', '年金账户', PAL.fund],
        ['u:agency', '中介服务费', ER.agency, 't:agency', '平台 / 中介', PAL.agency]
      ];
      parts.forEach(function (p) {
        if (!(p[2] > 0.004)) return;
        var id = fill(p[0], p[1], p[2], 2, PAL.unit, 'right');
        if (!id) return;
        flow('unit', id, p[2], PAL.unit);
        flow(id, p[3], p[2], p[5]);
        sink(p[3], p[4], p[5], p[2], 3);
      });
    }

    /* ---------- 去向列（统一排序：到手 → 账户 → 税 → 统筹 → 平台） ---------- */
    var ORDER = ['t:net', 't:hf', 't:pacct', 't:ann', 't:tax', 't:med', 't:unemp', 't:ppool', 't:injury', 't:agency'];
    destOrder.sort(function (a, b) {
      var ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    destOrder.forEach(function (id) {
      var d = dests[id];
      /* 到手现金节点已在上面建过（它既是终点又是「去向」格），不要重复 */
      if (id === 't:net') {
        var hit = null;
        nodes.forEach(function (n) { if (n.name === 't:net') hit = n; });
        if (hit) { hit.value = d.amount; hit.pct = pctOf(d.amount, pctBase); hit.pctLine = fmtPct(hit.pct) + ' ' + pctWord + ' · ' + money(d.amount); }
        return;
      }
      fill(id, d.label, d.amount, 3, d.color, 'right');
    });

    /* ---------- 列内顺序：单位成本支干置顶，其次收入构成；扣缴 / 去向按固定次序 ---------- */
    var DORDER = ['d:pension', 'd:medical', 'd:unemp', 'd:hf', 'd:annuity', 'd:tax'];
    var UORDER = ['u:pension', 'u:medical', 'u:unemp', 'u:injury', 'u:hf', 'u:annuity', 'u:agency'];
    function rankOf(n) {
      if (n.name === 'u:extra') return 0;
      if (n.name.indexOf('inc') === 0) return 10 + (+n.name.slice(3) || 0);
      if (n.name === 'cut') return 30;
      if (n.name === 'gross') return 31;
      if (n.name === 'unit') return 32;
      var di = DORDER.indexOf(n.name); if (di >= 0) return 40 + di;
      if (n.name === 't:net') return 46;
      var ui = UORDER.indexOf(n.name); if (ui >= 0) return 50 + ui;
      return 60 + Math.max(0, ORDER.indexOf(n.name));
    }
    nodes.sort(function (a, b) { return rankOf(a) - rankOf(b); });

    var meta = metaOf(c, r);
    return {
      nodes: nodes,
      links: links,
      meta: meta,
      title: c.name,
      subtitle: meta.city + ' · ' + meta.legal + ' · 税目 ' + meta.tax,
      pctBase: pctBase,
      pctWord: pctWord,
      employerView: !!employerView
    };
  }

  root.LaborBridge = {
    cases: function () { return D.cases; },
    cities: function () { return D.cities; },
    cityList: function () {
      return Object.keys(D.cities).map(function (k) { return D.cities[k]; });
    },
    groups: function () { return D.groups; },
    short: function (c) { return SHORT[c.id] || c.name.slice(0, 3); },
    tint: function (c) { return GROUP_TINT[c.group] || PAL.unit; },
    meta: function () { return D.meta; },
    build: build,
    money: money,
    fmtPct: fmtPct,
    pctOf: pctOf,
    TAX_NAME: TAX_NAME,
    SI_NAME: SI_NAME,
    PAL: PAL
  };
})(window);
