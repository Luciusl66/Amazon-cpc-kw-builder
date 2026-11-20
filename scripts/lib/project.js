'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const LEVELS = [
  '0级-泛品类词', '1级-核心大词', '2级-核心属性词',
  '3级-精准细分词', '4级-超级长尾词', 'S级-高意图无核词',
];
const RELEVANCES = ['S-核心精准', 'A-高度相关', 'B-弱相关扩展', 'X-属性冲突', 'P-竞品品牌', '待复核'];
const INVALID = 'X-无效词/ASIN';
const SHEETS = ['CPC_投放计划表', '前置否词清单', '1-4级关键词总库', '词根词频统计', '竞品清单', '来源明细'];
const BOOK = 'CPC_词库作战表.xlsx';
const ASIN = /^[A-Z0-9]{10}$/;
const FIELDS = ['zh_meaning', 'level', 'canonical_root', 'relevance', 'conflict_terms', 'reason'];
const ATTRIBUTES = ['material', 'audience', 'style', 'occasion', 'feature'];

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[‐‑‒–—−]/g, '-')
    .replace(/[^\p{L}\p{N}\p{M}\s'’.\-+/&%]/gu, ' ')
    .replace(/(^|\s)[.'+\-/&%]+(?=\s|$)/g, '$1')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  return normalize(value).match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}.]*/gu) ?? [];
}

function hasPhrase(haystack, needle) {
  const phrase = tokens(needle).join(' ');
  return phrase !== '' && (' ' + tokens(haystack).join(' ') + ' ').includes(' ' + phrase + ' ');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeAtomic(file, content) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, content, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function listFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'en'));
}

function dictionary(value, name, requiredKeys = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(name + ' 必须是分类词典');
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(name + ' 缺少 ' + key);
  }
  for (const [key, terms] of Object.entries(value)) stringList(terms, name + '.' + key);
}

function stringList(values, name) {
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(name + ' 必须是非空字符串组成的数组（可为空数组）');
  }
}

function loadProject(sku) {
  if (typeof sku !== 'string' || !/^[\p{L}\p{N}_-]+(?:[.\p{L}\p{N}_-]*[\p{L}\p{N}_-])?$/u.test(sku)) {
    throw new Error('请提供有效 SKU，例如 npm run ingest -- RING-925');
  }
  const directory = path.resolve(__dirname, '../../workspace', sku);
  const profile = readJson(path.join(directory, 'product_profile.json'));
  if (profile.sku !== sku) throw new Error('档案中的 sku 必须与目录名一致');
  if (!profile.product_info || typeof profile.product_info !== 'object' || Array.isArray(profile.product_info)) {
    throw new Error('product_info 必须是一个对象');
  }
  for (const field of ['core_category_roots', 'compound_modifiers', 'stop_words', 'competitor_brands']) {
    stringList(profile[field], field);
  }
  if (!profile.core_category_roots.length) throw new Error('至少需要一个核心品类词根');
  dictionary(profile.positive_attributes, 'positive_attributes', ATTRIBUTES);
  dictionary(profile.conflict_redlines, 'conflict_redlines');
  for (const term of Object.values(profile.conflict_redlines).flat()) {
    const count = tokens(term).length;
    if (count < 1 || count > 2) throw new Error('红线词必须是 1–2 个词，可拆分填写：' + term);
  }
  stringList(profile.exact_negatives ?? [], 'exact_negatives');
  if (!Array.isArray(profile.competitors)) throw new Error('competitors 必须是数组');
  const seen = new Set();
  for (const item of profile.competitors) {
    if (typeof item?.asin !== 'string' || !ASIN.test(item.asin.trim().toUpperCase()) ||
        !['seed', 'direct', 'similar'].includes(item.tier) ||
        typeof item.variant_note !== 'string' || typeof item.reason !== 'string') {
      throw new Error('竞品须包含有效 ASIN、tier、variant_note 和 reason');
    }
    item.asin = item.asin.trim().toUpperCase();
    if (seen.has(item.asin)) throw new Error('档案包含重复 ASIN：' + item.asin);
    seen.add(item.asin);
  }
  if (profile.competitors.filter(item => item.tier !== 'similar').length > 10 ||
      profile.competitors.filter(item => item.tier === 'similar').length > 3) {
    throw new Error('竞品上限为 10 个核心竞品和 3 个相似品');
  }
  return {
    profile, directory,
    dbFile: path.join(directory, 'keywords.sqlite'),
    raw: path.join(directory, 'raw_exports'),
    pending: path.join(directory, 'pending'),
    tagged: path.join(directory, 'tagged'),
    output: path.join(directory, 'output'),
    book: path.join(directory, 'output', BOOK),
  };
}

function run(main) {
  Promise.resolve().then(() => main(loadProject(process.argv[2]))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  LEVELS, RELEVANCES, INVALID, SHEETS, BOOK, ASIN, FIELDS,
  normalize, tokens, hasPhrase, readJson, writeAtomic, listFiles, loadProject, run,
};
