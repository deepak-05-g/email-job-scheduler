import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Google OAuth is the primary authentic provider for this application
    loginWithGoogle();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Login Card */}
      <div className="w-full max-w-md bg-white border border-gray-200/90 rounded-2xl p-8 shadow-sm">
        {/* Brand header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            O
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">OutBox</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-2">Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          Welcome back! Please enter your details to sign in.
        </p>

        {errorParam && (
          <div className="w-full mb-5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
            Authentication failed: {errorParam.replace(/_/g, ' ')}
          </div>
        )}

        {/* Login with Google Button */}
        <button
          onClick={loginWithGoogle}
          type="button"
          className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-500/30 text-emerald-800 font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-3 shadow-xs active:scale-[0.99] mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Login with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
            or sign up through email
          </span>
          <div className="border-t border-gray-200 w-full" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
              Email ID
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-xs active:scale-[0.99] text-sm"
          >
            Login
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
