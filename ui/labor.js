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
    fund: '#0ea5e9',
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

  /* 费率 / 税基 / 公式带 —— 数字全部来自引擎结果，阈值全部来自 LaborEngine.tables */
  function pct1(v) { return (v * 100).toFixed(1).replace(/\.0$/, '') + '%'; }
  function bracketOf(t, x) {
    if (!t || !t.length) return null;
    for (var i = 0; i < t.length; i++) if (x <= t[i].cap) return t[i];
    return t[t.length - 1];
  }

  function formulaCtx(c, r) {
    var P = r.p;
    var siBase = r.siBase || 0;
    var siRate = siBase > 0 ? (P.pension + P.medical + P.unemp) / siBase : 0;
    var annRate = ((c.si && c.si.annuity && c.si.annuity.p) || 0) / 100;
    var T = E.tables || {};
    var t = null;
    if (r.taxBaseKind === 'comprehensive') t = bracketOf(T.WAGE_TABLE || [], (r.taxBase || 0) * 12);
    else if (r.taxBaseKind === 'business') t = bracketOf(T.BIZ_TABLE || [], (r.taxBase || 0) * 12);
    return { siRate: siRate, hfRate: r.hfRate, annRate: annRate, quickMonth: t ? (t.quick || 0) / 12 : 0 };
  }

  function formulaOf(c, r) {
    var ctx = formulaCtx(c, r);
    var kind = r.taxBaseKind || 'none';
    var ded = r.deductionsMonthly || 0;
    var P = r.p, ER = r.er || {};
    var gross = r.gross, taxM = P.tax || 0;
    if (kind === 'none') return '个税：未申报（无扣缴）';

    if (kind === 'service') {
      var base = r.taxBase || 0, finBase = r.taxBaseFinal || 0;
      var finM = (r.tax.final || 0) / 12;
      var eff = finBase > 0 ? finM / finBase : 0;
      return '应发 ' + money(gross) + ' × 80% = ' + money(base) + '（并入综合所得）· 预扣 ' + money(taxM) + '/月'
        + '；年度汇算：税基 ' + money(finBase) + ' × ' + pct1(eff) + ' = ' + money(finM) + '/月'
        + (r.tax.refundable > 0.5 ? '，可退 ' + money(r.tax.refundable) : '');
    }

    if (kind === 'business') {
      if (c.tax && c.tax.mode === 'deemed') {
        return '年应发 ' + money(r.annual) + ' × 核定率 ' + pct1(r.taxRate || 0) + ' = 年税 ' + money(r.tax.annual || 0);
      }
      var bizDeduct = (P.si + P.hf + P.annuity) * 12;
      var seg = ['年应发 ' + money(r.annual), '起征点 ' + money(60000)];
      if (bizDeduct > 0.5) seg.push('社保公积金年金 ' + money(bizDeduct));
      if (ded > 0.5) seg.push('专扣 ' + money(ded * 12));
      var bBase = r.taxBase || 0;
      if (bBase <= 0) return seg.join(' − ') + ' = 未达起征点';
      return seg.join(' − ') + ' = 税基 ' + money(bBase * 12) + ' × ' + pct1(r.taxRate || 0)
        + (ctx.quickMonth > 0.5 ? ' − 速算 ' + money(ctx.quickMonth * 12) : '')
        + ' = 年税 ' + money(r.tax.annual || 0);
    }

    /* comprehensive：工资薪金 / 实习劳务 */
    var parts = ['应发 ' + money(gross)];
    if (c.tax && c.tax.type !== 'intern') {
      if (P.si > 0.5) parts.push('社保 ' + money(P.si) + '（基 ' + money(r.siBase) + ' × ' + pct1(ctx.siRate) + '）');
      if (P.hf > 0.5) parts.push('公积金 ' + money(P.hf) + '（基 ' + money(r.hfBase) + ' × ' + pct1(ctx.hfRate) + '）');
      if (P.annuity > 0.5) parts.push('年金 ' + money(P.annuity) + '（基 ' + money(gross) + ' × ' + pct1(ctx.annRate) + '）');
    }
    parts.push('起征点 ' + money(5000));
    if (ded > 0.5) parts.push('专扣 ' + money(ded));
    var head = parts.join(' − ');
    var baseM = r.taxBase || 0;
    if (baseM <= 0) return head + ' = 未达起征点';
    return head + ' = 税基 ' + money(baseM) + ' × ' + pct1(r.taxRate || 0)
      + (ctx.quickMonth > 0.5 ? ' − 速算 ' + money(ctx.quickMonth) : '')
      + ' = 个税 ' + money(taxM);
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

    /* 去向节点的「钱归谁」：颜色编码之外，tooltip 再给一句话 */
    var OWNER = {
      't:net': '归你 · 已到手',
      't:hf': '归你 · 账户锁定，可提取',
      't:pacct': '归你 · 养老个人账户',
      't:med': '归你 · 医保个人账户',
      't:ann': '归你 · 年金账户',
      't:ppool': '进统筹池 · 换取待遇',
      't:medpool': '进统筹池 · 换取待遇',
      't:unemp': '进统筹池 · 换取待遇',
      't:injury': '进统筹池 · 换取待遇',
      't:tax': '进国库 · 个税',
      't:agency': '平台 / 中介拿走',
      't:other': '其他扣缴合计'
    };
    /* 不足 1.2%（且低于 20 元）的落点并进「其他扣缴」，不留无标签的漂浮色块 */
    var tinyThreshold = Math.max(20, pctBase * 0.012);
    var merged = {};
    function target(id, label, color, amount) {
      /* 单位成本视角的统筹池本身就有语义（工伤 0.3% 也得看得见），不参与合并 */
      var keepPool = employerView && /^t:(ppool|medpool|unemp|injury)$/.test(id);
      if (id !== 't:net' && !keepPool && amount < tinyThreshold) {
        merged[id] = true;
        return ['t:other', otherLabel(), otherColor()];
      }
      return [id, label, color];
    }
    function ownerOf(id) { return OWNER[id] || ''; }
    /* 个人视角被并进来的往往只有失业险：那就直接叫「失业统筹」，别用「其他扣缴」糊过去 */
    function otherLabel() {
      var keys = Object.keys(merged);
      return keys.length === 1 && keys[0] === 't:unemp' ? '失业统筹' : '其他扣缴';
    }
    function otherColor() {
      var keys = Object.keys(merged);
      return keys.length === 1 && keys[0] === 't:unemp' ? PAL.pool : PAL.agency;
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
      fill('cut', cutLabel, cut, 2, PAL.agency, 'top');
      flow('cut', 't:agency', cut, PAL.agency);
      sink('t:agency', cutDest, PAL.agency, cut, 3);
    }

    /* ---------- 第 3 列：个人扣缴（社保个人 / 公积金 / 年金 / 个税） ----------
       「基数 × 费率」是引擎内部的一层，做成节点会破坏流量守恒，所以只放在
       节点名（费率）、tooltip 与图上方公式带（基数 / 税基）三处。 */
    var P = r.p;
    var siBase = r.siBase, hfBase = r.hfBase;
    var siRate = siBase > 0 ? (P.pension + P.medical + P.unemp) / siBase : 0;
    var hfRate = r.hfRate;
    var annRate = ((c.si && c.si.annuity && c.si.annuity.p) || 0) / 100;
    var taxBase = r.taxBase || 0, taxRate = r.taxRate || 0;
    var T = E.tables || {};
    var tb = null;
    if (r.taxBaseKind === 'comprehensive') tb = bracketOf(T.WAGE_TABLE || [], taxBase * 12);
    else if (r.taxBaseKind === 'business') tb = bracketOf(T.BIZ_TABLE || [], taxBase * 12);
    var quickMonth = tb ? (tb.quick || 0) / 12 : 0;

    var items = [
      {
        id: 'd:si', label: '社保个人 ' + pct1(siRate), v: P.pension + P.medical + P.unemp,
        base: '基数 ' + money(siBase) + ' × ' + pct1(siRate),
        dests: [['t:pacct', '养老个人账户', PAL.acct, P.pensionAcct],
                /* 统筹是单位缴的钱，个人视角只保留灵活就业「自缴 12%」那一档 */
                ['t:ppool', '养老统筹（自缴 12%）', PAL.pool, P.pensionPool],
                ['t:med', '医疗个人账户', PAL.acct, P.medical],
                ['t:unemp', '失业统筹', PAL.pool, P.unemp]]
      },
      {
        id: 'd:hf', label: '公积金 ' + pct1(hfRate), v: P.hf,
        base: '基数 ' + money(hfBase) + ' × ' + pct1(hfRate),
        dests: [['t:hf', '公积金账户', PAL.acct, P.hf]]
      },
      {
        id: 'd:ann', label: '年金 ' + pct1(annRate), v: P.annuity,
        base: '基数 ' + money(G) + ' × ' + pct1(annRate),
        dests: [['t:ann', '年金账户', PAL.acct, P.annuity]]
      },
      {
        id: 'd:tax', label: '个税', v: P.tax,
        base: '税基 ' + money(taxBase) + ' × ' + pct1(taxRate) + (quickMonth > 0.5 ? ' − 速算 ' + money(quickMonth) : ''),
        dests: [['t:tax', '国库', PAL.tax, P.tax]]
      }
    ];
    items.forEach(function (it) {
      var id = fill(it.id, it.label, it.v, 2, PAL.deduct, 'right');
      if (!id) return;
      nodes[nodes.length - 1].baseNote = it.base;
      flow('gross', id, it.v, PAL.deduct);
      it.dests.forEach(function (d) {
        if (!(d[3] > 0.004)) return;
        var t = target(d[0], d[1], d[2], d[3]);
        flow(id, t[0], d[3], t[2]);
        sink(t[0], t[1], t[2], d[3], 3);
      });
    });

    /* 到手现金：应发的剩余部分。ECharts 5 的 sankey 支持 data[].depth 显式分层
       （已实测），所以这里直接给 3，让它与各项扣缴的落点同在「去向」列。 */
    fill('t:net', '到手现金', r.net, 3, PAL.net, 'right');
    flow('gross', 't:net', r.net, PAL.net);
    sink('t:net', '到手现金', PAL.net, r.net, 3);

    /* ---------- 单位成本支干（只在单位成本视角出现） ---------- */
    var ER = r.er;
    var eTotal = (ER.si || 0) + (ER.hf || 0) + (ER.annuity || 0) + (ER.agency || 0);
    if (employerView && eTotal > 0.004) {
      fill('u:extra', '单位附加成本', eTotal, 0, PAL.unit, 'left');
      fill('unit', '单位缴纳', eTotal, 1, PAL.unit, 'top');
      flow('u:extra', 'unit', eTotal, PAL.unit);

      /* 单位侧也做抽象：社保合成一条粗带（养老/医疗/失业/工伤），公积金、年金各一条。
         五险明细只进 tooltip，避免四条细流从右下穿过个人流带。 */
      var siBaseEr = r.siBase || G;
      var erTip = '养老 ' + money(ER.pension) + ' · 医疗 ' + money(ER.medical) +
                  ' · 失业 ' + money(ER.unemp) + ' · 工伤 ' + money(ER.injury);
      var parts = [
        { id: 'u:si', label: '单位社保 ' + pct1(ER.si / siBaseEr), v: ER.si, tip: erTip,
          dests: [['t:ppool', '养老统筹', PAL.pool, ER.pension],
                  ['t:medpool', '医疗统筹', PAL.pool, ER.medical],
                  ['t:unemp', '失业统筹', PAL.pool, ER.unemp],
                  ['t:injury', '工伤统筹', PAL.pool, ER.injury]] },
        { id: 'u:hf', label: '单位公积金 ' + pct1(r.hfRate || 0), v: ER.hf,
          dests: [['t:hf', '公积金账户', PAL.acct, ER.hf]] },
        { id: 'u:ann', label: '单位年金 ' + pct1(annRate), v: ER.annuity,
          dests: [['t:ann', '年金账户', PAL.acct, ER.annuity]] },
        { id: 'u:agency', label: '中介服务费', v: ER.agency,
          dests: [['t:agency', '平台 / 中介', PAL.agency, ER.agency]] }
      ];
      parts.forEach(function (p) {
        if (!(p.v > 0.004)) return;
        var id = fill(p.id, p.label, p.v, 2, PAL.unit, 'right');
        if (!id) return;
        if (p.tip) nodes[nodes.length - 1].detailNote = p.tip;
        flow('unit', id, p.v, PAL.unit);
        p.dests.forEach(function (d) {
          if (!(d[3] > 0.004)) return;
          var tt = target(d[0], d[1], d[2], d[3]);
          flow(id, tt[0], d[3], tt[2]);
          sink(tt[0], tt[1], tt[2], d[3], 3);
        });
      });
    }

    /* ---------- 去向列（钱归谁：到手 → 账户 → 统筹 → 国库 → 平台） ---------- */
    var ORDER = ['t:net', 't:hf', 't:pacct', 't:med', 't:ann', 't:ppool', 't:medpool', 't:unemp', 't:injury', 't:other', 't:tax', 't:agency'];
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
        if (hit) { hit.value = d.amount; hit.ownerNote = ownerOf(id); hit.pct = pctOf(d.amount, pctBase); hit.pctLine = fmtPct(hit.pct) + ' ' + pctWord + ' · ' + money(d.amount); }
        return;
      }
      var lbl = id === 't:other' ? otherLabel() : d.label;
      var col = id === 't:other' ? otherColor() : d.color;
      if (fill(id, lbl, d.amount, 3, col, 'right')) {
        nodes[nodes.length - 1].ownerNote = id === 't:other'
          ? (lbl === '失业统筹' ? '进统筹池 · 换取待遇' : '其他扣缴合计')
          : ownerOf(id);
      }
    });

    /* ---------- 列内顺序：单位成本支干置顶，其次收入构成；扣缴 / 去向按固定次序 ---------- */
    var DORDER = ['d:si', 'd:hf', 'd:ann', 'd:tax'];
    var UORDER = ['u:si', 'u:hf', 'u:ann', 'u:agency'];
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
      formula: formulaOf(c, r),
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
    metaOf: metaOf,
    formulaOf: formulaOf,
    formulaCtx: formulaCtx,
    build: build,
    money: money,
    fmtPct: fmtPct,
    pctOf: pctOf,
    TAX_NAME: TAX_NAME,
    SI_NAME: SI_NAME,
    PAL: PAL
  };
})(window);
