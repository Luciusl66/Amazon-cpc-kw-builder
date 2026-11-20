'use strict';

const { hasPhrase, normalize, tokens, LEVELS, INVALID } = require('./project');

function ruleTag(keyword, profile, displayKeyword = keyword) {
  const letters = keyword.match(/\p{L}/gu) ?? [];
  const invalid = /^b0[a-z0-9]{8}$/i.test(keyword) || letters.length === 0 ||
    displayKeyword.includes('\uFFFD') || /^(.)\1{5,}$/u.test(keyword);
  const brands = profile.competitor_brands.filter(term => hasPhrase(keyword, term));
  const conflicts = [...new Set(Object.values(profile.conflict_redlines).flat()
    .filter(term => hasPhrase(keyword, term)).map(term => tokens(term).join(' ')))];
  const base = {
    normalized_keyword: keyword, level: null, canonical_root: normalize(keyword) || keyword,
    zh_meaning: '', conflict_terms: [],
  };
  if (invalid) return { ...base, relevance: INVALID, reason: '纯 ASIN 或无效字符' };
  if (brands.length) return { ...base, relevance: 'P-竞品品牌', reason: '竞品品牌：' + brands.join('、') };
  if (conflicts.length) {
    return { ...base, relevance: 'X-属性冲突', conflict_terms: conflicts, reason: '产品档案红线' };
  }
  return null;
}

function classified(row) {
  if (row.manual_lock) return true;
  if (['P-竞品品牌', 'X-属性冲突', INVALID].includes(row.relevance)) return true;
  return LEVELS.includes(row.level) && ['S-核心精准', 'A-高度相关', 'B-弱相关扩展', '待复核'].includes(row.relevance);
}

module.exports = { ruleTag, classified };
