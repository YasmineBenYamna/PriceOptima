MODEL (
  name        silver.category,
  kind        INCREMENTAL_BY_UNIQUE_KEY (
    unique_key  category_tag
  ),
  grain       (category_id),
  description 'Référentiel des catégories Silver. Extrait et normalisé depuis categories_tags (format liste Python OFF). Toutes langues conservées (en:, fr:, nl:, it:, de:, es:...). Enrichi avec product_count et category_name lisible.'
);

WITH

-- ============================================================
-- ÉTAPE 1 : Parsing du format liste Python OFF
-- "['en:dairies', 'en:cheeses', 'fr:fromages-de-vache']" → lignes individuelles
-- ============================================================
raw_tags AS (
  SELECT
    code                                                           AS product_code,
    TRIM(tag_raw)                                                  AS category_tag_raw
  FROM bronze.products_raw,
  LATERAL UNNEST(
    STRING_TO_ARRAY(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(categories_tags, '^\[|\]$', '', 'g'),  -- strip [ ]
          '''',                                                  -- strip '
          '',
          'g'
        )
      ),
      ','
    )
  ) AS tag_raw
  WHERE categories_tags IS NOT NULL
    AND TRIM(categories_tags) NOT IN ('', '[]')
),

-- ============================================================
-- ÉTAPE 2 : Nettoyage et normalisation des tags
-- ============================================================
tags_cleaned AS (
  SELECT
    product_code,
    LOWER(TRIM(category_tag_raw))                                  AS category_tag,
    SPLIT_PART(LOWER(TRIM(category_tag_raw)), ':', 1)              AS lang_prefix,
    INITCAP(
      REPLACE(
        SPLIT_PART(LOWER(TRIM(category_tag_raw)), ':', 2),
        '-', ' '
      )
    )                                                              AS category_name
  FROM raw_tags
  WHERE TRIM(category_tag_raw) <> ''
    AND category_tag_raw ~ '^[a-zA-Z]{2}:.+'
),

-- ============================================================
-- ÉTAPE 3 : Agrégation — un tag = une catégorie
-- ============================================================
categories_aggregated AS (
  SELECT
    category_tag,
    lang_prefix,
    MODE() WITHIN GROUP (ORDER BY category_name)                   AS category_name,
    COUNT(DISTINCT product_code)                                   AS product_count
  FROM tags_cleaned
  GROUP BY category_tag, lang_prefix
)

-- ============================================================
-- ÉTAPE 4 : Projection finale
-- ============================================================
SELECT
  MD5(category_tag)               AS category_id,
  category_tag,
  lang_prefix,
  category_name,
  product_count,
  CURRENT_TIMESTAMP               AS created_at,
  CURRENT_TIMESTAMP               AS updated_at
FROM categories_aggregated
WHERE category_name IS NOT NULL
  AND TRIM(category_name) <> ''
