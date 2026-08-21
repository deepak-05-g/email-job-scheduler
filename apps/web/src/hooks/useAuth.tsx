import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserDto } from '@email-scheduler/shared';
import { getCurrentUser, logoutApi, ApiClientError } from '../lib/api-client.js';

interface AuthContextType {
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCurrentUser();
      setUser(data);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setUser(null);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to fetch user';
        setError(msg);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const loginWithGoogle = () => {
    const apiBase = (import.meta.env.VITE_API_PUBLIC_URL as string) || 'http://localhost:3001';
    window.location.href = `${apiBase}/api/v1/auth/google`;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore logout API errors
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        loginWithGoogle,
        logout,
        refetchUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
