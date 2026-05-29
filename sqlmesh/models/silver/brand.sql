MODEL (
  name        silver.brand,
  stamp       'v2',
  kind        INCREMENTAL_BY_UNIQUE_KEY (
    unique_key  brand_tag
  ),
  grain       (brand_id),
  description 'Référentiel des marques Silver. Extrait et normalisé depuis brands_tags (format liste Python OFF). Dédupliqué sur brand_tag. Enrichi avec product_count et brand_name lisible.',
  -- ✅ CHANGEMENT 1 : ajout des types explicites pour éviter l'erreur
  -- "Self-referencing models require inferrable column types"
  -- SQLMesh exige des types explicites quand un modèle incrémental est référencé par un autre modèle incrémental (silver.products joint sur silver.brand). 
  --Sans ça, il ne peut pas inférer les types → erreur Self-referencing models
  columns (
    brand_id      TEXT,
    brand_tag     TEXT,
    lang_prefix   TEXT,
    brand_name    TEXT,
    product_count BIGINT,
    created_at    TIMESTAMP,
    updated_at    TIMESTAMP
  )
);

WITH

raw_tags AS (
  SELECT
    code                                                           AS product_code,
    TRIM(tag_raw)                                                  AS brand_tag_raw
  FROM bronze.products_raw,
  LATERAL UNNEST(
    STRING_TO_ARRAY(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(brands_tags, '^\[|\]$', '', 'g'),
          '''',
          '',
          'g'
        )
      ),
      ','
    )
  ) AS tag_raw
  WHERE brands_tags IS NOT NULL
    AND TRIM(brands_tags) NOT IN ('', '[]')
),

tags_cleaned AS (
  SELECT
    product_code,
    LOWER(TRIM(brand_tag_raw))                                     AS brand_tag,
    SPLIT_PART(LOWER(TRIM(brand_tag_raw)), ':', 1)                 AS lang_prefix,
    INITCAP(
      REPLACE(
        SPLIT_PART(LOWER(TRIM(brand_tag_raw)), ':', 2),
        '-', ' '
      )
    )                                                              AS brand_name
  FROM raw_tags
  WHERE TRIM(brand_tag_raw) <> ''
    AND brand_tag_raw ~ '^[a-zA-Z]{2}:.+'
),

brands_aggregated AS (
  SELECT
    brand_tag,
    lang_prefix,
    MODE() WITHIN GROUP (ORDER BY brand_name)                      AS brand_name,
    COUNT(DISTINCT product_code)                                   AS product_count
  FROM tags_cleaned
  GROUP BY brand_tag, lang_prefix
)

SELECT
  MD5(brand_tag)::TEXT            AS brand_id,
  brand_tag,
  lang_prefix,
  brand_name,
  product_count,
  CURRENT_TIMESTAMP               AS created_at,
  CURRENT_TIMESTAMP               AS updated_at
FROM brands_aggregated
WHERE brand_name IS NOT NULL
  AND TRIM(brand_name) <> ''