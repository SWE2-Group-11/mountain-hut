import type { Requirement, RequirementRow } from '../types/reservation.types';

export const MAX_EXTRA_LENGTH = 100;

// Quick picks. The allergy ones also tick the allergy box.
export const FOOD_TAGS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Lactose-free'];
export const ALLERGY_TAGS = ['Nut allergy', 'Shellfish allergy', 'Egg allergy', 'Fish allergy'];

const formatPeople = (count: number): string => `${count} ${count === 1 ? 'person' : 'people'}`;

/** What the hiker said about this row, without the number of people ("vegan, nut allergy, no sesame"). */
const describe = (row: RequirementRow): string => {
  const parts = [...row.tags.map((tag) => tag.toLowerCase())];
  const extra = row.extra.trim();
  if (extra) parts.push(extra);
  return parts.join(', ');
};

/** A row the hiker added but left empty is simply ignored. */
export const isBlankRow = (row: RequirementRow): boolean =>
  !row.hasAllergies && describe(row) === '';

/** The error of a row, or null. An allergy always needs a description (the API requires it). */
export const rowError = (row: RequirementRow): string | null =>
  row.hasAllergies && describe(row) === ''
    ? 'Tell us which allergy it is: pick one above or write it.'
    : null;

/** The text sent to the API: "2 people: vegetarian", "1 person: vegan, nut allergy, no sesame". */
export const detailsOf = (row: RequirementRow): string => `${formatPeople(row.count)}: ${describe(row)}`;

/** The requirements to send, from the filled rows. */
export const toRequirements = (rows: RequirementRow[]): Requirement[] =>
  rows
    .filter((row) => !isBlankRow(row))
    .map((row) => ({ hasAllergies: row.hasAllergies, details: detailsOf(row) }));

/** How many people the filled rows talk about, to warn when it is more than the party. */
export const peopleMentioned = (rows: RequirementRow[]): number =>
  rows.filter((row) => !isBlankRow(row)).reduce((sum, row) => sum + row.count, 0);
export const peopleAssigned = (rows: RequirementRow[]): number =>
  rows.reduce((sum, row) => sum + row.count, 0);