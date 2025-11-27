import type { S3Config } from '../types';

// 从运行时配置或环境变量获取配置
const getConfigValue = (key: string, defaultValue: string = ''): string => {
  // 优先使用运行时配置（从 config.js 加载）
  if (typeof window !== 'undefined' && window.LUMINA_CONFIG) {
    const runtimeConfig = window.LUMINA_CONFIG[key];
    if (runtimeConfig) {
      return runtimeConfig;
    }
  }
  // 回退到构建时环境变量
  return import.meta.env[key] || defaultValue;
};

// Note: This function is kept for potential future use, but AWS credentials
// should NEVER be included in frontend code. Frontend uses presigned URLs
// from the backend API for all S3 operations.
export const getS3Config = (): S3Config => {
  return {
    bucket: getConfigValue('VITE_S3_BUCKET', ''),
    region: getConfigValue('VITE_AWS_REGION', 'us-east-1'),
    // AWS credentials removed for security - frontend uses presigned URLs only
  };
};

export const getApiUrl = (): string => {
  // 优先使用运行时配置，否则使用环境变量或默认值
  let apiUrl = getConfigValue('VITE_API_URL', 'http://localhost:3000/api');

  // 规范化：去掉末尾多余的斜杠，保留协议后的双斜杠
  // 例如：https://example.com///api -> https://example.com/api
  apiUrl = apiUrl.replace(/([^:])\/+$/u, '$1');

  // 确保 URL 以 /api 结尾（Lambda Function URL 可能不包含 /api 路径）
  // 如果 URL 已经包含 /api，直接返回；否则添加 /api
  if (apiUrl.endsWith('/api')) {
    return apiUrl;
  }

  // 如果 URL 是 Lambda Function URL（以 .lambda-url. 或 .on.aws 结尾），需要添加 /api
  if (apiUrl.includes('.lambda-url.') || apiUrl.includes('.on.aws')) {
    return `${apiUrl}/api`;
  }

  // 对于本地开发，确保有 /api 路径
  if (apiUrl === 'http://localhost:3000' || apiUrl === 'http://localhost:3000/') {
    return 'http://localhost:3000/api';
  }

  return apiUrl;
};

// 获取 Cognito 配置
export const getCognitoConfig = () => {
  const region = getConfigValue('VITE_AWS_REGION', 'us-east-1');
  const userPoolId = getConfigValue('VITE_COGNITO_USER_POOL_ID', '');
  // Extract region from userPoolId if available (format: region_poolId)
  const extractedRegion = userPoolId.includes('_') 
    ? userPoolId.split('_')[0] 
    : region;
  
  // Build full Cognito domain URL if only prefix is provided
  const domainPrefix = getConfigValue('VITE_COGNITO_DOMAIN', '');
  let fullDomain = domainPrefix;
  // If domain doesn't include .auth., it's just a prefix - build full URL
  if (domainPrefix && !domainPrefix.includes('.auth.')) {
    fullDomain = `${domainPrefix}.auth.${extractedRegion}.amazoncognito.com`;
  }
  
  return {
    userPoolId,
    clientId: getConfigValue('VITE_COGNITO_USER_POOL_CLIENT_ID', ''),
    domain: fullDomain,
    region: extractedRegion,
  };
};

