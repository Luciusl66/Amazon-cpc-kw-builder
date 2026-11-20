---
name: amazon-cpc-kw-builder
description: 提供种子 ASIN 或 Amazon 商品链接即可自动读取商品页、生成本地 SKU 档案并筛选同站点竞品。使用卖家精灵拓展流量词和关键词反查 Excel 建立或增量更新手动商品广告的关键词库、投放计划及前置否词，也用于接续打标批次。
---

# 亚马逊 CPC 关键词库

在本项目根目录运行命令。使用 Codex 桌面端、Node.js 24+、内置 SQLite 和 ExcelJS。首次在项目根目录运行 `npm install`。每个 SKU 的数据库和文件独立存放。后续跑品调用已有脚本。

## 1. 建档与竞品确认

**新建产品从种子 ASIN 开始。** 收到裸 ASIN 或 Amazon 商品链接时，直接读取目标站点的商品页。用户提供 SKU 时使用该 SKU，否则先查找同站点同 ASIN 的已有档案，再以 ASIN 作为默认 SKU。同一个默认目录已用于其他站点时，加上站点后缀。已有档案保留人工填写字段，并合并本次核验结果。用户明确只查竞品时直接执行调研并返回清单。

**抓取后自动建档。** 核对 ASIN、所选变体和品类，提取标题、品牌、卖点、材质、规格、人群、使用场景和售价等可见信息。用 `workspace/_template/product_profile.json` 的结构生成 `workspace/{SKU}/product_profile.json`，根据已核实的商品信息生成核心词根、复合修饰词与正向属性，按明确的产品限制填写红线。记录种子 ASIN、商品页链接和核验日期，未知属性留空。目标商品身份或核心品类证据不足时，将已取得的内容保存为 `product_profile.draft.json` 并说明缺项。用户无需复制或填写模板。

**继续查找竞品。** 从产品画像提炼 2–3 个种子词，按[竞品筛选与核验](references/competitor_research.md)收集同站点候选，逐个打开商品页核对商品和销售子体，再用同周期反查验证竞争关系。目标为 10 个竞品，种子 ASIN 单独记录。按参考文档将符合证据要求的竞品写入 `competitors`。反查数据缺失时，先保留产品档案，待反查候选记在研究记录中并注明尚缺的证据。

## 2. 人工导出

提示用户在同一站点从卖家精灵导出「拓展流量词」和「关键词反查」，置于 `workspace/{SKU}/raw_exports/`。反查文件只含目标商品及入选竞品时可直接复用，按缺项补导。命名、周期和数据含义见 [字段映射](references/column_mapping_guide.md)。原始表与已编辑作战表用于下一轮导入。

## 3. 导入与预打标

运行 `npm run ingest -- {SKU}`。汇报总词数、规则预拦截数、已分类复用数与待打标批次数。脚本读取上次总库中 `Manual_Lock` 为 TRUE 或「是」的行，锁定后的级别、标准词根、相关性、冲突词根和备注以人工编辑为准。沿用已建立的数据库和批次编号进行增量更新。

## 4. 分批打标与断点接力

结合产品档案和 [语义分级](references/taxonomy_rules.md)，按编号读取 `pending/batch_XX.json`，每批至多 80 词，逐个判断语义并写回 `tagged/batch_XX.json`。每条结果包含 `normalized_keyword`、`zh_meaning`、`level`、`canonical_root`、`relevance`、`conflict_terms`、`reason`。严格复用原词键，数值只作为选样和背景。使用枚举及词根证据，语义不确定时标记「待复核」。格式及示例见分级文档。

超过 8 批时提醒用户可以新开会话，提供 SKU 和项目位置接续。已有合格文件会跳过待打标生成。完成后运行 `npm run validate -- {SKU}`，修复报出的批次错误，直到漏词和格式错误均为 0。对于人工锁定行，批次文件仍按既有清单验证，入库时保留人工结果。

## 5. 导出与抽检

运行 `npm run export -- {SKU}`。核对 [投放策略](references/cpc_strategy_matrix.md) 与输出的六张表。交付 `workspace/{SKU}/output/CPC_词库作战表.xlsx` 和 `keywords_snapshot.json`。汇报各级别词数、两种前置否词数量，每级抽样 5–10 个代表词，少于 5 个时展示该级现有样本。新增源表或回写人工锁定时，从阶段三重新执行。
