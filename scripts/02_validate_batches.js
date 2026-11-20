'use strict';

const path = require('node:path');
const { run, listFiles } = require('./lib/project');
const { openDb, transaction, writeTag } = require('./lib/db');
const { manifests, validateFile, publishPending } = require('./lib/batches');
const { classified } = require('./lib/rule_pretagger');

run(async project => {
  const db = openDb(project.dbFile);
  try {
    const result = await transaction(db, () => {
      const expected = manifests(db);
      const files = new Set(listFiles(project.tagged, /\.json$/i));
      const errors = [...files].filter(name => !expected.has(name)).map(name => name + '：不存在对应批次');
      const prior = new Map(db.prepare('SELECT * FROM batch_runs').all().map(row => [row.batch_number, row.content_hash]));
      const accepted = [];
      for (const [name, manifest] of expected) {
        if (!files.has(name)) {
          if (!prior.has(manifest.id) && !manifest.rows.every(row => row.manual_lock)) {
            errors.push(name + '：缺少打标文件');
          }
          continue;
        }
        try {
          accepted.push({ id: manifest.id, ...validateFile(path.join(project.tagged, name), manifest) });
        } catch (error) {
          errors.push(name + '：\n' + error.message);
        }
      }
      if (errors.length) throw new Error('打标校验未通过：\n' + errors.join('\n'));

      const save = db.prepare(`
        INSERT INTO batch_runs VALUES (?, ?, ?) ON CONFLICT(batch_number)
        DO UPDATE SET validated_at = excluded.validated_at, content_hash = excluded.content_hash
      `);
      const now = new Date().toISOString();
      const source = db.prepare('SELECT tag_source FROM keywords_master WHERE normalized_keyword = ?');
      let updated = 0;
      for (const { id, hash, tags } of accepted) {
        if (prior.get(id) === hash) continue;
        for (const tag of tags) {
          if (source.get(tag.normalized_keyword)?.tag_source !== 'rule') updated += writeTag(db, tag, 'ai', now);
        }
        save.run(id, now, hash);
      }
      const missing = db.prepare('SELECT * FROM keywords_master').all().filter(row => !classified(row));
      if (missing.length) throw new Error('还有 ' + missing.length + ' 个词缺少有效分类，请重跑导入并完成待打标批次');
      return { 本次批次校验数: accepted.length, 已入库分类数: updated, 漏词数: 0, 格式错误数: 0 };
    });
    await transaction(db, () => publishPending(project, db));
    console.log(JSON.stringify(result));
  } finally {
    db.close();
  }
});
