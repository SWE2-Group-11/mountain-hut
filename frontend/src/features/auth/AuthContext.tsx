import { createContext } from 'react';

export type Role = 'hiker' | 'employee' | 'warden';

export interface User {
  id: number;
  email: string;
  role: Role;
  // true after a member of staff created the account: the password must be changed before anything else
  mustChangePassword?: boolean;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);