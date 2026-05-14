MODEL (
  name        silver.temps,
  kind        FULL,
  grain       (date_id),
  description 'Dimension temps — générée à partir des dates distinctes présentes dans silver.prices. Couvre jour, mois, trimestre, année, week-end.'
);

SELECT
  TO_CHAR(date, 'YYYYMMDD')::INT          AS date_id,
  date                                    AS date_jour,
  EXTRACT(DAY   FROM date)::INT           AS jour,
  EXTRACT(MONTH FROM date)::INT           AS mois,
  EXTRACT(QUARTER FROM date)::INT         AS trimestre,
  EXTRACT(YEAR  FROM date)::INT           AS annee,
  CASE WHEN EXTRACT(ISODOW FROM date) IN (6, 7) THEN TRUE ELSE FALSE END AS is_weekend,
  TO_CHAR(date, 'TMMonth')               AS mois_nom,
  CONCAT('Q', EXTRACT(QUARTER FROM date)::INT) AS trimestre_label
FROM (
  SELECT DISTINCT date
  FROM silver.prices
  WHERE date IS NOT NULL
) dates