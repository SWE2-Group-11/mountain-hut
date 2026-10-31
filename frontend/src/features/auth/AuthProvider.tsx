import React, { useEffect, useState } from 'react';
import { apiClient, ApiError } from '../../api/client';
import { AuthContext, type User } from './AuthContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load session on startup
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const data: User = await apiClient.get('/session/current');
        if (!cancelled) setUser(data);
      } catch (err) {
        // 401 simply means "not logged in"; anything else is a real problem
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('Could not load the session', err);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Throws on failure (e.g. ApiError 401) so the login form can show the message
  const login = async (email: string, password: string) => {
    // The backend expects { username: email, password }
    const data: User = await apiClient.post('/session', { username: email, password });
    setUser(data);
  };

  const logout = async () => {
    try {
      await apiClient.delete('/session/current');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};