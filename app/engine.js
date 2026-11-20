/* 劳动收入组成 · 计算引擎
   金额单位：元 / 月；年度税额算完再除以 12。
   口径：
   - 工资薪金：年度综合所得，年终奖默认单独计税（政策至 2027-12-31）
   - 劳务报酬：展示「预扣」，并在 stats 里给年度汇算后的终税与可退金额
   - 经营所得：5 级超额累进，个体户 ≤200 万部分减半（至 2027-12-31）
   - 平台抽成 / MCN 分成 / 包工头抽成：发生在「流水」层面，先扣再形成个人应发 */
(function (root) {
  'use strict';

  var D = root.LABOR_DATA;
  if (!D) throw new Error('data.js 必须先加载');

  var WAGE_TABLE = [
    { cap: 36000, rate: 0.03, quick: 0 },
    { cap: 144000, rate: 0.10, quick: 2520 },
    { cap: 300000, rate: 0.20, quick: 16920 },
    { cap: 420000, rate: 0.25, quick: 31920 },
    { cap: 660000, rate: 0.30, quick: 52920 },
    { cap: 960000, rate: 0.35, quick: 85920 },
    { cap: Infinity, rate: 0.45, quick: 181920 }
  ];
  var BONUS_TABLE = [
    { cap: 3000, rate: 0.03, quick: 0 },
    { cap: 12000, rate: 0.10, quick: 210 },
    { cap: 25000, rate: 0.20, quick: 1410 },
    { cap: 35000, rate: 0.25, quick: 2660 },
    { cap: 55000, rate: 0.30, quick: 4410 },
    { cap: 80000, rate: 0.35, quick: 7160 },
    { cap: Infinity, rate: 0.45, quick: 15160 }
  ];
  var BIZ_TABLE = [
    { cap: 30000, rate: 0.05, quick: 0 },
    { cap: 90000, rate: 0.10, quick: 1500 },
    { cap: 300000, rate: 0.20, quick: 10500 },
    { cap: 500000, rate: 0.30, quick: 40500 },
    { cap: Infinity, rate: 0.35, quick: 65500 }
  ];
  var SERVICE_TABLE = [
    { cap: 20000, rate: 0.20, quick: 0 },
    { cap: 50000, rate: 0.30, quick: 2000 },
    { cap: Infinity, rate: 0.40, quick: 7000 }
  ];

  function bracket(t, x) { for (var i = 0; i < t.length; i++) if (x <= t[i].cap) return t[i]; return t[t.length - 1]; }
  function taxOf(t, x) { if (!(x > 0)) return 0; var b = bracket(t, x); return Math.max(0, x * b.rate - b.quick); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function norm(comp) {
    var s = comp.reduce(function (a, b) { return a + (b || 0); }, 0) || 1;
    return comp.map(function (v) { return (v || 0) / s; });
  }

  function compute(c, o) {
    o = o || {};
    var city = D.cities[o.city] || D.cities.sh;
    var revenue = Math.max(0, o.gross == null ? c.gross : +o.gross);   // 流水 / 应发
    var shares = norm(c.comp);
    var comps = shares.map(function (s, i) {
      return { i: i, label: (c.compLabels && c.compLabels[i]) || D.compLabels[i], value: revenue * s, share: s };   // 月额
    });
    var bonusAnnual = comps[2].value * 12;
    var equityAnnual = comps[5].value * 12;
    var bonusMethod = o.bonusMethod || (c.tax && c.tax.bonus) || 'separate';
    var deductionsMonthly = o.deductions == null ? 3000 : +o.deductions;

    /* ---------- 先扣平台 / 中介 / 包工头 ---------- */
    var ag = (c.si && c.si.agency) || null;
    var agPay = (ag && ag.pay) || 'client';           // client=甲方另付；worker=从流水里扣
    var agPct = (ag && ag.pct) || 0;
    var exPct = (ag && ag.extra && ag.extra.pct) || 0;
    var agencyDeduct = agPay === 'worker' ? revenue * agPct : 0;
    var extraDeduct = agPay === 'worker' ? revenue * exPct : 0;
    var agencyClient = agPay === 'client' ? revenue * agPct : 0;

    var costRatio = (c.tax && c.tax.mode !== 'deemed' && c.tax.costRatio) || 0;
    var extraCost = 0;
    if (costRatio > 0) {
      var needed = revenue * costRatio;
      extraCost = Math.max(0, needed - agencyDeduct - extraDeduct);
    }
    var gross = revenue - agencyDeduct - extraDeduct - extraCost;   // 个人税前应发
    var annual = gross * 12;

    /* ---------- 社保 / 公积金 ---------- */
    var siMode = (c.si && c.si.mode) || 'full';
    var siBase = clamp(gross, city.min, city.max);
    var hfRate = o.fundRate != null ? +o.fundRate : (c.si && c.si.fund != null ? c.si.fund : city.hf);
    var hfBase = clamp(gross, city.hfMin, city.hfMax);
    var annuityP = (c.si && c.si.annuity && c.si.annuity.p) || 0;
    var annuityU = (c.si && c.si.annuity && c.si.annuity.u) || 0;

    var pPension = 0, pMedical = 0, pUnemp = 0, pHf = 0, pAnnuity = 0;
    var pPensionAcct = 0, pPensionPool = 0;   // 8% 入个人账户，其余进统筹
    var ePension = 0, eMedical = 0, eUnemp = 0, eInjury = 0, eHf = 0, eAnnuity = 0;

    if (siMode === 'self') {
      siBase = city.min;                       // 灵活就业多按最低基数自缴（60% 档）
      pPension = siBase * city.self.pension;   // 20%
      pPensionAcct = siBase * 0.08;            // 其中 8% 入个人账户
      pPensionPool = Math.max(0, pPension - pPensionAcct);
      pMedical = siBase * city.self.medical;
    } else if (siMode !== 'none') {
      if (siMode === 'min') siBase = city.min;
      else if (siMode === 'project') siBase = 0;
      else siBase = clamp(gross, city.min, city.max);

      if (siMode === 'full' || siMode === 'min') {
        pPension = siBase * city.p.pension;
        pPensionAcct = pPension;
        pMedical = siBase * city.p.medical + (city.medicalExtra || 0);
        pUnemp = siBase * city.p.unemp;
        ePension = siBase * city.e.pension;
        eMedical = siBase * city.e.medical;
        eUnemp = siBase * city.e.unemp;
        eInjury = siBase * city.e.injury;
        pHf = hfBase * hfRate;
        eHf = hfBase * hfRate;
        pAnnuity = gross * annuityP / 100;
        eAnnuity = gross * annuityU / 100;
      } else if (siMode === 'injury') {
        eInjury = siBase * city.e.injury;
      } else if (siMode === 'project') {
        eInjury = gross * 0.005;
      }
    }

    var personalSi = pPension + pMedical + pUnemp;

    /* ---------- 个税 ---------- */
    var taxType = (c.tax && c.tax.type) || 'wage';
    var withheld = 0, finalTax = 0, taxEquity = 0, taxBonus = 0, refundable = 0;
    /* 对外导出的税基口径（月额）：taxBase 是当前 case 实际走的税基，
       taxBaseFinal 是汇算口径（只有劳务报酬两者不同），taxRate 是命中的档位费率。 */
    var taxBase = 0, taxBaseFinal = 0, taxRate = 0, taxBaseKind = 'none';

    if (taxType === 'none') {
      withheld = finalTax = 0;
      taxBaseKind = 'none';
    } else if (taxType === 'service') {
      if (gross <= 4000) withheld = Math.max(0, gross - 800) * 0.20 * 12;
      else withheld = taxOf(SERVICE_TABLE, gross * 0.8) * 12;
      var svcTaxable = Math.max(0, annual * 0.8 - 60000
        - (personalSi + pHf + pAnnuity) * 12 - deductionsMonthly * 12);
      finalTax = taxOf(WAGE_TABLE, svcTaxable);
      refundable = Math.max(0, withheld - finalTax);
      taxBase = gross * 0.8;                       // 预扣口径：月度收入 × 80%
      taxBaseFinal = svcTaxable / 12;              // 汇算口径：并入综合所得后的月税基
      taxRate = taxBase > 0 ? (withheld / 12) / taxBase : 0;
      taxBaseKind = 'service';
    } else if (taxType === 'intern') {
      var internTaxable = Math.max(0, annual - 60000 - deductionsMonthly * 12);
      withheld = taxOf(WAGE_TABLE, internTaxable);
      finalTax = withheld;
      taxBase = taxBaseFinal = internTaxable / 12;
      taxRate = bracket(WAGE_TABLE, internTaxable).rate;
      taxBaseKind = 'comprehensive';
    } else if (taxType === 'business') {
      if (c.tax.mode === 'deemed') {
        withheld = annual * (c.tax.deemedRate || 0.015);
        taxBase = taxBaseFinal = annual / 12;
        taxRate = c.tax.deemedRate || 0.015;
      } else {
        var bizTaxable = Math.max(0, annual - 60000
          - (personalSi + pHf + pAnnuity) * 12 - deductionsMonthly * 12);
        var bt = taxOf(BIZ_TABLE, bizTaxable);
        if (c.tax.half && bizTaxable <= 2000000) bt *= 0.5;
        withheld = bt;
        taxBase = taxBaseFinal = bizTaxable / 12;
        taxRate = bracket(BIZ_TABLE, bizTaxable).rate;
      }
      finalTax = withheld;
      taxBaseKind = 'business';
    } else {
      var comprehensive = annual - equityAnnual - (bonusMethod === 'separate' ? bonusAnnual : 0);
      var taxable = Math.max(0, comprehensive - 60000
        - (personalSi + pHf + pAnnuity) * 12 - deductionsMonthly * 12);
      var taxWage = taxOf(WAGE_TABLE, taxable);
      if (bonusMethod === 'separate' && bonusAnnual > 0) {
        var bb = bracket(BONUS_TABLE, bonusAnnual / 12);
        taxBonus = Math.max(0, bonusAnnual * bb.rate - bb.quick);
      }
      taxEquity = taxOf(WAGE_TABLE, equityAnnual);
      withheld = taxWage + taxBonus + taxEquity;
      finalTax = withheld;
      taxBase = taxBaseFinal = taxable / 12;
      taxRate = bracket(WAGE_TABLE, taxable).rate;
      taxBaseKind = 'comprehensive';
    }

    /* ---------- 闭合与统计 ---------- */
    var withheldMonthly = withheld / 12;            // 上面算的是年税
    var net = gross - personalSi - pHf - pAnnuity - withheldMonthly;
    var employerSi = ePension + eMedical + eUnemp + eInjury;
    var cost = gross + employerSi + eHf + eAnnuity + agencyClient;  // 用工总成本
    var topLine = revenue;
    var hfMonthly = pHf + eHf;
    var annuityMonthly = pAnnuity + eAnnuity;

    var stats = {
      cashRate: gross > 0 ? net / gross : 0,
      costRate: cost > 0 ? net / cost : 0,
      fullRate: cost > 0 ? (net + hfMonthly + annuityMonthly) / cost : 0,
      taxRate: gross > 0 ? finalTax / annual : 0,
      takeRate: revenue > 0 ? net / revenue : 0,
      multiple: net > 0 ? (agPay === 'worker' ? revenue : cost) / net : 0,
      wedge: gross > 0 ? 1 - net / gross : 0
    };

    return {
      caseId: c.id, city: city, gross: gross, revenue: revenue, annual: annual, agPay: agPay, agPay: agPay,
      comps: comps, bonusAnnual: bonusAnnual, equityAnnual: equityAnnual,
      bonusMethod: bonusMethod, deductionsMonthly: deductionsMonthly,
      siMode: siMode, siBase: siBase, hfRate: hfRate, hfBase: hfBase,
      p: { pension: pPension, pensionAcct: pPensionAcct, pensionPool: pPensionPool,
           medical: pMedical, unemp: pUnemp, hf: pHf, annuity: pAnnuity, si: personalSi, tax: withheldMonthly },
      er: { pension: ePension, medical: eMedical, unemp: eUnemp, injury: eInjury, hf: eHf, annuity: eAnnuity,
            si: employerSi, agency: agencyClient, agencyDeduct: agencyDeduct, extra: extraDeduct + extraCost },
      extraCost: extraCost,
      hfMonthly: hfMonthly, annuityMonthly: annuityMonthly,
      tax: { withheld: withheldMonthly, annual: withheld, final: finalTax, finalMonthly: finalTax / 12,
             refundable: refundable, equity: taxEquity, bonus: taxBonus, kind: taxType },
      taxBase: taxBase, taxBaseFinal: taxBaseFinal, taxRate: taxRate, taxBaseKind: taxBaseKind,
      net: net, cost: cost, topLine: topLine,
      stats: stats
    };
  }

  root.LaborEngine = { compute: compute, tables: { WAGE_TABLE: WAGE_TABLE, BONUS_TABLE: BONUS_TABLE, BIZ_TABLE: BIZ_TABLE } };
})(window);
