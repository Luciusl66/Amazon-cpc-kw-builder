'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Excel = require('exceljs');
const { normalize } = require('./project');

const HEADER = {
  keyword: ['关键词', '流量词', '搜索词', '搜索关键词', '反查关键词', '关键词(英文)', 'keyword', 'keywords', 'search term', 'traffic keyword'],
  asin: ['asin', '子asin', '产品asin', '竞品asin', '商品asin', 'product asin', 'child asin'],
  related: ['相关asin', '关联asin', '覆盖asin', '来源asin', '包含asin', 'related asins', 'associated asins', 'asins'],
  period: ['数据周期', '周期', '时间范围', 'period', 'data period', 'time range'],
  date: ['数据日期', '导出日期', '统计日期', 'data date', 'export date', 'snapshot date'],
  market: ['站点', '市场', 'marketplace', 'market', 'site'],
  volume: ['市场月搜索量', '月搜索量', '月均搜索量', '月搜索次数', 'monthly search volume', 'search volume', 'monthly searches'],
  ratio: ['供需比', '供求比', 'supply demand ratio', 'demand supply ratio'],
  concentration: ['点击集中度', 'top3点击集中度', 'click concentration', 'top 3 click share'],
  bid: ['cpc建议竞价', '建议竞价', '建议出价', '竞价', 'cpc bid', 'suggested bid', 'recommended bid', 'bid'],
  organic_rank: ['自然排名', '自然搜索排名', '自然位排名', 'organic rank', 'organic ranking', 'organic position'],
  ad_rank: ['广告排名', '广告位排名', 'sp广告排名', 'sp排名', 'ad rank', 'ad ranking', 'sponsored rank', 'sponsored position', 'sp rank'],
  traffic_share: ['流量占比', '流量比例', '曝光占比', 'asin流量占比', 'traffic share', 'traffic percentage', 'traffic ratio'],
  organic_share: ['自然流量占比', '自然曝光比例', '自然曝光占比', 'organic traffic share', 'organic share'],
  ad_share: ['广告流量占比', '广告曝光比例', '广告曝光占比', 'sp广告流量占比', 'ad traffic share', 'ad share', 'sponsored traffic share'],
  traffic_type: ['流量类型', '推广类型', '来源类型', '流量来源', 'traffic type', 'promotion type', 'traffic source'],
};

function headerKey(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[pc]pc/g, 'cpc')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
const aliases = new Map(Object.entries(HEADER).flatMap(([field, values]) =>
  values.map(value => [headerKey(value), field])));

function scalar(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return value.result ?? value.text ?? value.richText?.map(part => part.text).join('') ?? null;
  }
  return value ?? null;
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').normalize('NFKC').replace(/,/g, '')
    .match(/-?(?:\d+(?:\.\d+)?|\.\d+)\s*[kKmM万亿]?/);
  if (!match) return null;
  const matchText = match[0].trim();
  const multiplier = { k: 1e3, m: 1e6, 万: 1e4, 亿: 1e8 }[matchText.slice(-1).toLowerCase()] ?? 1;
  const result = parseFloat(matchText) * multiplier;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function percentage(cell) {
  const value = scalar(cell.value);
  const parsed = numeric(value);
  if (parsed === null) return null;
  const percentText = typeof value === 'string' && value.normalize('NFKC').includes('%');
  const excelPercent = typeof value === 'number' && cell.numFmt?.includes('%');
  const ratio = percentText || (!excelPercent && parsed > 1) ? parsed / 100 : parsed;
  return ratio <= 1 ? ratio : null;
}

function rank(value) {
  const result = numeric(value);
  return result > 0 && Number.isInteger(result) ? result : null;
}

function asinTokens(value) {
  const candidates = String(value ?? '').toUpperCase().match(/(?<![A-Z0-9])[A-Z0-9]{10}(?![A-Z0-9])/g) ?? [];
  return [...new Set(candidates.filter(candidate => /\d/.test(candidate)))];
}

function sourcePeriod(value) {
  const text = String(value ?? '').normalize('NFKC');
  if (/近\s*30\s*天|最近\s*30\s*天|30[\s_-]*(?:days?(?![a-z0-9])|d(?![a-z0-9])|天)/i.test(text)) return '30d';
  if (/history|historical|历史/i.test(text)) return 'history';
  return null;
}

