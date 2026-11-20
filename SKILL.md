---
name: amazon-cpc-kw-builder
description: 从产品 ASIN 和核心流量词筛选同站点的 10 个亚马逊竞品，核验商品页并按 SKU 建档。使用卖家精灵拓展流量词和关键词反查 Excel 建立或增量更新手动商品广告的关键词库、投放计划及前置否词，也用于接续打标批次。
---

# 亚马逊 CPC 关键词库

在本项目根目录运行命令。使用 Codex 桌面端、Node.js 24+、内置 SQLite 和 ExcelJS。首次在项目根目录运行 `npm install`。每个 SKU 的数据库和文件独立存放。后续跑品调用已有脚本。

## 1. 建档与竞品确认

接受裸 ASIN 或 Amazon 商品链接，按[竞品筛选与核验](references/competitor_research.md)从产品画像和 2–3 个种子词出发，收集约 30–50 个候选，筛出约 10–15 个做流量词反查。用同站点搜索或关联流量与购买场景判定竞争关系，逐个打开商品页核对完整 ASIN 及销售子体。

最终目标为 10 个竞品 ASIN，目标商品单独记录。按核心直接、头部标杆、黑马新锐、潜在替代给出证据。仅查竞品时直接交付清单。需要建档时，从 `workspace/_template/product_profile.json` 建立 `workspace/{SKU}/product_profile.json`，依据用户提供的产品、限制和已核实的属性填写卖点、分级词典及红线。按参考文档的字段对应关系写入已确认采用的竞品。

## 2. 人工导出

提示用户在同一站点从卖家精灵导出「拓展流量词」和「关键词反查」，置于 `workspace/{SKU}/raw_exports/`。反查文件只含目标商品及入选竞品时可直接复用，按缺项补导。命名、周期和数据含义见 [字段映射](references/column_mapping_guide.md)。原始表与已编辑作战表用于下一轮导入。

## 3. 导入与预打标

运行 `npm run ingest -- {SKU}`。汇报总词数、规则预拦截数、已分类复用数与待打标批次数。脚本读取上次总库中 `Manual_Lock` 为 TRUE 或「是」的行，锁定后的级别、标准词根、相关性、冲突词根和备注以人工编辑为准。沿用已建立的数据库和批次编号进行增量更新。

## 4. 分批打标与断点接力

结合产品档案和 [语义分级](references/taxonomy_rules.md)，按编号读取 `pending/batch_XX.json`，每批至多 80 词，逐个判断语义并写回 `tagged/batch_XX.json`。每条结果包含 `normalized_keyword`、`zh_meaning`、`level`、`canonical_root`、`relevance`、`conflict_terms`、`reason`。严格复用原词键，数值只作为选样和背景。使用枚举及词根证据，语义不确定时标记「待复核」。格式及示例见分级文档。

超过 8 批时提醒用户可以新开会话，提供 SKU 和项目位置接续。已有合格文件会跳过待打标生成。完成后运行 `npm run validate -- {SKU}`，修复报出的批次错误，直到漏词和格式错误均为 0。对于人工锁定行，批次文件仍按既有清单验证，入库时保留人工结果。

## 5. 导出与抽检

运行 `npm run export -- {SKU}`。核对 [投放策略](references/cpc_strategy_matrix.md) 与输出的六张表。交付 `workspace/{SKU}/output/CPC_词库作战表.xlsx` 和 `keywords_snapshot.json`。汇报各级别词数、两种前置否词数量，每级抽样 5–10 个代表词，少于 5 个时展示该级现有样本。新增源表或回写人工锁定时，从阶段三重新执行。
