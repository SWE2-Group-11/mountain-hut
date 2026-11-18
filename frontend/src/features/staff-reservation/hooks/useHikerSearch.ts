import { useEffect, useState } from 'react';
import { apiClient } from '../../../api/client';
import type { HikerMatch } from '../types/staffReservation.types';
import { searchQueryFor } from '../utils/hikerDetails';

const SEARCH_DELAY_MS = 350;

// GET /accounts: searches the hikers while the employee types, without asking at every key press
export function useHikerSearch(text: string) {
  const [results, setResults] = useState<HikerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  const query = searchQueryFor(text);
  const queryKey = query ? new URLSearchParams(query).toString() : null;

  useEffect(() => {
    if (!queryKey) {
      setResults([]);
      setSearching(false);
      setError(null);
      setSearchedFor(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data: HikerMatch[] = await apiClient.get(`/accounts?${queryKey}`);
        if (cancelled) return;
        setResults(data);
        setError(null);
        setSearchedFor(queryKey);
      } catch {
        if (cancelled) return;
        setResults([]);
        setSearchedFor(null);
        setError('Could not search the hikers. Please try again.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryKey]);

  return {
    results,
    searching,
    error,
    // The search was done and nobody matched
    noMatch: !searching && !error && searchedFor === queryKey && queryKey !== null && results.length === 0,
    tooShort: text.trim().length > 0 && queryKey === null,
  };
}