import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../useAuth';
import { apiClient, ApiError } from '../../../api/client';
import {
  MAX_TEXT_LENGTH,
  emptyRegistrationForm,
  toRegistrationRequest,
  trimmedLength,
  validateRegistration,
  type RegistrationErrors,
  type RegistrationForm,
} from '../utils/registration';

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-3 bg-[#FDFBF7] border rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all ${
    hasError ? 'border-red-300' : 'border-[#EFEADF]'
  }`;

const labelClass = 'text-xs font-bold uppercase tracking-wider text-[#5A6865]';

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ id, label, error, hint, optional, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className={labelClass}>
      {label}
      {optional && <span className="ml-1 normal-case font-normal tracking-normal text-[#7C8885]">(optional)</span>}
    </label>
    {children}
    {hint && !error && <p className="text-xs text-[#7C8885]">{hint}</p>}
    {error && (
      <p id={`${id}-error`} className="text-xs text-red-600">
        {error}
      </p>
    )}
  </div>
);

export const RegisterForm: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState<RegistrationForm>(emptyRegistrationForm);
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  // Someone who is already signed in has no reason to be here
  if (!authLoading && user && !createdEmail) {
    const destination = user.role === 'hiker' ? '/book-table' : '/staff/slots';
    return <Navigate to={destination} replace />;
  }

  const setField = (name: keyof RegistrationForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = e.target.value;
    const next = { ...form, [name]: value };
    setForm(next);
    // Once a field showed an error, re-check the form while the person types
    // so the message disappears as soon as the problem is solved.
    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors(validateRegistration(next));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    const errors = validateRegistration(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      // The account is created, but the person is NOT logged in by the server
      await apiClient.post('/accounts', toRegistrationRequest(form));
      setCreatedEmail(form.email.trim().toLowerCase());
      setForm(emptyRegistrationForm);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: 'An account with this email already exists.' });
        setFormError('This email is already registered. Try signing in instead.');
      } else if (err instanceof ApiError && err.status === 400) {
        setFormError('Some details are not valid. Please check the form and try again.');
      } else if (err instanceof ApiError) {
        setFormError('Something went wrong on our side. Please try again later.');
      } else {
        setFormError('The server is not reachable right now. Please try again later.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdEmail) {
    return (
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-5 text-center">
        <CheckCircle2 className="w-10 h-10 text-[#234E39] mx-auto" />
        <div role="status">
          <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Your account is ready</h2>
          <p className="text-sm text-[#5A6865]">
            You can now sign in with <span className="font-semibold text-[#1C2826]">{createdEmail}</span>.
          </p>
        </div>
        <Link
          to="/login"
          className="w-full py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
        >
          <span>Go to sign in</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Create an account</h2>
        <p className="text-xs text-[#5A6865]">One account lets you book a table at the hut.</p>
      </div>

      {formError && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Account not created</span>
            {formError}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field id="register-fullname" label="Full name" error={fieldErrors.fullname}>
          <input
            id="register-fullname"
            type="text"
            autoComplete="name"
            value={form.fullname}
            onChange={setField('fullname')}
            aria-invalid={!!fieldErrors.fullname}
            aria-describedby={fieldErrors.fullname ? 'register-fullname-error' : undefined}
            className={inputClass(!!fieldErrors.fullname)}
          />
        </Field>

        <Field id="register-mobile" label="Mobile number" error={fieldErrors.mobileNumber}>
          <input
            id="register-mobile"
            type="tel"
            autoComplete="tel"
            value={form.mobileNumber}
            onChange={setField('mobileNumber')}
            aria-invalid={!!fieldErrors.mobileNumber}
            aria-describedby={fieldErrors.mobileNumber ? 'register-mobile-error' : undefined}
            className={inputClass(!!fieldErrors.mobileNumber)}
          />
        </Field>

        <Field id="register-email" label="Email address" error={fieldErrors.email}>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={setField('email')}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            className={inputClass(!!fieldErrors.email)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="register-password" label="Password" error={fieldErrors.password}>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={setField('password')}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
              className={inputClass(!!fieldErrors.password)}
            />
          </Field>
          <Field id="register-confirm" label="Repeat password" error={fieldErrors.confirmPassword}>
            <input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
              className={inputClass(!!fieldErrors.confirmPassword)}
            />
          </Field>
        </div>

        <Field
          id="register-emergency"
          label="Emergency contact"
          optional
          hint="Someone the hut can call if needed: name and phone number."
          error={fieldErrors.emergencyContact}
        >
          <input
            id="register-emergency"
            type="text"
            value={form.emergencyContact}
            onChange={setField('emergencyContact')}
            aria-invalid={!!fieldErrors.emergencyContact}
            aria-describedby={fieldErrors.emergencyContact ? 'register-emergency-error' : undefined}
            className={inputClass(!!fieldErrors.emergencyContact)}
          />
          <p className="text-xs text-[#7C8885] text-right" aria-live="polite">
            {trimmedLength(form.emergencyContact)}/{MAX_TEXT_LENGTH}
          </p>
        </Field>

        <Field id="register-notes" label="Notes" optional error={fieldErrors.notes}>
          <textarea
            id="register-notes"
            rows={3}
            value={form.notes}
            onChange={setField('notes')}
            aria-invalid={!!fieldErrors.notes}
            aria-describedby={fieldErrors.notes ? 'register-notes-error' : undefined}
            className={`${inputClass(!!fieldErrors.notes)} resize-none`}
          />
          <p className="text-xs text-[#7C8885] text-right" aria-live="polite">
            {trimmedLength(form.notes)}/{MAX_TEXT_LENGTH}
          </p>
        </Field>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-2 py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create account</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-[#5A6865] text-center">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-[#234E39] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
};