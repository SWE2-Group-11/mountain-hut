import React, { useEffect, useState } from 'react';
import { apiClient, ApiError } from '../../api/client';
import { AuthContext, type User } from './AuthContext';

// What the backend sends for an account: the flag may be called must_change_password or mustChangePassword
type SessionResponse = Omit<User, 'mustChangePassword'> & {
  must_change_password?: boolean | number;
  mustChangePassword?: boolean;
};

function toUser(data: SessionResponse): User {
  const { must_change_password, mustChangePassword, ...rest } = data;
  return { ...rest, mustChangePassword: Boolean(mustChangePassword ?? must_change_password) };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load session on startup
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const data: SessionResponse = await apiClient.get('/session/current');
        if (!cancelled) setUser(toUser(data));
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

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Throws on failure (e.g. ApiError 401) so the login form can show the message
  const login = async (email: string, password: string) => {
    const data: SessionResponse = await apiClient.post('/session', { email, password });
    setUser(toUser(data));
  };

  const logout = async () => {
    try {
      await apiClient.delete('/session/current');
    } finally {
      setUser(null);
    }
  };

  // PUT /accounts/current/password. Throws on failure so the form can say why:
  // 400 = weak/too short password, 401 = wrong current password (or session expired).
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const data: SessionResponse = await apiClient.put('/accounts/current/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    setUser(toUser(data));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};