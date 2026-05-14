MODEL (
  name        silver.prices_errors,
  -- FIX : était INCREMENTAL_BY_UNIQUE_KEY → @start_ds/@end_ds non injectés par SQLMesh,
  --       table restait vide. Aligné sur INCREMENTAL_BY_TIME_RANGE comme silver.prices
  --       pour que SQLMesh injecte correctement la fenêtre temporelle du batch.
  kind        INCREMENTAL_BY_TIME_RANGE (
    time_column date,
    batch_size  30
  ),
  grain       (error_id),
  description 'Table de quarantaine des lignes de prix rejetées. Capture les erreurs
               de devise invalide (ADP/DDM/BAN/IPR/VED), prix nuls/négatifs, codes
               produits manquants et produits non trouvés dans silver.products.
               Alimentée en parallèle de silver.prices sur la même fenêtre temporelle.'
);

WITH

-- ============================================================
-- ÉTAPE 1 : Extraction brute dans la fenêtre temporelle
-- ============================================================
raw_prices AS (
  SELECT
    id,
    product_code,
    price,
    price_is_discounted,
    price_without_discount,
    currency,
    date,
    location_osm_id,
    inserted_at,
    _ingestion_run_id
  FROM bronze.prices_raw
  WHERE date BETWEEN @start_ds AND @end_ds
),

-- ============================================================
-- ÉTAPE 2 : Normalisation currency (même logique que silver.prices)
-- ============================================================
prices_cleaned AS (
  SELECT
    id                                                             AS raw_id,

    -- FIX : NULLIF(TRIM(...), '') pour cohérence avec silver.prices
    --       (la condition TRIM(product_code) = '' dans prices_with_errors
    --        était du code mort car product_code était déjà NULLIF-é)
    NULLIF(TRIM(product_code), '')                                 AS product_code,

    price,

    UPPER(TRIM(currency))                                          AS currency_raw,

    CASE
      WHEN currency IS NULL
        OR TRIM(currency) = ''                                     THEN NULL
      WHEN UPPER(TRIM(currency)) IN ('ADP','DDM','BAN','IPR','VED')
                                                                   THEN NULL
      WHEN TRIM(currency) ~ '^[A-Za-z]{3}$'
        THEN UPPER(TRIM(currency))
      ELSE NULL
    END                                                            AS currency_clean,

    date,
    inserted_at,
    _ingestion_run_id
  FROM raw_prices
),

-- ============================================================
-- ÉTAPE 3 : Jointure produit pour détecter PRODUCT_NOT_FOUND
-- ============================================================
prices_with_product AS (
  SELECT
    pc.*,
    pr.product_code                                                AS matched_product_code
  FROM prices_cleaned pc
  LEFT JOIN silver.products pr
    ON pc.product_code = pr.product_code
),

-- ============================================================
-- ÉTAPE 4 : Attribution du motif de rejet
-- Ordre de priorité : MISSING_PRODUCT_CODE > INVALID_CURRENCY
--                   > INVALID_PRICE > PRODUCT_NOT_FOUND
-- ============================================================
prices_with_errors AS (
  SELECT
    *,
    CASE
      WHEN product_code IS NULL
        THEN 'MISSING_PRODUCT_CODE'
      WHEN currency_clean IS NULL
        THEN 'INVALID_CURRENCY'
      WHEN price IS NULL OR price <= 0
        THEN 'INVALID_PRICE'
      WHEN matched_product_code IS NULL
        THEN 'PRODUCT_NOT_FOUND'
      ELSE NULL
    END                                                            AS rejection_reason
  FROM prices_with_product
)

-- ============================================================
-- ÉTAPE 5 : Projection finale — uniquement les lignes en erreur
-- ============================================================
SELECT
  MD5(
    COALESCE(raw_id::TEXT, '') || '|' ||
    COALESCE(rejection_reason, '')
  )                                             AS error_id,

  CASE
    WHEN _ingestion_run_id::TEXT ILIKE '%seed%' THEN 'seed'
    ELSE                                             'daily'
  END                                           AS source_dag,

  raw_id                                        AS id_prices,
  rejection_reason,
  product_code,
  currency_raw                                  AS currency_rejected,
  price                                         AS price_rejected,
  date,
  FALSE                                         AS is_resolved,
  inserted_at,
  _ingestion_run_id,
  CURRENT_TIMESTAMP                             AS created_at

FROM prices_with_errors
WHERE rejection_reason IS NOT NULL