function reportFromName(value) {
  if (/extend|拓展/i.test(value)) return 'extend';
  if (/reverse|反查/i.test(value)) return 'reverse';
  return null;
}

function parseMarket(value) {
  const key = headerKey(value);
  const markets = new Map([
    ['us', 'US'], ['usa', 'US'], ['美国', 'US'], ['美国站', 'US'], ['amazoncom', 'US'],
    ['uk', 'UK'], ['gb', 'UK'], ['英国', 'UK'], ['英国站', 'UK'], ['amazoncouk', 'UK'],
    ['de', 'DE'], ['德国', 'DE'], ['德国站', 'DE'], ['fr', 'FR'], ['法国', 'FR'],
    ['it', 'IT'], ['意大利', 'IT'], ['es', 'ES'], ['西班牙', 'ES'],
    ['jp', 'JP'], ['日本', 'JP'], ['ca', 'CA'], ['加拿大', 'CA'], ['au', 'AU'], ['澳大利亚', 'AU'],
  ]);
  return markets.get(key) ?? (key ? String(value).trim().toUpperCase() : null);
}

function dateOf(value, fallback) {
  const match = String(value ?? '').match(/(?<!\d)(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?!\d)/);
  if (!match) return fallback;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
    ? date.getTime() : fallback;
}

function inspectHeader(row) {
  const common = new Map();
  const byAsin = new Map();
  const originals = [];
  row.eachCell((cell, index) => {
    const label = scalar(cell.value);
    if (!label) return;
    originals.push({ index, label: String(label) });
    const plain = aliases.get(headerKey(label));
    if (plain && !common.has(plain)) common.set(plain, index);
    const [asin] = asinTokens(label);
    if (!asin) return;
    const field = aliases.get(headerKey(String(label).replace(new RegExp(asin, 'ig'), '')));
    if (!['organic_rank', 'ad_rank', 'traffic_share', 'organic_share', 'ad_share', 'traffic_type'].includes(field)) return;
    if (!byAsin.has(asin)) byAsin.set(asin, new Map());
    if (!byAsin.get(asin).has(field)) byAsin.get(asin).set(field, index);
  });
  return { common, byAsin, originals };
}

function chooseHeader(sheet) {
  let header;
  for (let number = 1; number <= Math.min(sheet.rowCount, 35); number++) {
    const candidate = inspectHeader(sheet.getRow(number));
    if (!candidate.common.has('keyword')) continue;
    const score = candidate.common.size + candidate.byAsin.size;
    if (!header || score > header.score) header = { ...candidate, score, number };
  }
  return header;
}

function readTraffic(row, columns) {
  const getCell = field => row.getCell(columns.get(field) ?? 1);
  const value = field => columns.has(field) ? scalar(getCell(field).value) : null;
  const share = field => columns.has(field) ? percentage(getCell(field)) : null;
  return {
    organic_rank: rank(value('organic_rank')), ad_rank: rank(value('ad_rank')),
    traffic_share: share('traffic_share'), organic_share: share('organic_share'), ad_share: share('ad_share'),
    traffic_type: value('traffic_type'),
  };
}

function trafficLabel(value) {
  const text = String(value ?? '');
  const organic = /自然|organic/i.test(text);
  const ad = /广告|sponsored|\bad(?:s)?\b|\bsp\b/i.test(text);
  return organic && ad ? 'mixed' : organic ? 'organic' : ad ? 'ad' : 'unknown';
}

function trafficRows(metrics) {
  const { organic_share, ad_share, ...result } = metrics;
  if (organic_share !== null || ad_share !== null) {
    const out = [];
    if (organic_share !== null || result.organic_rank !== null) {
      out.push({ ...result, ad_rank: null, traffic_share: organic_share, traffic_type: 'organic' });
    }
    if (ad_share !== null || result.ad_rank !== null) {
      out.push({ ...result, organic_rank: null, traffic_share: ad_share, traffic_type: 'ad' });
    }
    if (result.traffic_share !== null) out.push({ ...result, traffic_type: 'mixed' });
    return out;
  }
  let type = trafficLabel(result.traffic_type);
  if (type === 'unknown') {
    const organic = result.organic_rank !== null;
    const ad = result.ad_rank !== null;
    type = organic && ad ? 'mixed' : organic ? 'organic' : ad ? 'ad' : 'unknown';
  }
  return [{ ...result, traffic_type: type }];
}

