import express from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getErrorMessage, getErrorName } from '../types/errors';
import { logger } from '../utils/logger';

// Cognito JWT Verifier - cached instance
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

const getVerifier = () => {
  // Check if environment variables are configured
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || userPoolId === 'dummy_pool_id' || !clientId || clientId === 'dummy_client_id') {
    return null;
  }

  // If verifier already exists and config hasn't changed, return it
  if (verifier) {
    return verifier;
  }

  // Create verifier
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

/**
 * Authentication Middleware
 * Verifies Cognito JWT access tokens
 */
export const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);

  // Get verifier (if configuration is valid)
  const jwtVerifier = getVerifier();
  
  if (!jwtVerifier) {
    logger.error('COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID not configured');
    // In development, return more friendly error messages, don't expose config details in production
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

