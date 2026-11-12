// Same limit as the backend (docs/api.md, POST /accounts)
export const MAX_TEXT_LENGTH = 200;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegistrationForm {
  fullname: string;
  mobileNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
  emergencyContact: string;
  notes: string;
}

export const emptyRegistrationForm: RegistrationForm = {
  fullname: '',
  mobileNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  emergencyContact: '',
  notes: '',
};

export type RegistrationErrors = Partial<Record<keyof RegistrationForm, string>>;

// The server removes surrounding spaces before checking the length,
// so the counter and the limit must count the trimmed text as well.
export const trimmedLength = (value: string): number => value.trim().length;

export function validateRegistration(form: RegistrationForm): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!form.fullname.trim()) errors.fullname = 'Please enter your full name.';
  if (!form.mobileNumber.trim()) errors.mobileNumber = 'Please enter your mobile number.';

  if (!form.email.trim()) {
    errors.email = 'Please enter your email address.';
  } else if (!EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  // The password is sent as typed: spaces are part of it, so it is never trimmed
  if (!form.password) errors.password = 'Please choose a password.';

  if (!form.confirmPassword) {
    errors.confirmPassword = 'Please type the password again.';
  } else if (form.password && form.confirmPassword !== form.password) {
    errors.confirmPassword = 'The two passwords are not the same.';
  }

  if (trimmedLength(form.emergencyContact) > MAX_TEXT_LENGTH) {
    errors.emergencyContact = `Please use at most ${MAX_TEXT_LENGTH} characters.`;
  }
  if (trimmedLength(form.notes) > MAX_TEXT_LENGTH) {
    errors.notes = `Please use at most ${MAX_TEXT_LENGTH} characters.`;
  }

  return errors;
}

// Body of POST /accounts. Optional fields are left out when empty,
// the confirmation field is only for the screen and is never sent.
export function toRegistrationRequest(form: RegistrationForm) {
  const emergencyContact = form.emergencyContact.trim();
  const notes = form.notes.trim();
  return {
    fullname: form.fullname.trim(),
    mobile_number: form.mobileNumber.trim(),
    email: form.email.trim(),
    password: form.password,
    ...(emergencyContact ? { emergency_contact: emergencyContact } : {}),
    ...(notes ? { notes } : {}),
  };
}