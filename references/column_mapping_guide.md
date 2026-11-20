# 卖家精灵导出字段映射

**简体中文** · [English](column_mapping_guide.en.md)

| 类型 | 文件名示例 | 归属识别 |
| --- | --- | --- |
| 拓展流量词 | `extend_30d_2026-11-20.xlsx` | 相关 ASIN 列、逐行 ASIN 或含 ASIN 的流量/排名列 |
| 关键词反查 | `reverse_B0TEST0001_history.xlsx` | 表内 ASIN 优先，文件名其次 |

统一 SKU 和站点，原表置于 `workspace/{SKU}/raw_exports/`。每个有效数据工作表在前 35 行以内包含表头即可。中文或英文文件名、工作表名以及相关 ASIN、ASIN 专属列和排名列用于识别报表。无法确认报表类型时可按上表命名。

| 指标 | 常见表头 |
| --- | --- |
| 关键词 | 流量词、关键词、搜索词、Keyword、Search Term |
| ASIN | ASIN、子ASIN、相关ASIN、Related ASINs |
| 周期与日期 | 数据周期、Period、导出日期、Data Date；近30天 / 30d、历史 / history |
| 市场指标 | 月搜索量、Monthly Search Volume、供需比、点击集中度、CPC 建议竞价、Suggested Bid |
| 流量及排名 | 流量占比、Traffic Share、自然排名、Organic Rank、广告排名、Ad Rank、推广类型 |
| ASIN 专属列 | B0TEST0001 流量占比、自然排名 (B0TEST0001)、B0TEST0001 Organic Traffic Share |

百分数支持文本百分号、实际 Excel 百分比单元格以及 0–1 的比例数值。无格式且大于 1 的占比数字视为百分数。建议竞价取来源给出的首个数值，原始内容保留。空指标留空。只有汇总信息的行保留原始值及关联 ASIN，无法归属单一 ASIN 的指标保留为汇总明细。ASIN 确认依据仅来自来源表；未归属或未知 ASIN 的词保留总库。

市场指标逐字段取一个值。优先顺序为近30天、未知周期、历史，同周期按数据日期、文件名内日期或文件修改时间判新旧，同日优先反查。单个关键词的市场指标在同一优先周期中补足缺字段，同一指标保留一个值。可在 JSON 快照的 `market_sources` 追溯每项来源。覆盖数按 ASIN 去重，含未知来源的词不标为仅相似品。自然前 30 与最大占比按各 ASIN 优先周期判断。自然和广告主导按已知类别的最大流量占比比较，同值记并列；缺少占比且只有一种明确类别时使用该类别。混合流量又没有可比分项时留空。

来源明细使用 `关键词 + ASIN + 周期 + 流量类型 + 报表类型` 去重，空周期也参与唯一键。较新记录更新同键，保留原始文件名、工作表、行号与原始字段。展示写法按原表内实际行数选最高频，ASIN 展开和流量拆行不增加频次。请备份历史原始文件，以便追溯同一键被更新前的版本。

[卖家精灵拓展流量词](https://www.sellersprite.com/v3/knowledge/feature/traffic-extend-for-beginners) · [卖家精灵关键词反查](https://www.sellersprite.com/v3/knowledge/feature/keyword-reverse-for-beginners)
