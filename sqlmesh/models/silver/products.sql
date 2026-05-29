MODEL (
  name        silver.products,
  stamp       'v2',
  kind        INCREMENTAL_BY_UNIQUE_KEY (
    unique_key  product_code
  ),
  grain       (product_id),
  description 'Référentiel produits Silver. Dédupliqué sur product_code, normalisé depuis products_raw (multi-sources : food, beauty, petfood, other). Champs communs à plat, enrichi avec métriques de qualité et flags de complétude. Référence silver.brand via brand_id. Les catégories sont gérées via silver.product_category (N-N).'
);

WITH

-- ============================================================
-- ÉTAPE 1 : Déduplication — un code = un produit (dernier updated_at)
-- ============================================================
deduped_raw AS (
  SELECT DISTINCT ON (code)
    *
  FROM bronze.products_raw
  WHERE
    code IS NOT NULL
    AND TRIM(code) <> ''
  ORDER BY
    code,
    updated_at  DESC NULLS LAST,
    inserted_at DESC NULLS LAST
),

-- ============================================================
-- ÉTAPE 2 : Nettoyage des champs communs
-- ============================================================
products_cleaned AS (
  SELECT
    code                                                           AS product_code,
    data_source,
    NULLIF(
      TRIM(REGEXP_REPLACE(COALESCE(product_name, generic_name, ''), '\s+', ' ', 'g')),
    '')                                                            AS product_name,
    NULLIF(TRIM(generic_name), '')                                 AS generic_name,
    NULLIF(TRIM(quantity), '')                                     AS quantity_product,
    NULLIF(TRIM(SPLIT_PART(brands, ',', 1)), '')                   AS brand_primary,
    NULLIF(TRIM(labels_tags), '')                                  AS labels_tags,
    NULLIF(TRIM(origins_tags), '')                                 AS origins_tags,
    NULLIF(TRIM(manufacturing_places), '')                         AS manufacturing_places,
    NULLIF(TRIM(packaging_tags), '')                               AS packaging_tags,
    NULLIF(TRIM(countries_tags), '')                               AS countries_tags,
    NULLIF(TRIM(ingredients_text), '')                             AS ingredients_text,
    NULLIF(TRIM(ingredients_tags), '')                             AS ingredients_tags,
    NULLIF(TRIM(ingredients_analysis_tags), '')                    AS ingredients_analysis_tags,
    NULLIF(TRIM(traces_tags), '')                                  AS traces_tags,
    NULLIF(LOWER(TRIM(nutriscore_grade)), '')                      AS nutriscore_grade,
    ROUND(COALESCE(completeness, 0)::NUMERIC, 4)                  AS completeness,
    NULLIF(TRIM(link), '')                                         AS product_url,
    max_imgid                                                      AS image_count,
    images                                                         AS images_raw,
    TO_TIMESTAMP(created_t)                                        AS created_at_source,
    TO_TIMESTAMP(last_modified_t)                                  AS last_modified_at_source,
    TO_TIMESTAMP(last_updated_t)                                   AS last_updated_at_source,
    TO_TIMESTAMP(last_image_t)                                     AS last_image_at,
    created_api                                                    AS created_at_api,
    updated_api                                                    AS updated_at_api,
    inserted_at,
    updated_at                                                     AS updated_at_pipeline,
    _ingestion_run_id,
    COALESCE(obsolete, FALSE)                                      AS is_obsolete
  FROM deduped_raw
),

-- ============================================================
-- ÉTAPE 3 : Jointure silver.brand pour résoudre brand_id
-- ============================================================
products_with_brand AS (
  SELECT
    pc.*,
    b.brand_id
  FROM products_cleaned pc
  LEFT JOIN silver.brand b
    ON LOWER(TRIM(pc.brand_primary)) = LOWER(TRIM(b.brand_name))
),

-- ============================================================
-- ÉTAPE 4 : Score de complétude Silver (0–7)
-- ============================================================
products_scored AS (
  SELECT
    *,
    (
      (CASE WHEN product_name     IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN brand_primary    IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN brand_id         IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN quantity_product IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN countries_tags   IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN origins_tags     IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN nutriscore_grade IS NOT NULL THEN 1 ELSE 0 END)
    )                                                              AS silver_completeness_score,
    (
      product_name  IS NOT NULL AND
      brand_primary IS NOT NULL AND
      brand_id      IS NOT NULL
    )                                                              AS is_viable
  FROM products_with_brand
)

-- ============================================================
-- ÉTAPE 5 : Projection finale
-- ============================================================
SELECT
  MD5(product_code)::TEXT AS product_id,
  product_code,
  data_source,
  product_name,
  generic_name,
  quantity_product,
  brand_primary,
  brand_id,
  labels_tags,
  origins_tags,
  manufacturing_places,
  packaging_tags,
  countries_tags,
  ingredients_text,
  ingredients_tags,
  ingredients_analysis_tags,
  traces_tags,
  nutriscore_grade,
  completeness,
  silver_completeness_score,
  is_viable,
  is_obsolete,
  product_url,
  image_count,
  images_raw,
  created_at_source,
  last_modified_at_source,
  last_updated_at_source,
  last_image_at,
  created_at_api,
  updated_at_api,
  inserted_at,
  updated_at_pipeline,
  _ingestion_run_id,
  CURRENT_TIMESTAMP                             AS created_at,
  CURRENT_TIMESTAMP                             AS updated_at
FROM products_scored
WHERE is_viable = TRUE