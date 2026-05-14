MODEL (
  name        gold.dm_market_positioning,
  kind        FULL,
  grain       (magasin_id, category_id, brand_id, date_id),
  description 'Gold — Positionnement concurrentiel par enseigne × catégorie × marque × mois.
               Étoile stricte : FK → silver.magasin, silver.category, silver.brand, silver.temps.
               taux_promo_global agrégé sur (magasin_id, month_date),
               taux_promo_category agrégé sur (magasin_id, category_tag, month_date),
               taux_promo_brand agrégé sur (magasin_id, brand_tag, month_date).
               KPIs : rang_category, rang_brand, taux_promo_global/category/brand,
               indice_saisonnier_marche global/cat/brand, ecart_saisonnier,
               mois_pic/creux global/cat/brand.'
);

WITH

base AS (
  SELECT
    p.price_eur,
    p.price_is_discounted,
    p.date,
    DATE_TRUNC('month', p.date)::DATE         AS month_date,
    EXTRACT(YEAR  FROM p.date)::INT           AS year_num,
    EXTRACT(MONTH FROM p.date)::INT           AS month_num,
    p.magasin_id,
    pc.category_tag,
    b.brand_tag
  FROM silver.prices p
  LEFT JOIN silver.products         pr ON p.product_code  = pr.product_code
  LEFT JOIN silver.product_category pc ON p.product_code  = pc.product_code
                                      AND pc.rank = 0
  LEFT JOIN silver.brand             b ON pr.brand_id      = b.brand_id
  WHERE p.price_eur  IS NOT NULL
    AND p.magasin_id IS NOT NULL
),

monthly_grain AS (
  SELECT
    magasin_id,
    category_tag,
    brand_tag,
    month_date,
    year_num,
    month_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS avg_price_eur,
    COUNT(*)                                  AS nb_prices
  FROM base
  GROUP BY magasin_id, category_tag, brand_tag,
           month_date, year_num, month_num
),

taux_promo_global_cte AS (
  SELECT
    magasin_id,
    month_date,
    ROUND(
      COUNT(*) FILTER (WHERE price_is_discounted) * 100.0
      / NULLIF(COUNT(*), 0), 2
    )                                         AS taux_promo_global
  FROM base
  GROUP BY magasin_id, month_date
),

taux_promo_category_cte AS (
  SELECT
    magasin_id,
    category_tag,
    month_date,
    ROUND(
      COUNT(*) FILTER (WHERE price_is_discounted) * 100.0
      / NULLIF(COUNT(*), 0), 2
    )                                         AS taux_promo_category
  FROM base
  GROUP BY magasin_id, category_tag, month_date
),

taux_promo_brand_cte AS (
  SELECT
    magasin_id,
    brand_tag,
    month_date,
    ROUND(
      COUNT(*) FILTER (WHERE price_is_discounted) * 100.0
      / NULLIF(COUNT(*), 0), 2
    )                                         AS taux_promo_brand
  FROM base
  GROUP BY magasin_id, brand_tag, month_date
),

market_global AS (
  SELECT
    month_date,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_avg_global
  FROM base
  GROUP BY month_date, year_num
),

market_category AS (
  SELECT
    category_tag,
    month_date,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_avg_cat
  FROM base
  GROUP BY category_tag, month_date, year_num
),

market_brand AS (
  SELECT
    brand_tag,
    month_date,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_avg_brand
  FROM base
  GROUP BY brand_tag, month_date, year_num
),

annual_market_global AS (
  SELECT
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_annual_global
  FROM base
  GROUP BY year_num
),

annual_market_cat AS (
  SELECT
    category_tag,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_annual_cat
  FROM base
  GROUP BY category_tag, year_num
),

annual_market_brand AS (
  SELECT
    brand_tag,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)         AS market_annual_brand
  FROM base
  GROUP BY brand_tag, year_num
),

enriched AS (
  SELECT
    g.*,
    tp_global.taux_promo_global,
    tp_cat.taux_promo_category,
    tp_brand.taux_promo_brand,
    CASE
      WHEN amg.market_annual_global > 0
        THEN ROUND((mg.market_avg_global / amg.market_annual_global * 100)::NUMERIC, 2)
      ELSE NULL
    END                                       AS indice_saisonnier_marche_global,
    CASE
      WHEN amc.market_annual_cat > 0
        THEN ROUND((mc.market_avg_cat / amc.market_annual_cat * 100)::NUMERIC, 2)
      ELSE NULL
    END                                       AS indice_saisonnier_marche_cat,
    CASE
      WHEN amb.market_annual_brand > 0
        THEN ROUND((mb.market_avg_brand / amb.market_annual_brand * 100)::NUMERIC, 2)
      ELSE NULL
    END                                       AS indice_saisonnier_marche_brand
  FROM monthly_grain g
  LEFT JOIN taux_promo_global_cte    tp_global ON g.magasin_id   = tp_global.magasin_id
                                              AND g.month_date   = tp_global.month_date
  LEFT JOIN taux_promo_category_cte  tp_cat    ON g.magasin_id   = tp_cat.magasin_id
                                              AND g.category_tag = tp_cat.category_tag
                                              AND g.month_date   = tp_cat.month_date
  LEFT JOIN taux_promo_brand_cte     tp_brand  ON g.magasin_id   = tp_brand.magasin_id
                                              AND g.brand_tag    = tp_brand.brand_tag
                                              AND g.month_date   = tp_brand.month_date
  LEFT JOIN market_global            mg        ON g.month_date   = mg.month_date
  LEFT JOIN market_category          mc        ON g.category_tag = mc.category_tag
                                              AND g.month_date   = mc.month_date
  LEFT JOIN market_brand             mb        ON g.brand_tag    = mb.brand_tag
                                              AND g.month_date   = mb.month_date
  LEFT JOIN annual_market_global     amg       ON g.year_num     = amg.year_num
  LEFT JOIN annual_market_cat        amc       ON g.category_tag = amc.category_tag
                                              AND g.year_num     = amc.year_num
  LEFT JOIN annual_market_brand      amb       ON g.brand_tag    = amb.brand_tag
                                              AND g.year_num     = amb.year_num
),

