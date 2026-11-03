import { createContext } from 'react';

export type Role = 'hiker' | 'employee' | 'warden';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);