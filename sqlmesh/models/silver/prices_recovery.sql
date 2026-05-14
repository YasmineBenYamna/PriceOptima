MODEL (
  name        silver.prices_recovery,
  kind        FULL,
  description 'Vue des erreurs PRODUCT_NOT_FOUND récupérables.
               À utiliser en amont pour réinjection manuelle ou via post-hook.'
);

WITH

unresolved_errors AS (
  SELECT
    error_id,
    id_prices       AS raw_id,
    product_code,
    date,
    inserted_at,
    _ingestion_run_id
  FROM silver.prices_errors
  WHERE rejection_reason = 'PRODUCT_NOT_FOUND'
    AND is_resolved       = FALSE
),

recovered AS (
  SELECT
    ue.*,
    pr.product_id,
    pr.product_code AS matched_product_code
  FROM unresolved_errors ue
  INNER JOIN silver.products pr
    ON ue.product_code = pr.product_code
)

SELECT
  error_id,
  raw_id,
  product_id,
  matched_product_code,
  date,
  inserted_at,
  _ingestion_run_id
FROM recovered