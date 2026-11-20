// 口径自检：跑遍所有案例 × 6 城 × 3 档收入，检查流量闭合与合理性
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const src = fs.readFileSync(path.join(dir, '..', 'app', 'data.js'), 'utf8') +
            fs.readFileSync(path.join(dir, '..', 'app', 'engine.js'), 'utf8');
const win = {};
new Function('window', 'document', src)(win, {});
const D = win.LABOR_DATA, E = win.LaborEngine;
if (!D || !E) throw new Error('数据或引擎未加载');

let fails = [], n = 0, maxErr = 0;
const eq = (a, b, tol = 0.02) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 1e-9);

for (const c of D.cases) {
  for (const city of Object.keys(D.cities)) {
    for (const mult of [0.7, 1, 1.35, 1.8]) {
      const gross = Math.round(c.gross * mult);
      let r;
      try { r = E.compute(c, { gross, city, deductions: 3000 }); }
      catch (e) { fails.push(`${c.id}/${city}/${gross} 抛错 ${e.message}`); continue; }
      n++;
      const tag = `${c.id}/${city}/${gross}`;
      const p = r.p, er = r.er;

      // 1. 现金：应发 − 个人五险一金 − 个税 = 到手
      const ded = p.pension + p.medical + p.unemp + p.hf + p.annuity + r.tax.withheld;
      const gap = r.gross - ded - r.net;
      maxErr = Math.max(maxErr, Math.abs(gap));
      if (!eq(r.gross, ded + r.net)) fails.push(`${tag} 现金流不闭合 gap=${gap.toFixed(2)}`);

      // 2. 成本：应发 + 单位缴费 + 管理费 = 总成本
      if (!eq(r.cost, r.gross + er.si + er.hf + er.annuity + er.agency))
        fails.push(`${tag} 成本不闭合 ${r.cost} vs ${r.gross + er.si + er.hf + er.annuity + er.agency}`);

      // 3. 流水：应发 + 抽成 + 经营成本 = 流水
      if (!eq(r.revenue, r.gross + (er.agencyDeduct || 0) + (er.extra || 0)))
        fails.push(`${tag} 流水不闭合 ${r.revenue} vs ${r.gross}+${er.agencyDeduct}+${er.extra}`);

      // 4. 非负 + 合理
      for (const k of ['gross', 'net', 'cost', 'revenue']) if (!(r[k] >= 0)) fails.push(`${tag} ${k}<0`);
      if (r.net > r.gross + 0.01) fails.push(`${tag} 到手 > 应发`);
      if (r.cost < r.gross - 0.01) fails.push(`${tag} 成本 < 应发`);
      if (r.net <= 0) fails.push(`${tag} 到手 <= 0`);
      if (r.tax.final < -0.5) fails.push(`${tag} 税额为负 ${r.tax.final}`);
      if (r.tax.withheld < -0.5) fails.push(`${tag} 预扣为负`);

      // 5. 社保基数在区间内
      if (r.siBase != null && p.pension + p.medical > 0) {
        const base = r.siBase;
        const lo = D.cities[city].min, hi = D.cities[city].max;
        if (base < lo - 1 || base > hi + 1) fails.push(`${tag} 社保基数越界 ${base} ∈ [${lo},${hi}]`);
      }

      // 6. 各组应发不应失真（相对案例基准 ±80% 以外说明逻辑异常）
      if (r.gross > c.gross * 3.2 + 1000) fails.push(`${tag} 应发异常膨胀 ${r.gross}`);
    }
  }
}

// 特别核对：公务员 / 大厂 / 骑手 / 设计师 / 主播 五档
const spot = ['gov-civil', 'bigtech', 'rider', 'freelance', 'streamer'];
console.log('\n—— 抽样 ——');
for (const id of spot) {
  const c = D.cases.find(x => x.id === id);
  if (!c) { console.log('缺少案例', id); continue; }
  const r = E.compute(c, { gross: c.gross, city: 'sh', deductions: 3000 });
  console.log(`${c.name.padEnd(8)} 应发${String(Math.round(r.gross)).padStart(7)} 到手${String(Math.round(r.net)).padStart(7)} 成本${String(Math.round(r.cost)).padStart(7)} 倍${r.stats.multiple.toFixed(2)} 税${Math.round(r.tax.final)} ${r.tax.kind}`);
}

console.log(`\n检查 ${n} 组，最大闭合误差 ${maxErr.toFixed(4)} 元`);
if (fails.length) {
  console.log(`❌ ${fails.length} 处问题：`);
  [...new Set(fails)].slice(0, 40).forEach(f => console.log('  ' + f));
  process.exit(1);
} else console.log('✅ 全部通过');
