export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  picture?: string;
  provider: 'cognito';
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

