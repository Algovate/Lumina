import { useState, useEffect } from 'react';
import { signIn, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from '../hooks/useAuth';
import { getCognitoConfig } from '../utils/config';
import { logger } from '../utils/logger';

export const LoginForm = () => {
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showConfigWarning, setShowConfigWarning] = useState(true);

  // 检查 Cognito 配置是否有效
  const cognitoConfig = getCognitoConfig();
  const isConfigValid = cognitoConfig.userPoolId && 
    cognitoConfig.userPoolId !== 'NOT_CONFIGURED' &&
    cognitoConfig.userPoolId !== 'dummy_pool_id' &&
    cognitoConfig.userPoolId.includes('_') &&
    cognitoConfig.clientId &&
    cognitoConfig.clientId !== 'NOT_CONFIGURED' &&
    cognitoConfig.clientId !== 'dummy_client_id';

  // 监听 Hub 事件，登录成功后刷新认证状态
  useEffect(() => {
    const listener = Hub.listen('auth', ({ payload: { event } }) => {
      if (event === 'signedIn') {
        logger.info('User signed in, refreshing auth state...');
        // 延迟一下确保 token 已经准备好
        setTimeout(() => {
          refresh();
        }, 500);
      }
    });

    return () => listener();
  }, [refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // 检查配置是否有效
    if (!isConfigValid) {
      setError('Cognito 配置未设置。请在 frontend/.env 文件中配置 VITE_COGNITO_USER_POOL_ID 和 VITE_COGNITO_USER_POOL_CLIENT_ID，或部署应用后使用部署脚本生成的配置。');
      return;
    }
    
    setLoading(true);

    try {
      const trimmedUsername = username.trim();
      logger.info('Attempting to sign in with username:', trimmedUsername);
      
      const result = await signIn({
        username: trimmedUsername,
        password: password,
      });
      
      logger.info('Sign in result:', result);
      
      // 检查是否需要完成额外的挑战（如新密码设置）
      if (result.isSignedIn) {
        // 登录成功，等待 Hub 事件触发或手动刷新
        setTimeout(() => {
          refresh();
        }, 500);
      } else {
        // 可能需要完成额外的挑战
        logger.info('Sign in requires additional steps:', result.nextStep);
        const nextStepType = result.nextStep?.signInStep;
        
        if (nextStepType === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' || 
            nextStepType === 'CONFIRM_SIGN_IN_WITH_SMS_CODE' ||
            nextStepType === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
          setError('登录需要完成额外的验证步骤。请检查控制台了解详细信息，或联系管理员。');
        } else {
          setError(`登录需要额外的步骤（${nextStepType || 'unknown'}）。请检查控制台获取详细信息。`);
        }
        setLoading(false);
      }
      
    } catch (err: any) {
      console.error('Login error details:', {
        name: err.name,
        message: err.message,
        code: err.code,
        username: username.trim(),
      });
      
      // 处理不同的错误类型
      if (err.name === 'NotAuthorizedException') {
        // 提供更详细的错误信息和解决建议
        const errorDetails = [
          '用户名或密码错误。',
          '',
          '请检查：',
          '• 用户名是否正确（区分大小写）',
          '• 密码是否正确',
          '• 用户是否已在 Cognito 中创建',
          '',
          '💡 提示：',
          '• 如果用户不存在，运行: ./scripts/create-user.sh <email> ' + username.trim() + ' <password>',
          '• 如果密码错误，可以使用"忘记密码"功能重置',
        ].join('\n');
        setError(errorDetails);
      } else if (err.name === 'UserNotConfirmedException') {
        setError('账户未确认，请检查邮箱并确认账户');
      } else if (err.name === 'UserNotFoundException') {
        const errorDetails = [
          `用户 "${username.trim()}" 不存在。`,
          '',
          '可以使用以下命令创建用户：',
          './scripts/create-user.sh <email> ' + username.trim() + ' <password>',
          '',
          '查看 docs/DEVELOPMENT.md 了解详细步骤。',
        ].join('\n');
        setError(errorDetails);
      } else if (err.name === 'InvalidParameterException') {
        setError('参数错误：' + (err.message || '请检查输入'));
      } else if (err.message) {
        setError(`登录失败：${err.message}`);
      } else {
        setError('登录失败，请重试。错误类型：' + err.name);
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!username.trim()) {
      setError('请输入用户名或邮箱');
      return;
    }

    setResetLoading(true);
    setError(null);

    try {
      await resetPassword({
        username: username.trim(),
      });
      setShowForgotPassword(true);
      setError(null);
    } catch (err: any) {
      console.error('Reset password error:', err);
      if (err.name === 'UserNotFoundException') {
        setError(`用户 "${username.trim()}" 不存在`);
      } else if (err.message) {
        setError(`重置密码失败：${err.message}`);
      } else {
        setError('重置密码失败，请重试');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetCode || !newPassword) {
      setError('请输入验证码和新密码');
      return;
    }

    if (newPassword.length < 8) {
      setError('密码长度至少8位');
      return;
    }

    setResetLoading(true);
    setError(null);

    try {
      await confirmResetPassword({
        username: username.trim(),
        confirmationCode: resetCode,
        newPassword: newPassword,
      });
      setError(null);
      setShowForgotPassword(false);
      setResetCode('');
      setNewPassword('');
      alert('密码重置成功！请使用新密码登录。');
    } catch (err: any) {
      console.error('Confirm reset password error:', err);
      if (err.name === 'CodeMismatchException') {
        setError('验证码错误，请检查邮箱中的验证码');
      } else if (err.name === 'InvalidPasswordException') {
        setError('密码不符合要求，请确保密码至少8位，包含大小写字母、数字和特殊字符');
      } else if (err.message) {
        setError(`重置密码失败：${err.message}`);
      } else {
        setError('重置密码失败，请重试');
      }
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">重置密码</h1>
            <p className="text-gray-600">请输入邮箱中的验证码和新密码</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmResetPassword();
              }}
              className="p-8"
            >
              <div className="mb-4">
                <label htmlFor="resetCode" className="block text-sm font-medium text-gray-700 mb-2">
                  验证码
                </label>
                <input
                  id="resetCode"
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入邮箱中的验证码"
                  disabled={resetLoading}
                />
              </div>

              <div className="mb-6">
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  新密码
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入新密码（至少8位）"
                  disabled={resetLoading}
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {resetLoading ? '处理中...' : '确认重置密码'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetCode('');
                  setNewPassword('');
                  setError(null);
                }}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                返回登录
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lumina</h1>
          <p className="text-gray-500 italic mb-1">让回忆在云端发光</p>
          <p className="text-sm text-gray-400">S3 Photo Management</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <form onSubmit={handleSubmit} className="p-8">
            {!isConfigValid && showConfigWarning && import.meta.env.DEV && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg relative">
                <button
                  onClick={() => setShowConfigWarning(false)}
                  className="absolute top-2 right-2 text-yellow-600 hover:text-yellow-800 transition-colors"
                  aria-label="关闭提示"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <p className="text-sm font-medium text-yellow-800 mb-2 pr-6">⚠️ Cognito 配置未设置</p>
                <p className="text-xs text-yellow-700 mb-2">
                  请在 <code className="bg-yellow-100 px-1 rounded">frontend/.env</code> 文件中配置：
                </p>
                <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1 mb-2">
                  <li><code>VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX</code></li>
                  <li><code>VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxx</code></li>
                </ul>
                <p className="text-xs text-yellow-700">
                  或部署应用后使用部署脚本生成的配置。
                </p>
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入用户名或邮箱"
                disabled={loading}
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pr-10"
                  placeholder="请输入密码"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-sm text-red-800">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  登录中...
                </span>
              ) : (
                '登录'
              )}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading || loading}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {resetLoading ? '发送中...' : '忘记密码？'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
