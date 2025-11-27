import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { getCognitoConfig } from './utils/config';
import { logger } from './utils/logger';

// 从运行时配置或环境变量获取 Cognito 配置
const getConfigValue = (key: string, defaultValue: string = ''): string => {
  if (typeof window !== 'undefined' && window.LUMINA_CONFIG) {
    const runtimeConfig = window.LUMINA_CONFIG[key];
    if (runtimeConfig) {
      return runtimeConfig;
    }
  }
  return import.meta.env[key] || defaultValue;
};

const cognitoConfig = getCognitoConfig();
const userPoolId = cognitoConfig.userPoolId || getConfigValue('VITE_COGNITO_USER_POOL_ID', '');
const clientId = cognitoConfig.clientId || getConfigValue('VITE_COGNITO_USER_POOL_CLIENT_ID', '');

// 只在配置有效时配置 Amplify（避免使用 dummy 值）
// User Pool ID 格式应该是: region_poolId (例如: us-east-1_XXXXXXXXX)
const isValidUserPoolId = userPoolId && 
  userPoolId !== 'dummy_pool_id' && 
  userPoolId !== '' &&
  userPoolId.includes('_') &&
  userPoolId.split('_').length >= 2;

const isValidClientId = clientId && 
  clientId !== 'dummy_client_id' && 
  clientId !== '';

if (isValidUserPoolId && isValidClientId) {
  interface AmplifyConfig {
    Auth: {
      Cognito: {
        userPoolId: string;
        userPoolClientId: string;
        loginWith: {
          email: boolean;
          username: boolean;
        };
      };
    };
  }
  
  const amplifyConfig: AmplifyConfig = {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        loginWith: {
          email: true,
          username: true,
        },
      }
    }
  };
  
  Amplify.configure(amplifyConfig);
} else {
  // 在开发环境中，静默处理配置缺失（UI 会显示提示）
  // 只在非生产环境且配置明确无效时记录调试信息
  if (import.meta.env.DEV && (userPoolId || clientId)) {
    logger.debug('Cognito configuration is not valid. UI will show configuration instructions.');
  }
  
  // 配置一个占位符配置，但不会尝试连接
  // 这样前端可以显示配置错误提示，而不会崩溃
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: 'NOT_CONFIGURED',
        userPoolClientId: 'NOT_CONFIGURED',
        loginWith: {
          email: true,
          username: true,
        },
      }
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
