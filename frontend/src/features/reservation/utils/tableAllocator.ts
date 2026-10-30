export interface Table {
  id: string;
  capacity: number;
  currentOccupancy: number;
}

export function allocateTables(partySize: number, availableTables: Table[]) {
  // Sort tables by remaining capacity ascending to find the smallest set/single table that fits
  const sortedTables = [...availableTables].sort((a, b) => 
    (a.capacity - a.currentOccupancy) - (b.capacity - b.currentOccupancy)
  );

  // Strategy 1: Try to seat the whole party at one single table (sharing allowed)
  const singleTableMatch = sortedTables.find(
    table => (table.capacity - table.currentOccupancy) >= partySize
  );

  if (singleTableMatch) {
    return {
      success: true,
      allocation: [{ tableId: singleTableMatch.id, seatsAssigned: partySize }],
      isSplit: false
    };
  }

  // Strategy 2: Split the party using as few tables as possible
  let remainingParty = partySize;
  const allocation = [];

  for (const table of sortedTables) {
    const freeSeats = table.capacity - table.currentOccupancy;
    if (freeSeats > 0) {
      const seatsToTake = Math.min(remainingParty, freeSeats);
      allocation.push({ tableId: table.id, seatsAssigned: seatsToTake });
      remainingParty -= seatsToTake;

      if (remainingParty === 0) break;
    }
  }

  if (remainingParty > 0) {
    return { success: false, error: "Not enough total seats available for this party size across available tables." };
  }

  return {
    success: true,
    allocation,
    isSplit: true
  };
}