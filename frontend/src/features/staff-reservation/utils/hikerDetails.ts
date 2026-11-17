import type { AccountFields, HikerForm, HikerMatch, HikerMode, QuickGuestFields, ReservedFor } from '../types/staffReservation.types';

// The API accepts at most 200 characters for these two
export const MAX_NOTE_LENGTH = 200;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyQuickGuest: QuickGuestFields = { fullname: '', mobile: '' };
export const emptyAccount: AccountFields = { fullname: '', mobile: '', email: '', notes: '', emergencyContact: '' };
export const emptyHikerForm: HikerForm = {
  mode: 'existing',
  selected: null,
  quick: emptyQuickGuest,
  account: emptyAccount,
};

/** What is wrong with the account fields, by field (empty object when all is fine). */
export const accountErrors = (account: AccountFields): Partial<Record<keyof AccountFields, string>> => {
  const errors: Partial<Record<keyof AccountFields, string>> = {};
  if (!account.fullname.trim()) errors.fullname = "Enter the hiker's full name.";
  if (!account.mobile.trim()) errors.mobile = 'Enter a mobile number.';
  const email = account.email.trim();
  if (!email) errors.email = 'Enter an email address.';
  else if (!EMAIL_REGEX.test(email)) errors.email = 'Enter a valid email address.';
  if (account.notes.trim().length > MAX_NOTE_LENGTH) errors.notes = `At most ${MAX_NOTE_LENGTH} characters.`;
  if (account.emergencyContact.trim().length > MAX_NOTE_LENGTH) {
    errors.emergencyContact = `At most ${MAX_NOTE_LENGTH} characters.`;
  }
  return errors;
};

/** Why the hiker part is not ready yet, or null when it is. Shown under the button. */
export const hikerProblem = (form: HikerForm): string | null => {
  switch (form.mode) {
    case 'existing':
      return form.selected ? null : 'Search for the hiker and select them.';
    case 'temporary':
      return form.quick.fullname.trim() ? null : "Enter the hiker's name.";
    case 'registered':
      return Object.values(accountErrors(form.account))[0] ?? null;
  }
};

/** The `hiker` object of POST /reservations. The API accepts no other fields. */
export const toHikerPayload = (form: HikerForm): Record<string, unknown> => {
  if (form.mode === 'existing') {
    return { mode: 'existing', hikerId: form.selected?.id };
  }
  if (form.mode === 'temporary') {
    const mobile = form.quick.mobile.trim();
    return {
      mode: 'temporary',
      fullname: form.quick.fullname.trim(),
      ...(mobile ? { mobile_number: mobile } : {}),
    };
  }
  const { fullname, mobile, email, notes, emergencyContact } = form.account;
  return {
    mode: 'registered',
    fullname: fullname.trim(),
    mobile_number: mobile.trim(),
    email: email.trim(),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    ...(emergencyContact.trim() ? { emergency_contact: emergencyContact.trim() } : {}),
  };
};

/** Who the reservation is for, as a short description for the confirmation. */
export const describeHiker = (form: HikerForm): ReservedFor => {
  if (form.mode === 'existing' && form.selected) {
    return {
      mode: 'existing',
      name: form.selected.fullname,
      detail: form.selected.mobile_number || form.selected.email,
    };
  }
  if (form.mode === 'temporary') {
    return { mode: 'temporary', name: form.quick.fullname.trim(), detail: form.quick.mobile.trim() || null };
  }
  return { mode: 'registered', name: form.account.fullname.trim(), detail: form.account.email.trim() };
};

/**
 * Turns what the employee typed in the search box into the query of GET /accounts:
 * an "@" means an email, only digits and phone signs a phone number, anything else a name.
 * Returns null while the text is too short to search.
 */
export const searchQueryFor = (text: string): Record<string, string> | null => {
  const q = text.trim();
  if (q.includes('@')) return q.length >= 3 ? { email: q } : null;
  if (/^[+\d][\d\s()+-]*$/.test(q)) return q.replace(/\D/g, '').length >= 3 ? { phone: q } : null;
  return q.length >= 2 ? { name: q } : null;
};

export const isSelectable = (match: HikerMatch): boolean => match.id !== null;

export const MODE_LABELS: Record<HikerMode, string> = {
  existing: 'Existing hiker',
  temporary: 'Quick guest',
  registered: 'New account',
};