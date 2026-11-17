import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { apiClient, ApiError } from '../../../api/client';
import {
  emptyResetPasswordForm,
  validateResetPassword,
  type ResetPasswordErrors,
  type ResetPasswordForm as FormValues,
} from '../utils/changePassword';

const inputClass = (invalid: boolean) =>
  `w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border rounded-xl text-sm text-[#1C2826] focus:outline-none transition-all ${
    invalid ? 'border-red-400 focus:border-red-500' : 'border-[#EFEADF] focus:border-[#234E39]'
  }`;

const FIELDS = [
  { name: 'newPassword', id: 'reset-new-password', label: 'New password' },
  { name: 'confirmPassword', id: 'reset-confirm-password', label: 'Repeat the new password' },
] as const;

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-6">{children}</div>
);

// The page of the link in the email: /reset-password?token=...
export const ResetPasswordForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [form, setForm] = useState<FormValues>(emptyResetPasswordForm);
  const [fieldErrors, setFieldErrors] = useState<ResetPasswordErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const setField = (name: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const errors = validateResetPassword(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await apiClient.post('/password-reset/confirm', { token, newPassword: form.newPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // An old, used or wrong link: a new one has to be asked for
        setLinkProblem(err.message || 'This link is not valid any more.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('The server is not reachable right now. Please try again later.');
      } else {
        setError('Could not change the password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-[#EAF3EE] text-[#234E39] rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1C2826]">Password changed</h2>
          <p role="status" className="text-sm text-[#5A6865]">You can now sign in with your new password.</p>
          <Link
            to="/login"
            className="inline-block w-full py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all text-sm"
          >
            Sign in
          </Link>
        </div>
      </Card>
    );
  }

  if (!token || linkProblem) {
    return (
      <Card>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1C2826]">This link does not work</h2>
          <p role="alert" className="text-sm text-[#5A6865]">
            {linkProblem ?? 'The link is incomplete.'} Links work once and for 24 hours. Ask for a new one.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block w-full py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all text-sm"
          >
            Ask for a new link
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Choose a new password</h2>
        <p className="text-xs text-[#5A6865]">Type the password you want to use from now on.</p>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {FIELDS.map(({ name, id, label }) => (
          <div key={name} className="space-y-1.5">
            <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-[#5A6865]">
              {label}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
              <input
                id={id}
                type="password"
                autoComplete="new-password"
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
            <span>Save new password</span>
          )}
        </button>
      </form>
    </Card>
  );
};