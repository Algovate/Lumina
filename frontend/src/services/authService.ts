import {
  signOut,
  getCurrentUser,
  fetchAuthSession
} from 'aws-amplify/auth';
import type { AuthUser } from '../types/auth';

class AuthService {
  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.payload;

      // 获取显示名称：优先使用 name，如果没有则使用 email，最后使用 username
      // 注意：由于 User Pool 配置了 --username-attributes email，username 应该是邮箱
      const email = (idToken?.email as string) || undefined;
      const name = (idToken?.name as string) || email || user.username;
      
      return {
        id: user.userId,
        name: name,
        email: email,
        picture: (idToken?.picture as string) || undefined,
        provider: 'cognito',
      };
    } catch (error) {
      // Not authenticated
      return null;
    }
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      
      if (!session.tokens) {
        // 未登录时没有 token 是正常的，不输出警告
        return null;
      }
      
      const accessToken = session.tokens.accessToken;
      
      if (!accessToken) {
        // 未登录时没有 token 是正常的，不输出警告
        return null;
      }
      
      // AWS Amplify v6: accessToken 是一个对象，需要调用 toString() 获取 JWT 字符串
      // 或者直接使用，如果它已经是字符串
      let tokenString: string;
      
      if (typeof accessToken === 'string') {
        tokenString = accessToken;
      } else {
        // accessToken 是 AccessToken 对象，调用 toString() 获取 JWT 字符串
        tokenString = accessToken.toString();
      }
      
      if (!tokenString || tokenString.length === 0) {
        return null;
      }
      
      return tokenString;
    } catch (error) {
      // 只有在非预期的错误时才输出日志
      const err = error as { name?: string };
      if (err?.name !== 'NotAuthorizedException') {
        console.error('Error getting access token:', error);
      }
      return null;
    }
  }

  /**
   * Sign out
   */
  async logout(): Promise<void> {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  /**
   * Check auth status (alias for getCurrentUser for compatibility)
   */
  async checkAuth(): Promise<AuthUser | null> {
    return this.getCurrentUser();
  }
}

export const authService = new AuthService();