with_rank AS (
  SELECT
    *,
    RANK() OVER (
      PARTITION BY category_tag, month_date
      ORDER BY avg_price_eur ASC NULLS LAST
    )                                         AS rang_category,
    RANK() OVER (
      PARTITION BY brand_tag, month_date
      ORDER BY avg_price_eur ASC NULLS LAST
    )                                         AS rang_brand,
    CASE
      WHEN indice_saisonnier_marche_cat    IS NOT NULL
       AND indice_saisonnier_marche_global IS NOT NULL
        THEN ROUND(
          (indice_saisonnier_marche_cat - indice_saisonnier_marche_global)::NUMERIC, 2
        )
      ELSE NULL
    END                                       AS ecart_saisonnier_cat,
    CASE
      WHEN indice_saisonnier_marche_brand  IS NOT NULL
       AND indice_saisonnier_marche_global IS NOT NULL
        THEN ROUND(
          (indice_saisonnier_marche_brand - indice_saisonnier_marche_global)::NUMERIC, 2
        )
      ELSE NULL
    END                                       AS ecart_saisonnier_brand
  FROM enriched
),

-- ── Mois pic/creux marché GLOBAL par année
seasonal_global AS (
  SELECT DISTINCT
    year_num,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY year_num
      ORDER BY indice_saisonnier_marche_global DESC NULLS LAST
    )                                         AS mois_pic_global,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY year_num
      ORDER BY indice_saisonnier_marche_global ASC NULLS LAST
    )                                         AS mois_creux_global
  FROM with_rank
  WHERE indice_saisonnier_marche_global IS NOT NULL
),

seasonal_cat AS (
  SELECT DISTINCT
    category_tag,
    year_num,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY category_tag, year_num
      ORDER BY indice_saisonnier_marche_cat DESC NULLS LAST
    )                                         AS mois_pic_cat,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY category_tag, year_num
      ORDER BY indice_saisonnier_marche_cat ASC NULLS LAST
    )                                         AS mois_creux_cat
  FROM with_rank
  WHERE indice_saisonnier_marche_cat IS NOT NULL
),

seasonal_brand AS (
  SELECT DISTINCT
    brand_tag,
    year_num,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY brand_tag, year_num
      ORDER BY indice_saisonnier_marche_brand DESC NULLS LAST
    )                                         AS mois_pic_brand,
    FIRST_VALUE(month_num) OVER (
      PARTITION BY brand_tag, year_num
      ORDER BY indice_saisonnier_marche_brand ASC NULLS LAST
    )                                         AS mois_creux_brand
  FROM with_rank
  WHERE indice_saisonnier_marche_brand IS NOT NULL
)

SELECT
  -- ── Clés étrangères étoile
  r.magasin_id,                                            -- FK → silver.magasin
  cat.category_id,                                         -- FK → silver.category
  b.brand_id,                                              -- FK → silver.brand
  TO_CHAR(r.month_date, 'YYYYMMDD')::INT                   AS date_id, -- FK → silver.temps

  -- ── Faits de contexte
  r.nb_prices,
  r.avg_price_eur,

  -- ── KPIs taux promo
  r.taux_promo_global,
  r.taux_promo_category,
  r.taux_promo_brand,

  -- ── KPIs rang concurrentiel
  r.rang_category,
  r.rang_brand,

  -- ── KPIs indice saisonnier marché
  r.indice_saisonnier_marche_global,
  r.indice_saisonnier_marche_cat,
  r.indice_saisonnier_marche_brand,

  -- ── KPIs écart saisonnier
  r.ecart_saisonnier_cat,
  r.ecart_saisonnier_brand,

  -- ── KPIs mois pic/creux global
  sg.mois_pic_global,
  sg.mois_creux_global,

  -- ── KPIs mois pic/creux par catégorie
  sc.mois_pic_cat,
  sc.mois_creux_cat,

  -- ── KPIs mois pic/creux par marque
  sb.mois_pic_brand,
  sb.mois_creux_brand,

  CURRENT_TIMESTAMP                                        AS created_at,
  CURRENT_TIMESTAMP                                        AS updated_at

FROM with_rank r
LEFT JOIN seasonal_global sg  ON r.year_num     = sg.year_num
LEFT JOIN seasonal_cat    sc  ON r.category_tag = sc.category_tag
                              AND r.year_num    = sc.year_num
LEFT JOIN seasonal_brand  sb  ON r.brand_tag    = sb.brand_tag
                              AND r.year_num    = sb.year_num
LEFT JOIN silver.category cat ON r.category_tag = cat.category_tag
LEFT JOIN silver.brand    b   ON r.brand_tag    = b.brand_tag