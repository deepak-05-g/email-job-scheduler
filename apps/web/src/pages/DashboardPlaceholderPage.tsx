import React from 'react';
import { useAuth } from '../hooks/useAuth.js';

export const DashboardPlaceholderPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="w-full bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Email Scheduler</span>
        </div>

        <button
          onClick={logout}
          className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-sm font-medium rounded-xl border border-slate-700 transition-all duration-150 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span>Logout</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-8 flex flex-col items-center justify-center text-center">
        <div className="w-full max-w-xl bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Avatar */}
          <div className="relative mb-4 mx-auto w-24 h-24">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || 'User Avatar'}
                className="w-24 h-24 rounded-full border-2 border-indigo-500/50 object-cover shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center text-3xl font-bold text-indigo-400">
                {user?.name
                  ? user.name.charAt(0).toUpperCase()
                  : user?.email.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            Welcome, {user?.name || 'Scheduled User'}!
          </h2>
          <p className="text-indigo-400 text-sm font-mono mb-6">{user?.email}</p>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl text-left text-xs space-y-2 mb-6">
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500 font-medium">User Database ID:</span>
              <span className="font-mono text-slate-300">{user?.id}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-500 font-medium">Authentication Status:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Authenticated (Google OAuth 2.0)
              </span>
            </div>
          </div>

          <p className="text-slate-400 text-xs italic">
            This placeholder will be replaced with the ReachInbox Figma dashboard UI in subsequent
            steps.
          </p>
        </div>
      </main>
    </div>
  );
};
