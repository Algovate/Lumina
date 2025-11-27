import express from 'express';
// import cors from 'cors'; // 已禁用：CORS 由 Lambda Function URL 层面配置处理
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { validateS3Key } from './utils/validation';
import { getErrorMessage, getErrorName } from './types/errors';
import { S3_CONSTANTS, RATE_LIMIT_CONSTANTS } from './constants';
import { logger } from './utils/logger';
import { validateConfig } from './utils/configValidation';
import s3Routes from './routes/s3';
import tagsRoutes from './routes/tags';

dotenv.config();

// Global error handlers for Lambda - prevent crashes from unhandled errors
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in Lambda - let the request complete
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit in Lambda - let the request complete
});

// Validate configuration on startup
const configValidation = validateConfig();
if (!configValidation.valid) {
  configValidation.errors.forEach((error) => {
    if (error.startsWith('Warning:')) {
      logger.warn(error);
    } else {
      logger.error(error);
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting configuration
// Note: In Lambda, rate limiting is also handled at the AWS API Gateway/Lambda level
// This provides an additional layer of protection
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONSTANTS.WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for health check endpoint
  skip: (req) => req.path === '/health',
});

// Middleware
// 注意：CORS 由 Lambda Function URL 层面配置处理
// 在 Lambda 环境中，Lambda Function URL 会自动添加 CORS 头
// Express CORS 中间件已完全移除，避免重复的 CORS 头

app.use(express.json());

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// AWS S3 Client (使用 Lambda IAM 角色凭证，自动从执行角色获取)
// Lambda 自动提供 AWS_REGION 环境变量，AWS SDK 会自动使用执行角色的凭证
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';

// Cognito JWT Verifier - 只在配置有效时创建
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

const getVerifier = () => {
  // 检查环境变量是否配置
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || userPoolId === 'dummy_pool_id' || !clientId || clientId === 'dummy_client_id') {
    return null;
  }

  // 如果 verifier 已创建且配置未改变，直接返回
  if (verifier) {
    return verifier;
  }

  // 创建 verifier
  try {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });
    return verifier;
  } catch (err) {
    logger.error('Failed to create Cognito JWT Verifier:', err);
    return null;
  }
};

// Authentication Middleware
const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);

  // 获取 verifier（如果配置有效）
  const jwtVerifier = getVerifier();
  
  if (!jwtVerifier) {
    logger.error('COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID not configured');
    // 在开发环境中返回更友好的错误信息，生产环境不暴露配置详情
    const isDev = process.env.NODE_ENV !== 'production';
    const errorResponse: Record<string, unknown> = { 
      error: 'Server configuration error: Authentication service not available',
    };
    
    if (isDev) {
      errorResponse.message = 'Please configure COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID in backend/express/.env file';
      errorResponse.details = {
        COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ? 'set' : 'not set',
        COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ? 'set' : 'not set',
      };
    }
    
    return res.status(isDev ? 503 : 500).json(errorResponse);
  }

  try {
    // Verify the token
    const payload = await jwtVerifier.verify(token);
    // Attach user info to request
    req.user = payload;
    next();
  } catch (err: unknown) {
    // Log detailed error for debugging (server-side only)
    const isDev = process.env.NODE_ENV !== 'production';
    const errorName = getErrorName(err);
    const errorMessage = getErrorMessage(err);
    
    logger.error("Token verification failed:", {
      error: errorMessage,
      name: errorName,
      // Only log token preview in development
      ...(isDev && { tokenPreview: token.substring(0, 20) + '...' }),
      // Never log actual credentials, only whether they're configured
      userPoolIdConfigured: !!process.env.COGNITO_USER_POOL_ID,
      clientIdConfigured: !!process.env.COGNITO_CLIENT_ID,
    });
    
    // Provide user-friendly error messages without exposing sensitive details
    let userErrorMessage = 'Unauthorized: Invalid token';
    if (errorName === 'TokenExpiredError') {
      userErrorMessage = 'Token expired. Please login again.';
    } else if (errorName === 'JsonWebTokenError') {
      userErrorMessage = 'Invalid token format.';
    } else if (isDev && errorMessage) {
      // Only include detailed error message in development
      userErrorMessage = `Token verification failed: ${errorMessage}`;
    }
    
    return res.status(401).json({ error: userErrorMessage });
  }
};

// Health check endpoint (不需要认证)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 旧的预签名 URL 端点（保持兼容性）
app.post('/api/presign', authenticate, async (req, res) => {
  try {
    const { operation, key, contentType, expiresIn = S3_CONSTANTS.PRESIGNED_URL_EXPIRATION } = req.body;

    if (!operation || !key) {
      return res.status(400).json({ error: 'Missing required fields: operation, key' });
    }

    // Validate S3 key
    try {
      validateS3Key(key);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    let command;
    const expiresInSeconds = Math.min(expiresIn, S3_CONSTANTS.MAX_PRESIGNED_URL_EXPIRATION);

    switch (operation) {
      case 'get':
        command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        break;
      case 'put':
        command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          ContentType: contentType || 'application/octet-stream',
        });
        break;
      case 'delete':
        command = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        break;
      default:
        return res.status(400).json({ error: 'Invalid operation. Must be: get, put, or delete' });
    }

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    res.json({
      url,
      expiresIn: expiresInSeconds,
    });
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// Register route modules (all routes require authentication)
app.use('/api/s3', authenticate, s3Routes);
app.use('/api/s3', authenticate, tagsRoutes);

// Global error handler middleware - must be after all routes
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in Express:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV !== 'production' ? getErrorMessage(err) : undefined,
    });
  }
});

// 导出 app 供 Lambda 使用
export default app;

// 只在非 Lambda 环境下启动服务器
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
  });
}
