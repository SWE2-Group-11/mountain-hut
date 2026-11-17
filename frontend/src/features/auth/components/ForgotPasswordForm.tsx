import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, Mail, MailCheck } from 'lucide-react';
import { apiClient, ApiError } from '../../../api/client';

// String checks instead of a regex: no backtracking, and Sonar stays quiet
function isValidEmail(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

// Asks for the email of the account; the server sends a link to choose a new password (valid 24 hours)
export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/password-reset', { email: trimmed });
      setSentTo(trimmed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('The server is not reachable right now. Please try again later.');
      } else {
        setError('Could not send the email. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // The same answer whether or not an account exists: the page must not reveal who has one
  if (sentTo) {
    return (
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-5 text-center">
        <div className="w-12 h-12 bg-[#EAF3EE] text-[#234E39] rounded-2xl flex items-center justify-center mx-auto">
          <MailCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-[#1C2826]">Check your email</h2>
        <p role="status" className="text-sm text-[#5A6865]">
          If there is an account for <strong className="text-[#1C2826]">{sentTo}</strong>, we have sent a link to choose
          a new password. The link works for 24 hours.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="text-xs font-semibold text-[#234E39] hover:underline cursor-pointer"
        >
          Use another email address
        </button>
        <div>
          <Link to="/login" className="text-xs text-[#5A6865] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Forgot your password?</h2>
        <p className="text-xs text-[#5A6865]">
          Enter the email address of your account. We will send you a link to choose a new password.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-wider text-[#5A6865]">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border border-[#EFEADF] rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <span>Send the link</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-center">
        <Link to="/login" className="text-[#5A6865] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
};