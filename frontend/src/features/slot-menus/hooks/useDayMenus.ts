import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import { formatLocalDate } from '../../slot-setup/utils/slotSetup.utils';
import { fetchDaySlots, saveSlotMenu } from '../api/slotMenusApi';
import type { DaySlot } from '../types/slotMenus.types';
import { slotHasStarted } from '../utils/menuWindow';

const TICK_MS = 30_000;

const errorText = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return 'Your account is not allowed to change menus.';
    if (err.status === 404) return 'This slot no longer exists. Reload the day.';
    if (err.status === 400) return err.message;
  }
  return 'The menu could not be saved. Please try again.';
};

// The slots of one day with their menus, and the changes of a menu
export function useDayMenus() {
  const [date, setDate] = useState(() => formatLocalDate(new Date()));
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // A slot can start while the page is open: its menu then becomes read-only
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDaySlots(date);
        if (!cancelled) setSlots(data);
      } catch {
        if (!cancelled) {
          setSlots([]);
          setError('Could not load the slots of this day. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Changes the menu of this slot only (null removes it). Answers with an error message, or null when saved.
  const updateMenu = async (slot: DaySlot, menu: string | null): Promise<string | null> => {
    if (slotHasStarted(slot)) return 'This slot has already started: its menu can no longer be changed.';
    try {
      const saved = await saveSlotMenu(slot.date, slot.startTime, menu);
      setSlots((prev) => prev.map((s) => (s.startTime === slot.startTime ? { ...s, menu: saved } : s)));
      return null;
    } catch (err) {
      return errorText(err);
    }
  };

  return { date, setDate, slots, loading, error, reload, now, updateMenu };
}