# CPC strategy for manual campaigns

[简体中文](cpc_strategy_matrix.md) · **English**

The campaign plan includes S- and A-relevance terms whose similar-products-only flag is off. Queries listed as exact negatives in the product profile are excluded. For level 1, the high-coverage threshold is 60%. Coverage is calculated against the total number of seed and direct competitor ASINs in the profile. Level 1 terms with unknown coverage go into monitoring campaigns.

| Keyword level | Campaign structure | Match type | Purpose |
| --- | --- | --- | --- |
| Level 1 with coverage of 60% or more | Dedicated campaign per keyword | Exact | Monitor performance and control launch spend |
| Level 1 with coverage below 60% or unknown | Shared monitoring campaign, grouped by keyword root | Exact | Monitor performance and control spend |
| Level 2 | Group by keyword root and use separate exact and phrase campaigns | Exact, Phrase | Apply the initial negatives to phrase campaigns |
| Level 3 | Group by canonical root | Exact | Drive orders for new products with precise terms |
| Level 4 and S | Keep long-tail terms and high-intent terms without the core product term in separate campaigns | Exact | Capture additional traffic with lower bids |
| Level 0 and other relevance values | Retain terms in the keyword inventory | | |

The campaign plan sorts keywords by monthly search volume. Volume of 10,000 or more is high, 1,000–9,999 is medium, and below 1,000 is low. Missing volume is marked unknown. Suggested CPC bids come from the market report. The lower-bid approach for long-tail terms is a strategy note.

Section A of the initial negative keyword sheet deduplicates conflict terms and sorts them by the combined monthly search volume of the queries they affect. Section B contains full brand terms and exact exclusions for ambiguous queries from the product profile. When the profile calls for exact exclusion of a conflicting query, use the complete query as Negative Exact. Review the negatives against the scope of each campaign before applying them.

Trend labels compare effective search volume between runs with the same reporting period. A change of at least 20% is marked `TREND_UP` or `TREND_DOWN`. A keyword’s first appearance is `NEW`, and other aggregate changes are `EXISTING`. Re-importing identical data preserves the existing status.
