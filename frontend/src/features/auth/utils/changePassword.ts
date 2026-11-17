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

// Same rule as registration: any password, typed twice, spaces included
export function validateResetPassword(form: ResetPasswordForm): ResetPasswordErrors {
  const errors: ResetPasswordErrors = {};
  if (!form.newPassword) errors.newPassword = 'Choose a new password.';
  if (!form.confirmPassword) {
    errors.confirmPassword = 'Type the new password again.';
  } else if (form.newPassword && form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'The two passwords are not the same.';
  }
  return errors;
}