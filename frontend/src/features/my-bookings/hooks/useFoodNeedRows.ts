import { useCallback, useRef, useState } from 'react';
import type { RequirementRow } from '../../reservation/types/reservation.types';

// The rows of the food needs form while a booking is being changed: add, remove, edit,
// start again, or start from the food needs the booking already has.
export function useFoodNeedRows() {
  const keyCounter = useRef(0);
  const [rows, setRows] = useState<RequirementRow[]>([]);

  const add = useCallback(() => {
    const key = ++keyCounter.current;
    setRows((prev) => [...prev, { key, count: 1, tags: [], extra: '', hasAllergies: false }]);
  }, []);

  const remove = useCallback((key: number) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }, []);

  const update = useCallback((key: number, changes: Partial<Omit<RequirementRow, 'key'>>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }, []);

  const reset = useCallback(() => setRows([]), []);

  const load = useCallback((items: Omit<RequirementRow, 'key'>[]) => {
    setRows(items.map((item) => ({ ...item, key: ++keyCounter.current })));
  }, []);

  return { rows, add, remove, update, reset, load };
}