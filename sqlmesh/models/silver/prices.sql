MODEL (
  name        silver.prices,
  stamp       'v2',
  kind        INCREMENTAL_BY_TIME_RANGE (
    time_column date,
    batch_size  30
  ),
  grain       (price_id),
  description 'Table Silver des prix unitaires valides. Nettoyage complet
               (prix nuls/négatifs, codes produits sans correspondance products,
               devises invalides/manquantes). Jointures sur silver.products,
               silver.store pour conversion EUR via LATERAL (index-scan, sans
               sous-requête corrélée).'
);

WITH

-- ============================================================
-- ÉTAPE 1 : Extraction brute des prix dans la fenêtre temporelle
-- ============================================================
raw_prices AS (
  SELECT
    id,
    product_code,
    price,
    price_is_discounted,
    price_without_discount,
    discount_type,
    price_per,
    currency,
    date,
    proof_type,
    proof_date,
    proof_currency,
    location_osm_id,
    location_osm_type,
    location_type,
    inserted_at,
    _ingestion_run_id
  FROM bronze.prices_raw
  WHERE date BETWEEN @start_ds AND @end_ds
),

-- ============================================================
-- ÉTAPE 2 : Normalisation & nettoyage des champs textuels
-- ============================================================
prices_cleaned AS (
  SELECT
    id                                                             AS raw_id,

    NULLIF(TRIM(product_code), '')                                 AS product_code,

    CASE
      WHEN price IS NULL OR price <= 0                             THEN NULL
      ELSE ROUND(price::NUMERIC, 2)
    END                                                            AS price,

    CASE
      WHEN price_without_discount IS NULL
        OR price_without_discount <= 0                             THEN NULL
      ELSE ROUND(price_without_discount::NUMERIC, 2)
    END                                                            AS price_without_discount,

    COALESCE(price_is_discounted, FALSE)                           AS price_is_discounted,

    UPPER(TRIM(currency))                                          AS currency_raw,

    CASE
      WHEN currency IS NULL
        OR TRIM(currency) = ''                                     THEN NULL
      WHEN UPPER(TRIM(currency)) IN ('ADP','DDM','BAN','IPR','VED')
                                                                   THEN NULL
      WHEN TRIM(currency) ~ '^[A-Za-z]{3}$'
        THEN UPPER(TRIM(currency))
      ELSE NULL
    END                                                            AS currency,

    NULLIF(UPPER(TRIM(discount_type)), '')                         AS discount_type,
    NULLIF(UPPER(TRIM(price_per)), '')                             AS price_per,

    date,

    NULLIF(TRIM(proof_type), '')                                   AS proof_type,
    proof_date,
    CASE
      WHEN proof_currency ~ '^[A-Za-z]{3}$'
        THEN UPPER(TRIM(proof_currency))
      ELSE NULL
    END                                                            AS proof_currency,

    location_osm_id,
    location_osm_type,
    NULLIF(UPPER(TRIM(location_type)), '')                         AS location_type,

    inserted_at,
    _ingestion_run_id

  FROM raw_prices
),

-- ============================================================
-- ÉTAPE 3 : Jointure produit
-- ============================================================
prices_with_product AS (
  SELECT
    pc.*,
    pr.product_id,
    pr.product_code                                                AS matched_product_code
  FROM prices_cleaned pc
  LEFT JOIN silver.products pr
    ON pc.product_code = pr.product_code
),

-- ============================================================
-- ÉTAPE 4 : Jointure store
-- ============================================================
prices_with_store AS (
  SELECT
    pwp.*,
    st.store_id,
    st.magasin_id
  FROM prices_with_product pwp
  LEFT JOIN silver.store st
    ON pwp.location_osm_id = st.osm_id
),

-- ============================================================
-- ÉTAPE 5 : Jointure currency + conversion EUR
-- LATERAL + LIMIT 1 remplace DISTINCT ON (plus efficace sur gros volumes)
-- Le pré-filtre sur rate_date réduit le domaine à la fenêtre batch + 30j buffer
-- ============================================================
prices_with_currency AS (
  SELECT
    pws.*,
    er_lookup.rate_to_eur,
    er_lookup.rate_date    AS exchange_rate_date,
    er_lookup.source       AS exchange_rate_source
  FROM prices_with_store pws
  LEFT JOIN LATERAL (
    SELECT
      er.rate_to_eur,
      er.rate_date,
      er.source
    FROM bronze.exchange_rates_raw er
    WHERE er.currency  = pws.currency          -- déjà UPPER(TRIM) dans prices_cleaned
      AND er.rate_date <= pws.date
    ORDER BY er.rate_date DESC
    LIMIT 1
  ) er_lookup ON TRUE
),
-- ============================================================
-- ÉTAPE 6 : Calcul prix convertis EUR
-- ============================================================
prices_converted AS (
  SELECT
    *,
    CASE
      WHEN currency = 'EUR'
        THEN price
      WHEN rate_to_eur IS NOT NULL AND price IS NOT NULL
        THEN ROUND((price * rate_to_eur)::NUMERIC, 2)
      ELSE NULL
    END                                                            AS price_eur,

    CASE
      WHEN currency = 'EUR'
        THEN price_without_discount
      WHEN rate_to_eur IS NOT NULL AND price_without_discount IS NOT NULL
        THEN ROUND((price_without_discount * rate_to_eur)::NUMERIC, 2)
      ELSE NULL
    END                                                            AS price_without_discount_eur,

    CASE
      WHEN currency = 'EUR'        THEN 'NO_CONVERSION'
      WHEN rate_to_eur IS NOT NULL THEN 'CONVERTED'
      ELSE                              'NO_RATE_AVAILABLE'
    END                                                            AS conversion_status

  FROM prices_with_currency
),

-- ============================================================
-- ÉTAPE 7 : Qualification — attribution error_code
-- ============================================================
prices_qualified AS (
  SELECT
    *,
    CASE
      WHEN product_code IS NULL
        THEN 'MISSING_PRODUCT_CODE'
      WHEN currency IS NULL
        THEN 'INVALID_CURRENCY'
      WHEN price IS NULL
        THEN 'INVALID_PRICE'
      WHEN matched_product_code IS NULL
        THEN 'PRODUCT_NOT_FOUND'
      ELSE NULL
    END                                                            AS error_code
  FROM prices_converted
)

-- ============================================================
-- ÉTAPE 8 : Projection finale — uniquement les lignes valides
-- ============================================================
SELECT
  MD5(raw_id::TEXT)                             AS price_id,

  product_id,
  product_code,
  store_id,
  magasin_id,

  price,
  price_without_discount,
  price_is_discounted,
  discount_type,
  price_per,
  currency,

  price_eur,
  price_without_discount_eur,
  conversion_status,
  rate_to_eur,
  exchange_rate_date,
  exchange_rate_source,

  date,
  proof_type,
  proof_date,
  proof_currency,

  inserted_at,
  _ingestion_run_id,
  CURRENT_TIMESTAMP                             AS created_at,
  CURRENT_TIMESTAMP                             AS updated_at

FROM prices_qualified
WHERE error_code IS NULL