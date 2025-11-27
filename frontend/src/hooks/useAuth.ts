import { useState, useEffect, useCallback } from 'react';
import { Hub } from 'aws-amplify/utils';
import { authService } from '../services/authService';
import type { AuthState } from '../types/auth';

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  const checkAuth = useCallback(async () => {
    try {
      const user = await authService.getCurrentUser();
      const token = await authService.getAccessToken();

      setState({
        isAuthenticated: !!user,
        user,
        token,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({ ...prev, loading: false, error: (error as Error).message }));
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const listener = Hub.listen('auth', ({ payload: { event } }) => {
      switch (event) {
        case 'signedIn':
          checkAuth();
          break;
        case 'signedOut':
          setState({
            isAuthenticated: false,
            user: null,
            token: null,
            loading: false,
            error: null,
          });
          break;
        case 'tokenRefresh':
          checkAuth();
          break;
      }
    });

    return () => listener();
  }, [checkAuth]);

  const login = useCallback(async () => {
    // Login is handled by Authenticator component
    // This method is kept for compatibility but might not be needed
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
  }, []);

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  };
};
