import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

interface User {
  id: string | number;
  username: string;
  role: 'hiker' | 'employee' | 'warden';
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load session on startup
  useEffect(() => {
    async function loadSession() {
      try {
        const data = await apiClient.get('/session/current');
        setUser(data.user || data);
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    // Backend expects { username: email, password }
    const data = await apiClient.post('/session', { username: email, password });
    setUser(data.user || data);
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};