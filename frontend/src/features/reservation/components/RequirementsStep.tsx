import React from 'react';
import { AlertTriangle, Minus, Plus, Trash2, UtensilsCrossed, CheckCircle2, } from 'lucide-react';
import type { RequirementRow } from '../types/reservation.types';
import { ALLERGY_TAGS, FOOD_TAGS, MAX_EXTRA_LENGTH, peopleAssigned, peopleMentioned, rowError } from '../utils/requirements';

interface RequirementsStepProps {
  rows: RequirementRow[];
  partySize: number;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onChange: (key: number, changes: Partial<Omit<RequirementRow, 'key'>>) => void;
}

const chipClass = (selected: boolean, allergy: boolean): string =>
  `px-3 py-1.5 rounded-full text-xs border transition-colors cursor-pointer ${
    selected
      ? allergy
        ? 'bg-[#B00020] text-white border-[#B00020]'
        : 'bg-[#234E39] text-white border-[#234E39]'
      : 'bg-white text-[#2C3835] border-[#D4CDBA] hover:border-[#234E39]'
  }`;

const stepButton =
  'w-8 h-8 rounded-lg bg-white border border-[#EFEADF] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors';

export const RequirementsStep: React.FC<RequirementsStepProps> = ({ rows, partySize, onAdd, onRemove, onChange }) => {
  const assigned = peopleAssigned(rows);
  const mentioned = peopleMentioned(rows);
  const everyoneCovered = assigned >= partySize;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#5A6865] flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-[#234E39]" />
          4. Food needs <span className="font-normal normal-case tracking-normal">(optional)</span>
        </span>
      </div>

      <p className="text-sm text-[#5A6865] mb-3">
        Does anyone in your party have a food need or an allergy? Say how many people and pick what applies.
      </p>

      {rows.length > 0 && (
        <ul className="space-y-3 mb-3">
          {rows.map((row, index) => {
            const error = rowError(row);
            // A note can use what the other notes have left of the party
            const maxCount = partySize - (assigned - row.count);
            const toggleTag = (tag: string, isAllergy: boolean) => {
              const tags = row.tags.includes(tag) ? row.tags.filter((t) => t !== tag) : [...row.tags, tag];
              // Picking an allergy ticks the box; the hiker can still untick it
              onChange(row.key, isAllergy && !row.tags.includes(tag) ? { tags, hasAllergies: true } : { tags });
            };
            return (
              <li
                key={row.key}
                className={`rounded-2xl border p-4 space-y-4 ${
                  row.hasAllergies ? 'border-[#F2C4C4] bg-[#FDF6F6]' : 'border-[#EFEADF] bg-[#FAF6EE]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#1C2826]" id={`need-count-label-${row.key}`}>
                      How many people?
                    </span>
                    <div className="flex items-center gap-2" role="group" aria-labelledby={`need-count-label-${row.key}`}>
                      <button
                        type="button"
                        className={stepButton}
                        onClick={() => onChange(row.key, { count: row.count - 1 })}
                        disabled={row.count <= 1}
                        aria-label={`Fewer people, need ${index + 1}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-[#1C2826]" aria-live="polite">
                        {row.count}
                      </span>
                      <button
                        type="button"
                        className={stepButton}
                        onClick={() => onChange(row.key, { count: row.count + 1 })}
                        disabled={row.count >= maxCount}
                        aria-label={`More people, need ${index + 1}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(row.key)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#7C8885] hover:text-red-600 transition-colors cursor-pointer"
                    aria-label={`Remove need ${index + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>

                <div>
                  <span className="block text-xs text-[#5A6865] mb-2">
                    What applies to them? Pick all that apply, for example two allergies.
                  </span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Food needs, need ${index + 1}`}>
                    {FOOD_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={row.tags.includes(tag)}
                        onClick={() => toggleTag(tag, false)}
                        className={chipClass(row.tags.includes(tag), false)}
                      >
                        {tag}
                      </button>
                    ))}
                    {ALLERGY_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={row.tags.includes(tag)}
                        onClick={() => toggleTag(tag, true)}
                        className={chipClass(row.tags.includes(tag), true)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor={`need-extra-${row.key}`} className="block text-xs text-[#5A6865] mb-2">
                    Anything else? (optional)
                  </label>
                  <input
                    id={`need-extra-${row.key}`}
                    type="text"
                    value={row.extra}
                    maxLength={MAX_EXTRA_LENGTH}
                    placeholder="e.g. no sesame, or a different allergy"
                    onChange={(e) => onChange(row.key, { extra: e.target.value })}
                    aria-invalid={error !== null}
                    className="w-full bg-white border border-[#EFEADF] rounded-xl px-3 py-2 text-sm text-[#1C2826] placeholder:text-[#A5AFAC] focus:outline-none focus:border-[#234E39]"
                  />
                </div>

                <label className="flex items-start gap-2 text-sm text-[#1C2826] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.hasAllergies}
                    onChange={(e) => onChange(row.key, { hasAllergies: e.target.checked })}
                    className="mt-0.5 w-4 h-4 accent-[#B00020]"
                  />
                  <span>
                    <span className="font-semibold">This is an allergy</span>
                    <span className="block text-xs text-[#5A6865]">
                      The kitchen will take special care when preparing the meal.
                    </span>
                  </span>
                </label>

                {error && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mentioned > partySize && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-red-700 mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          You listed {mentioned} people, but your party has {partySize}. Remove a note or lower the numbers.
        </p>
      )}

          {rows.length > 0 && everyoneCovered && mentioned <= partySize && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-medium text-[#234E39] bg-[#EAF3EE] border border-[#BFD8C9] rounded-xl px-3 py-2 mb-3"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          All {partySize} {partySize === 1 ? 'person is' : 'people are'} covered.
        </p>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={everyoneCovered}
        className="flex items-center gap-1.5 text-sm font-semibold text-[#234E39] hover:text-[#1C3E2E] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        {rows.length === 0 ? 'Add someone with a food need' : 'Add another'}
      </button>
    </div>
  );
};