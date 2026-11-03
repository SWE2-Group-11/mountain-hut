// src/features/reservation/utils/tableAllocator.ts
export interface Table {
  id: string;
  capacity: number;
  currentOccupancy: number;
}

export function allocateTables(partySize: number, availableTables: Table[]) {
  const tablesWithFree = availableTables
    .map((t) => ({ ...t, freeSeats: t.capacity - t.currentOccupancy }))
    .filter((t) => t.freeSeats > 0);

  const totalFreeSeats = tablesWithFree.reduce((sum, t) => sum + t.freeSeats, 0);

  // Constraint: party size must be <= seats available for (date, time)
  if (partySize > totalFreeSeats) {
    return {
      success: false,
      error: `Only ${totalFreeSeats} seats available for this slot.`,
    };
  }

  // Strategy 1: Single table — sort ASCENDING to use the smallest available set of seats
  const ascendingTables = [...tablesWithFree].sort((a, b) => a.freeSeats - b.freeSeats);
  const singleTableMatch = ascendingTables.find((t) => t.freeSeats >= partySize);

  if (singleTableMatch) {
    return {
      success: true,
      allocation: [{ tableId: singleTableMatch.id, seatsAssigned: partySize }],
      isSplit: false,
    };
  }

  // Strategy 2: Split party — use AS FEW TABLES AS POSSIBLE, 
  // while occupying the smallest available set of seats on the final table
  const descendingTables = [...tablesWithFree].sort((a, b) => b.freeSeats - a.freeSeats);
  let remainingParty = partySize;
  const allocation: Array<{ tableId: string; seatsAssigned: number }> = [];
  const usedTableIds = new Set<string>();

  for (const table of descendingTables) {
    if (remainingParty <= 0) break;

    // Check if the remaining guests can fit in ONE of the remaining unused tables.
    // If so, pick the SMALLEST table that fits the remainder!
    const smallestFitForRemainder = ascendingTables.find(
      (t) => !usedTableIds.has(t.id) && t.freeSeats >= remainingParty
    );

    if (smallestFitForRemainder) {
      allocation.push({
        tableId: smallestFitForRemainder.id,
        seatsAssigned: remainingParty,
      });
      usedTableIds.add(smallestFitForRemainder.id);
      remainingParty = 0;
      break;
    }

    // Otherwise, take the largest available table to minimize total tables used
    if (!usedTableIds.has(table.id)) {
      allocation.push({
        tableId: table.id,
        seatsAssigned: table.freeSeats,
      });
      usedTableIds.add(table.id);
      remainingParty -= table.freeSeats;
    }
  }

  return {
    success: true,
    allocation,
    isSplit: allocation.length > 1,
  };
}