# Keyword classification and tagging

[简体中文](taxonomy_rules.md) · **English**

Use the exact values in the first column in your output JSON.

| Level | How to assign it |
| --- | --- |
| `0级-泛品类词` | Broad category, generic query, or a query without the core product term or clear intent for this product |
| `1级-核心大词` | Core product category with no meaningful qualifier |
| `2级-核心属性词` | Core product category with one qualifier |
| `3级-精准细分词` | Core product category with two qualifiers |
| `4级-超级长尾词` | Core product category with three or more qualifiers |
| `S级-高意图无核词` | A query without the core product term whose purchase intent is supported by the product profile |

Recognize singular and plural forms and synonyms of the core term. Match the longest compound qualifiers first, remove stop words, and count each distinct qualifier once. For example, “925 sterling silver” and “gift for her” each count as one. Build the canonical root from the singular core term and standard attributes in the product profile. Put attributes first, followed by the core product category and the audience or use case. Keep prepositions and articles that are needed in fixed phrases. Queries with the same meaning share a canonical root while retaining their original text and search volumes.

| Relevance | How to assign it |
| --- | --- |
| `S-核心精准` | Exact fit for the product |
| `A-高度相关` | Strongly relevant |
| `B-弱相关扩展` | Loosely relevant expansion term |
| `X-属性冲突` | Incompatible attribute or specification, or an explicit exclusion in the profile |
| `P-竞品品牌` | Competitor brand |
| `待复核` | Insufficient evidence in the profile to classify the term |

Local rules also use `X-无效词/ASIN` for invalid queries or ASINs. A term excluded by a local rule can have an empty level.

Write each output file as a JSON array. Include every `normalized_keyword` from the matching input batch exactly once and preserve its exact string. This is one entry from an output array.

```json
{
  "normalized_keyword": "sterling silver rings for women",
  "zh_meaning": "女士纯银戒指",
  "level": "3级-精准细分词",
  "canonical_root": "sterling silver ring for women",
  "relevance": "S-核心精准",
  "conflict_terms": [],
  "reason": "The core product is ring. Sterling silver and women are the two qualifiers."
}
```

For each `X-属性冲突` query, extract the actual one- or two-word terms that cause the conflict. For example, the conflict terms for `14k gold ring` can be `["14k", "gold"]`. Use `[]` for the other relevance values. Add ambiguous queries that require exact exclusion to `exact_negatives` in the product profile. The validator checks evidence, batch membership, and format. Review a sample to confirm the semantic decisions.

After manually editing a level or relevance value in the keyword inventory, set `Manual_Lock` to `TRUE` or `是` and rerun import. The importer accepts comma-separated conflict terms, the Chinese list separator `、`, or a JSON array of strings. Locks already saved to the database carry over to future runs.
