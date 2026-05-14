MODEL (
  name        gold.dm_store_network,
  kind        FULL,
  grain       (magasin_id, date_id),
  description 'Gold — Réseau de points de vente par enseigne × mois.
               Un store est ACTIF s''il a au moins un prix dans silver.prices
               dans les 2 derniers mois relatifs au mois courant.
               KPIs : nb_stores_total, nb_stores_actifs.'
);

WITH

months AS (
  SELECT DISTINCT
    DATE_TRUNC('month', date)::DATE AS month_date
  FROM silver.prices
  WHERE date IS NOT NULL
),

stores AS (
  SELECT DISTINCT store_id, magasin_id
  FROM silver.store
  WHERE magasin_id IS NOT NULL
),

active_per_month AS (
  SELECT DISTINCT
    DATE_TRUNC('month', p.date)::DATE AS month_date,
    p.store_id
  FROM silver.prices p
  WHERE p.store_id  IS NOT NULL
    AND p.date      IS NOT NULL
),

store_month AS (
  SELECT
    s.store_id,
    s.magasin_id,
    m.month_date,
    CASE WHEN apm.store_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_active
  FROM stores s
  CROSS JOIN months m
  LEFT JOIN active_per_month apm
    ON  s.store_id   = apm.store_id
    AND m.month_date = apm.month_date
),

aggregated AS (
  SELECT
    magasin_id,
    month_date,
    COUNT(*)                                 AS nb_stores_total,
    COUNT(*) FILTER (WHERE is_active = TRUE) AS nb_stores_actifs
  FROM store_month
  GROUP BY magasin_id, month_date
)

SELECT
  a.magasin_id,                                     -- FK → silver.magasin
  TO_CHAR(a.month_date, 'YYYYMMDD')::INT AS date_id, -- FK → silver.temps
  a.nb_stores_total,
  a.nb_stores_actifs,
  CURRENT_TIMESTAMP AS created_at,
  CURRENT_TIMESTAMP AS updated_at
FROM aggregated a
WHERE a.nb_stores_total > 0