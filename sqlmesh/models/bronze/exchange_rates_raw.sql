MODEL (
  name        bronze.exchange_rates_raw,
  kind        INCREMENTAL_BY_UNIQUE_KEY (
    unique_key  (currency, rate_date)
  ),
  description 'Couche Bronze - selection des colonnes utiles de exchange_rates_raw. Aucune transformation metier.'
);

SELECT
  rate_date,
  currency,
  rate_to_eur,
  source,
  frequency
FROM public.exchange_rates_raw
WHERE rate_to_eur > 0