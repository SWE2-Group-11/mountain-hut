import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../useAuth';
import { ApiError } from '../../../api/client';
import { Mail, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginForm: React.FC = () => {
  const { user, loading: authLoading, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // All hooks are above this line. Already logged in (or just logged in): redirect by role.
  if (!authLoading && user) {
    const destination = user.role === 'hiker' ? '/book-table' : '/';
    return <Navigate to={destination} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    // Validate before sending
    if (!email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Calls POST /api/v1/session with { username: email, password } via AuthContext
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect email or password.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('The server is not reachable right now. Please try again later.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF] space-y-6">
      <div className="mb-2">
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">Sign in</h2>
        <p className="text-xs text-[#5A6865]">
          Enter your credentials to book a table or manage the hut.
        </p>
      </div>

      {/* Error message box */}
      {error && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Authentication error</span>
            {error}
          </div>
        </div>
      )}

      <form onSubmit={handleLogin} noValidate className="space-y-4">
        {/* Email field */}
        <div className="space-y-1.5">
          <label
            htmlFor="login-email"
            className="text-xs font-bold uppercase tracking-wider text-[#5A6865]"
          >
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border border-[#EFEADF] rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            />
          </div>
        </div>

        {/* Password field */}
        <div className="space-y-1.5">
          <label
            htmlFor="login-password"
            className="text-xs font-bold uppercase tracking-wider text-[#5A6865]"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border border-[#EFEADF] rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            />
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-2 py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};