const populated = metrics => Object.values(metrics).some(value => value !== null && value !== '');
const EMPTY_TRAFFIC = readTraffic(null, new Map());
const readCell = (row, map, key) => map.has(key) ? scalar(row.getCell(map.get(key)).value) : null;

async function readWorkbook(file, profile) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(file);
  const fileName = path.basename(file);
  const mtime = fs.statSync(file).mtimeMs;
  const rows = [];
  const warnings = [];
  let recognized = 0;
  for (const sheet of workbook.worksheets) {
    const header = chooseHeader(sheet);
    if (!header) continue;
    const { common, byAsin, originals, number } = header;
    const report = reportFromName(fileName) ?? reportFromName(sheet.name) ??
      (byAsin.size || common.has('related') ? 'extend' :
        common.has('asin') || common.has('organic_rank') || common.has('ad_rank') ? 'reverse' : null);
    if (!report) {
      warnings.push(fileName + ' / ' + sheet.name + '：表头不足以识别报表类型，请按约定命名');
      continue;
    }
    recognized++;
    const [fileAsin] = report === 'reverse'
      ? (fileName.match(/reverse[_\s-]+([A-Z0-9]{10})(?=[_.\s-])/i)?.slice(1).map(item => item.toUpperCase()) ??
        asinTokens(fileName.replace(/_/g, ' '))) : [];
    let unassigned = 0;
    sheet.eachRow((row, index) => {
      if (index <= number) return;
      const value = key => readCell(row, common, key);
      const display = String(value('keyword') ?? '').trim().replace(/\s+/g, ' ');
      if (!display || (aliases.get(headerKey(display)) === "keyword" && inspectHeader(row).common.size > 1)) return;
      const key = normalize(display) || display.normalize('NFKC').toLowerCase();
      const market = parseMarket(value('market'));
      const expectedMarket = parseMarket(profile.product_info.marketplace);
      if (market && expectedMarket && market !== expectedMarket) {
        throw new Error(fileName + ' / ' + sheet.name + ' 第 ' + index + ' 行站点与产品档案不一致');
      }
      const shared = {
        normalized_keyword: key, display_keyword: display,
        data_period: sourcePeriod(value('period')) ?? sourcePeriod(fileName + ' ' + sheet.name),
        report_type: report, market,
        observed_at: dateOf(value('date'), dateOf(fileName, mtime)),
        market_monthly_search_volume: numeric(value('volume')),
        supply_demand_ratio: numeric(value('ratio')),
        click_concentration: common.has('concentration') ? percentage(row.getCell(common.get('concentration'))) : null,
        cpc_suggested_bid: numeric(value('bid')),
        source_file: fileName, source_sheet: sheet.name, source_row: index,
        raw_json: JSON.stringify(originals.map(({ index: column, label }) => [label, scalar(row.getCell(column).value)])),
      };
      const combined = readTraffic(row, common);
      const byRow = new Map();
      for (const asin of asinTokens(value('related'))) byRow.set(asin, EMPTY_TRAFFIC);
      for (const [asin, columns] of byAsin) {
        const metrics = readTraffic(row, columns);
        if (populated(metrics)) byRow.set(asin, metrics);
      }
      const explicit = asinTokens(value('asin'));
      const owner = explicit.length === 1 ? explicit[0] : report === 'reverse' ? fileAsin : null;
      for (const asin of explicit) if (!byRow.has(asin)) byRow.set(asin, EMPTY_TRAFFIC);
      if (owner || byRow.size === 1) {
        const asin = owner ?? byRow.keys().next().value;
        const ownMetrics = byRow.get(asin) ?? EMPTY_TRAFFIC;
        byRow.set(asin, Object.fromEntries(Object.keys(combined).map(field => [field, ownMetrics[field] ?? combined[field]])));
      } else if (!byRow.size || populated(combined)) {
        byRow.set('', combined);
      }
      if (!byRow.size || (byRow.size === 1 && byRow.has(''))) unassigned++;
      for (const [asin, metrics] of byRow) {
        for (const traffic of trafficRows(metrics)) rows.push({ ...shared, asin, ...traffic });
      }
    });
    if (unassigned) warnings.push(fileName + ' / ' + sheet.name + '：' + unassigned + ' 行无 ASIN，保留为汇总行');
  }
  if (!recognized) throw new Error(fileName + ' 未找到可识别的拓展/反查数据表，请查阅列名映射指南');
  return { rows, warnings };
}

module.exports = { readWorkbook };
