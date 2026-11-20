'use strict';

const fs = require('node:fs');
const Excel = require('exceljs');
const { SHEETS, LEVELS, RELEVANCES, INVALID, normalize } = require('./project');
const { conflictTerms } = require('./batches');

async function manualLocks(file) {
  if (!fs.existsSync(file)) return [];
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet(SHEETS[2]);
  if (!sheet) throw new Error('现有作战表缺少 ' + SHEETS[2] + '，无法安全回写人工锁定');
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, index) => headers.set(cell.text.trim(), index));
  const required = ['关键词', '级别', '标准词根', '相关性', '冲突词根', '备注', 'Manual_Lock'];
  for (const name of required) if (!headers.has(name)) throw new Error('总库缺少回写字段：' + name);
  const tags = new Map();
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const text = label => headers.has(label) ? row.getCell(headers.get(label)).text.trim() : '';
    if (!/^(true|是)$/i.test(text('Manual_Lock'))) return;
    const keyword = text('标准化关键词') || normalize(text('关键词')) || text('关键词').normalize('NFKC').toLowerCase();
    if (!keyword || tags.has(keyword)) throw new Error('总库中的锁定行关键词为空或重复，第 ' + number + ' 行');
    try {
      const level = text('级别') || null;
      const relevance = text('相关性');
      if ((level && !LEVELS.includes(level)) || ![...RELEVANCES, INVALID].includes(relevance)) {
        throw new Error('级别或相关性值无效');
      }
      const input = text('冲突词根');
      const terms = input.startsWith('[') ? JSON.parse(input) : input.split(/[,，、;；\n]/).map(term => term.trim()).filter(Boolean);
      const conflicts = conflictTerms(keyword, terms, true);
      if (relevance === 'X-属性冲突' && !conflicts.length) throw new Error('属性冲突词须填写冲突词根');
      tags.set(keyword, {
        normalized_keyword: keyword, level, canonical_root: text('标准词根') || null,
        relevance, conflict_terms: conflicts, notes: text('备注'),
      });
    } catch (error) {
      throw new Error('总库锁定行 ' + number + '：' + error.message);
    }
  });
  return [...tags.values()];
}

module.exports = { manualLocks };
