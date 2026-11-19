import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import { copyWeek, fetchWeekSlots, type RepeatWeekResult } from '../api/repeatWeekApi';
import type { SlotConfiguration } from '../../slot-setup/types/slotSetup.types';
import { weekOptions } from '../utils/weeks';

// The server accepts up to 52 target weeks
const TARGET_WEEKS = 52;
const SOURCE_WEEKS_BEFORE = 4;

const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please log in again.';
    if (err.status === 403) return 'Only the hut staff can repeat a schedule.';
    if (err.status === 404) return 'The week you want to copy has no slots. Set up its slots first, then repeat it.';
    if (err.status === 409) {
      return 'One of the chosen weeks already has bookings, so its schedule cannot be replaced. Nothing was copied. Remove that week and try again.';
    }
    if (err.status === 400) return err.message;
  }
  return 'Something went wrong. Please try again.';
};

export function useRepeatWeek() {
  // Computed once: the list of weeks does not change while the page is open
  const [today] = useState(() => new Date());
  const sourceOptions = useMemo(() => weekOptions(today, SOURCE_WEEKS_BEFORE, 26), [today]);
  // Only weeks after the current one can be filled
  const targetOptions = useMemo(() => weekOptions(today, 0, TARGET_WEEKS).slice(1), [today]);

  const [sourceWeek, setSourceWeekState] = useState(() => weekOptions(today, 0, 0)[0].start);
  const [targets, setTargets] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<RepeatWeekResult | null>(null);

  // What the chosen week contains. `week` tells which week the answer belongs to,
  // so a late answer for a week that is no longer chosen is simply ignored.
  const [loaded, setLoaded] = useState<{ week: string; slots: SlotConfiguration[]; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWeekSlots(sourceWeek)
      .then((slots) => !cancelled && setLoaded({ week: sourceWeek, slots, failed: false }))
      .catch(() => !cancelled && setLoaded({ week: sourceWeek, slots: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [sourceWeek]);

  const current = loaded?.week === sourceWeek ? loaded : null;
  const sourceLoading = current === null;
  const sourceSlots = current?.slots ?? [];
  const sourceLoadFailed = current?.failed ?? false;

  const reset = () => {
    setConfirming(false);
    setFormError(null);
    setResult(null);
  };

  const setSourceWeek = (start: string) => {
    reset();
    setSourceWeekState(start);
    // A week cannot be copied onto itself
    setTargets((prev) => prev.filter((t) => t !== start));
  };

  const toggleTarget = (start: string) => {
    reset();
    setTargets((prev) => (prev.includes(start) ? prev.filter((t) => t !== start) : [...prev, start].sort()));
  };

  // Tick or untick several weeks at once (a whole month)
  const toggleWeeks = (starts: string[], on: boolean) => {
    reset();
    setTargets((prev) => {
      const rest = prev.filter((t) => !starts.includes(t));
      return on ? [...rest, ...starts.filter((w) => w !== sourceWeek)].sort() : rest;
    });
  };

  const selectNext = (count: number) => {
    reset();
    setTargets(
      targetOptions
        .filter((w) => w.start !== sourceWeek)
        .slice(0, count)
        .map((w) => w.start),
    );
  };

  const clearTargets = () => {
    reset();
    setTargets([]);
  };

  // First step: check the choice, then ask for confirmation (the old schedule is replaced)
  const askConfirmation = () => {
    setFormError(null);
    setResult(null);
    if (current && !current.failed && current.slots.length === 0) {
      return setFormError('The week you want to copy has no slots. Choose another week, or set up its slots first.');
    }
    if (targets.length === 0) return setFormError('Choose at least one week to fill.');
    setConfirming(true);
  };

  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const done = await copyWeek(sourceWeek, targets);
      setResult(done);
      setTargets([]);
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      setSubmitError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    sourceOptions,
    targetOptions,
    sourceWeek,
    sourceSlots,
    sourceLoading,
    sourceLoadFailed,
    targets,
    confirming,
    isSubmitting,
    formError,
    submitError,
    result,
    setSourceWeek,
    toggleTarget,
    toggleWeeks,
    selectNext,
    clearTargets,
    askConfirmation,
    cancelConfirmation: () => setConfirming(false),
    clearSubmitError: () => setSubmitError(null),
    clearResult: () => setResult(null),
    submit,
  };
}