MODEL (
  name        silver.product_category,
  stamp       'v2',
  kind        INCREMENTAL_BY_UNIQUE_KEY (
    unique_key  (product_code, category_tag)
  ),
  grain       (product_code, category_tag),
  description 'Table de liaison N-N entre products et category. Un produit peut appartenir à plusieurs catégories OFF (hiérarchie du général au spécifique). Le champ rank indique la position dans categories_tags : 0 = catégorie racine la plus générale, MAX = catégorie feuille la plus spécifique.'
);

WITH

raw_tags AS (
  SELECT
    p.code                                                         AS product_code,
    TRIM(tag_raw)                                                  AS category_tag_raw,
    STRPOS(p.categories_tags, TRIM(tag_raw))                      AS tag_position
  FROM bronze.products_raw p,
  LATERAL UNNEST(
    STRING_TO_ARRAY(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(p.categories_tags, '^\[|\]$', '', 'g'),
          '''', '', 'g'
        )
      ),
      ','
    )
  ) AS t(tag_raw)
  WHERE p.categories_tags IS NOT NULL
    AND TRIM(p.categories_tags) NOT IN ('', '[]')
    AND p.code IS NOT NULL
),

tags_cleaned AS (
  SELECT
    product_code,
    LOWER(TRIM(category_tag_raw))                                  AS category_tag,
    tag_position
  FROM raw_tags
  WHERE TRIM(category_tag_raw) <> ''
    AND category_tag_raw ~ '^[a-zA-Z]{2}:.+'
),

tags_deduped AS (
  SELECT DISTINCT ON (product_code, category_tag)
    product_code,
    category_tag,
    tag_position
  FROM tags_cleaned
  ORDER BY product_code, category_tag, tag_position ASC
),

tags_ranked AS (
  SELECT
    product_code,
    category_tag,
    (ROW_NUMBER() OVER (
      PARTITION BY product_code
      ORDER BY tag_position ASC
    ) - 1)::INT                                                    AS rank
  FROM tags_deduped
),

tags_with_id AS (
  SELECT
    tr.product_code,
    tr.category_tag,
    tr.rank,
    c.category_id
  FROM tags_ranked tr
  LEFT JOIN silver.category c
    ON tr.category_tag = c.category_tag
)

SELECT
  product_code,
  category_tag,
  category_id,
  rank,
  CASE WHEN rank = 0 THEN TRUE ELSE FALSE END                      AS is_root,
  CURRENT_TIMESTAMP                                                AS created_at
FROM tags_with_id