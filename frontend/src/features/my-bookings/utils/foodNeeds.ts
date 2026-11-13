import type { Requirement, RequirementRow } from '../../reservation/types/reservation.types';
import { ALLERGY_TAGS, FOOD_TAGS, MAX_EXTRA_LENGTH } from '../../reservation/utils/requirements';

/**
 * Fills the form rows from the food needs of an existing booking, so they can be edited
 * instead of typed again (the opposite of toRequirements).
 * "2 people: vegan, nut allergy, no sesame" becomes 2 people, the tags Vegan + Nut allergy
 * and the free text "no sesame".
 */
export const rowsFromRequirements = (requirements: Requirement[]): Omit<RequirementRow, 'key'>[] =>
  requirements.map(({ hasAllergies, details }) => {
    const match = details.match(/^(\d+) (?:person|people): ?(.*)$/);
    if (!match) return { count: 1, tags: [], extra: details.slice(0, MAX_EXTRA_LENGTH), hasAllergies };

    const known = [...FOOD_TAGS, ...ALLERGY_TAGS];
    const parts = match[2] ? match[2].split(', ') : [];
    const tags: string[] = [];
    // The tags always come first in the text; what follows is the free text of the hiker
    while (parts.length > 0) {
      const tag = known.find((t) => t.toLowerCase() === parts[0].toLowerCase() && !tags.includes(t));
      if (!tag) break;
      tags.push(tag);
      parts.shift();
    }
    return {
      count: Math.max(1, Number(match[1])),
      tags,
      extra: parts.join(', ').slice(0, MAX_EXTRA_LENGTH),
      hasAllergies,
    };
  });