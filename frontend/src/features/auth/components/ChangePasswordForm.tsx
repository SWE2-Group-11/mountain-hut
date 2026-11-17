import React, { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, KeyRound, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../useAuth';
import { ApiError } from '../../../api/client';
import {
  destinationAfterChange,
  emptyChangePasswordForm,
  validateChangePassword,
  type ChangePasswordErrors,
  type ChangePasswordForm as FormValues,
} from '../utils/changePassword';

const inputClass = (invalid: boolean) =>
  `w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border rounded-xl text-sm text-[#1C2826] focus:outline-none transition-all ${
    invalid ? 'border-red-400 focus:border-red-500' : 'border-[#EFEADF] focus:border-[#234E39]'
  }`;

const FIELDS = [
  { name: 'currentPassword', id: 'current-password', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', id: 'new-password', label: 'New password', autoComplete: 'new-password' },
  { name: 'confirmPassword', id: 'confirm-password', label: 'Repeat the new password', autoComplete: 'new-password' },
] as const;

// First login of an account made by the staff: the person replaces the password they were told
export const ChangePasswordForm: React.FC = () => {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<FormValues>(emptyChangePasswordForm);
  const [fieldErrors, setFieldErrors] = useState<ChangePasswordErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Once saved, the user no longer has to change the password: keep this page from sending them home before they move on
  const saved = useRef(false);

  // Nothing to change for everyone else
  if (!user?.mustChangePassword && !saved.current) {
    return <Navigate to="/" replace />;
  }

  const setField = (name: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const errors = validateChangePassword(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      saved.current = true;
      await changePassword(form.currentPassword, form.newPassword);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(destinationAfterChange(from, user!.role), { replace: true });
    } catch (err) {
      saved.current = false;
      if (err instanceof ApiError && err.status === 403) {
        setFieldErrors({ currentPassword: 'This is not the password you were given.' });
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError('Could not change the password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-6">
      <div>
        <div className="w-12 h-12 bg-[#EAF3EE] text-[#234E39] rounded-2xl flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Choose a new password</h2>
        <p className="text-xs text-[#5A6865]">
          Your account was created by the hut staff and the password was given to you in person. Choose your own
          password to continue. If you forget it later, you can recover it by email.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {FIELDS.map(({ name, id, label, autoComplete }) => (
          <div key={name} className="space-y-1.5">
            <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-[#5A6865]">
              {label}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
              <input
                id={id}
                type="password"
                autoComplete={autoComplete}
                value={form[name]}
                onChange={setField(name)}
                aria-invalid={!!fieldErrors[name]}
                aria-describedby={fieldErrors[name] ? `${id}-error` : undefined}
                className={inputClass(!!fieldErrors[name])}
              />
            </div>
            {fieldErrors[name] && (
              <p id={`${id}-error`} role="alert" className="text-xs text-red-700">
                {fieldErrors[name]}
              </p>
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-2 py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save and continue</span>
          )}
        </button>
      </form>
    </div>
  );
};