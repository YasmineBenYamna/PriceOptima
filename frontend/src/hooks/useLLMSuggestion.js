import { useEffect, useState } from 'react';
import { getLLMSuggestion } from '../api/api.js';

export function useLLMSuggestion(scope) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState('');

  const category = scope?.category || scope?.categories?.[0] || undefined;
  const brand = scope?.brand || scope?.brands?.[0] || undefined;

  // BUG FIX 1: enabled était absent du return, ce qui causait aiEnabled === undefined
  // dans StrategyConfigurationPage et empêchait l'affichage du panel.
  const enabled = !!(category || brand);

  useEffect(() => {
    if (!category && !brand) {
      setSuggestion(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const data = await getLLMSuggestion({
          category,
          brand,
        });

        if (!cancelled) {
          setSuggestion(data);
        }
      } catch (e) {
        if (!cancelled) {
          setSuggestion(null);
          setError(e.message || 'LLM unavailable');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [category, brand]);

  return { loading, suggestion, error, enabled };
}