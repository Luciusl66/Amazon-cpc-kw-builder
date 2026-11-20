# SellerSprite report field mapping

[简体中文](column_mapping_guide.md) · **English**

| Report | Example filename | ASIN attribution |
| --- | --- | --- |
| Keyword expansion | `extend_30d_2026-11-20.xlsx` | Related-ASIN column, ASIN on each row, or traffic and rank columns that contain an ASIN |
| Reverse ASIN lookup | `reverse_B0TEST0001_history.xlsx` | ASIN in the worksheet first, then the ASIN in the filename |

Use the same SKU and marketplace for both reports. Save the original workbooks under `workspace/{SKU}/raw_exports/`. Each data worksheet needs a header within the first 35 rows. The importer identifies reports from English or Chinese filenames and worksheet names, related ASINs, ASIN-specific columns, and ranking fields. Use the filename patterns above if the report type is unclear. `B0TEST0001` is a sample ASIN.

| Field | Common headers and values |
| --- | --- |
| Keyword | `Keyword`, `Search Term`, `流量词`, `关键词`, `搜索词` |
| ASIN | `ASIN`, `Related ASINs`, `子ASIN`, `相关ASIN` |
| Period and date | `Period`, `Data Date`, `数据周期`, `导出日期`. Period values include `30d` (`近30天`) and `history` (`历史`). |
| Market metrics | `Monthly Search Volume`, `Suggested Bid`, `月搜索量`, `供需比` (supply-to-demand ratio), `点击集中度` (click concentration), `CPC 建议竞价` (suggested CPC bid) |
| Traffic and rankings | `Traffic Share`, `Organic Rank`, `Ad Rank`, `流量占比`, `自然排名`, `广告排名`, `推广类型` (traffic type) |
| ASIN-specific fields | `B0TEST0001 Organic Traffic Share`, `B0TEST0001 流量占比`, `自然排名 (B0TEST0001)` |

The importer accepts percentage strings, Excel percentage cells, and fractions from 0 to 1. An unformatted traffic-share value above 1 is interpreted as a percentage. The suggested bid uses the first number in the source value, with the original value preserved. Missing metrics stay blank. When a row contains only aggregate data, the importer preserves the original values and related ASINs. Metrics that cannot be assigned to a single ASIN stay in the source details as aggregate data. ASIN attribution comes from the input reports. The keyword inventory retains terms with unknown or missing ASIN attribution.

For each keyword, the importer selects one value per market metric. It prioritizes 30-day data, then reports with an unknown period, then historical data. Within the same period, it uses the report date, the date in the filename, or the file modification time. Reverse lookup takes precedence when dates match. Missing fields can be filled from other records in the same priority period. The JSON snapshot lists the source for each metric under `market_sources`.

Coverage counts unique ASINs. A keyword with unknown attribution is ineligible for the similar-products-only flag. Organic top-30 rankings and maximum traffic share use each ASIN’s highest-priority period. The dominant traffic type is determined by comparing the largest available organic and ad traffic shares. Equal values are recorded as a tie. With no shares, a single known traffic type is used. Mixed traffic stays blank when the shares are incomparable.

Source details are deduplicated by `keyword + ASIN + period + traffic type + report type`. A blank period still participates in that key. A newer record can replace an older one with the same key. The retained record keeps the filename, worksheet, row number, and raw fields. Display spelling is based on how often each spelling occurs in the original worksheet rows. Expanding ASINs or splitting traffic records leaves those counts intact. Keep historical workbook copies to trace data that has been replaced.

[SellerSprite keyword expansion guide](https://www.sellersprite.com/v3/knowledge/feature/traffic-extend-for-beginners) · [SellerSprite reverse lookup guide](https://www.sellersprite.com/v3/knowledge/feature/keyword-reverse-for-beginners)
