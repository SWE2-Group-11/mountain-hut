// Length of a chosen password: the same limits as the backend (PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH in config.ts)
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordLengthError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return null;
}

// The 400 answers about a field look like "new_password: Must be at least 8 characters long"
export function serverFieldMessage(message: string, field: string): string | null {
  const prefix = `${field}:`;
  return message.startsWith(prefix) ? message.slice(prefix.length).trim() : null;
}

export interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const emptyChangePasswordForm: ChangePasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordForm, string>>;

// The passwords are sent as typed: spaces are part of them, so they are never trimmed
export function validateChangePassword(form: ChangePasswordForm): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (!form.currentPassword) errors.currentPassword = 'Enter the password you were given.';
  if (!form.newPassword) {
    errors.newPassword = 'Choose a new password.';
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = 'The new password must be different from the current one.';
  } else {
    const lengthError = passwordLengthError(form.newPassword);
    if (lengthError) errors.newPassword = lengthError;
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = 'Type the new password again.';
  } else if (form.newPassword && form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'The two passwords are not the same.';
  }
  return errors;
}

// Where to go once the password is changed: back to what the person wanted to open,
// otherwise to the home page of their role. Only paths of this site are accepted.
export function destinationAfterChange(from: unknown, role: 'hiker' | 'employee' | 'warden'): string {
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.startsWith('/change-password') &&
    !from.startsWith('/login')
  ) {
    return from;
  }
  return role === 'hiker' ? '/book-table' : '/staff/slots';
}

export interface ResetPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

export const emptyResetPasswordForm: ResetPasswordForm = { newPassword: '', confirmPassword: '' };

export type ResetPasswordErrors = Partial<Record<keyof ResetPasswordForm, string>>;

// Same rule as registration: 8 to 128 characters, typed twice, spaces included
export function validateResetPassword(form: ResetPasswordForm): ResetPasswordErrors {
  const errors: ResetPasswordErrors = {};
  if (!form.newPassword) {
    errors.newPassword = 'Choose a new password.';
  } else {
    const lengthError = passwordLengthError(form.newPassword);
    if (lengthError) errors.newPassword = lengthError;
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = 'Type the new password again.';
  } else if (form.newPassword && form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'The two passwords are not the same.';
  }
  return errors;
}