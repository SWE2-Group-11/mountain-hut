import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import { createSlot, fetchConfigurations } from '../api/slotSetupApi';
import type {
  CreatedSlot,
  CreateSlotPayload,
  SetupMode,
  SlotConfiguration,
  TableRow,
  TableSetup,
} from '../types/slotSetup.types';
import {
  formatLocalDate,
  overlaps,
  parseTableRows,
  validateTimes,
} from '../utils/slotSetup.utils';

const emptyRow = (key: number): TableRow => ({ key, tableId: '', seats: '' });

const toRows = (tables: TableSetup[], nextKey: () => number): TableRow[] =>
  tables.map((t) => ({ key: nextKey(), tableId: String(t.tableId), seats: String(t.seats) }));

const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please log in again.';
    if (err.status === 403) return 'Only the hut staff can set up slots.';
    if (err.status === 404) return err.message || 'The chosen setup or one of its tables no longer exists.';
    if (err.status === 400 || err.status === 409) return err.message;
  }
  return 'Something went wrong. Please try again.';
};

export function useSlotSetup() {
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => ++keyCounter.current, []);

  // The date picker cannot go in the past; computed once, not on every render
  const [today] = useState(() => formatLocalDate(new Date()));

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');

  const [mode, setMode] = useState<SetupMode>('new');
  const [rows, setRows] = useState<TableRow[]>(() => [emptyRow(0)]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  const [configurations, setConfigurations] = useState<SlotConfiguration[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configsError, setConfigsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [created, setCreated] = useState<CreatedSlot[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load the saved setups that can be reused
  useEffect(() => {
    let cancelled = false;
    fetchConfigurations()
      .then((list) => {
        if (cancelled) return;
        setConfigurations(list);
        setConfigsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConfigurations([]);
        setConfigsError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reloadConfigurations = () => {
    setConfigsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const selectedConfig = configurations.find((c) => c.id === selectedConfigId) ?? null;

  // --- table rows -----------------------------------------------------------
  const addRow = () => setRows((prev) => [...prev, emptyRow(nextKey())]);
  const removeRow = (key: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  const updateRow = (key: number, field: 'tableId' | 'seats', value: string) => {
    setFormError(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  // Copy a previous setup into the editor so it can be adjusted before saving
  const editFromConfiguration = (config: SlotConfiguration) => {
    setRows(toRows(config.tables, nextKey));
    setMode('new');
    setFormError(null);
  };

  const changeMode = (next: SetupMode) => {
    setMode(next);
    setFormError(null);
  };

  // --- submit ---------------------------------------------------------------
  const submit = async () => {
    setFormError(null);
    setSubmitError(null);

    if (!date) return setFormError('Choose a date.');
    if (date < today) return setFormError('The date cannot be in the past.');

    const timeError = validateTimes(startTime, endTime);
    if (timeError) return setFormError(timeError);

    const clash = created.find(
      (s) => s.date === date && overlaps(s.startTime, s.endTime, startTime, endTime),
    );
    if (clash) {
      return setFormError(
        `This overlaps the slot ${clash.startTime}-${clash.endTime} you just created for that day.`,
      );
    }

    let payload: CreateSlotPayload;
    let tables: TableSetup[];
    if (mode === 'previous') {
      if (!selectedConfig) return setFormError('Choose one of the previous setups.');
      tables = selectedConfig.tables;
      payload = { date, startTime, endTime, configurationId: selectedConfig.id };
    } else {
      const parsed = parseTableRows(rows);
      if (parsed.error !== null) return setFormError(parsed.error);
      tables = parsed.tables;
      payload = { date, startTime, endTime, configuration: { tables } };
    }

    setIsSubmitting(true);
    try {
      const slot = await createSlot(payload, tables);
      setCreated((prev) => [slot, ...prev]);
      // Keep date and tables: a service often has several slots (12-13, 13-14...)
      setStartTime(endTime);
      setEndTime('');
      reloadConfigurations();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    today,
    date,
    startTime,
    endTime,
    mode,
    rows,
    configurations,
    configsLoading,
    configsError,
    selectedConfigId,
    selectedConfig,
    created,
    isSubmitting,
    formError,
    submitError,
    setDate: (v: string) => {
      setFormError(null);
      setDate(v);
    },
    setStartTime: (v: string) => {
      setFormError(null);
      setStartTime(v);
    },
    setEndTime: (v: string) => {
      setFormError(null);
      setEndTime(v);
    },
    setSelectedConfigId: (id: number) => {
      setFormError(null);
      setSelectedConfigId(id);
    },
    changeMode,
    addRow,
    removeRow,
    updateRow,
    editFromConfiguration,
    reloadConfigurations,
    clearSubmitError: () => setSubmitError(null),
    submit,
  };
}
