import { CognitoJwtPayload } from 'aws-jwt-verify';

declare global {
  namespace Express {
    interface Request {
      user?: CognitoJwtPayload;
    }
  }
}

export {};

