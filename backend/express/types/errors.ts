/**
 * Type guard to check if an error has a message property
 */
export function isErrorWithMessage(error: unknown): error is { message: string; name?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Safely extract error name from unknown error type
 */
export function getErrorName(error: unknown): string | undefined {
  if (isErrorWithMessage(error) && error.name) {
    return error.name;
  }
  return undefined;
}

/**
 * S3 SDK error structure
 */
export interface S3Error extends Error {
  name: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    extendedRequestId?: string;
    cfId?: string;
    attempts?: number;
    totalRetryDelay?: number;
  };
  Code?: string;
}

/**
 * Type guard to check if an error is an S3 error
 */
export function isS3Error(error: unknown): error is S3Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as S3Error).name === 'string'
  );
}

/**
 * Check if an error is a "not found" error (404)
 */
export function isNotFoundError(error: unknown): boolean {
  if (!isS3Error(error)) return false;
  return (
    error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    error.$metadata?.httpStatusCode === 404
  );
}
