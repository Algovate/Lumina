/**
 * Validates required environment variables on startup
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = [
    'S3_BUCKET',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
  ];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value === '' || value === `dummy_${key.toLowerCase()}`) {
      errors.push(`Missing or invalid required environment variable: ${key}`);
    }
  }

  // Validate AWS_REGION (optional but recommended)
  if (!process.env.AWS_REGION) {
    errors.push('Warning: AWS_REGION not set, defaulting to us-east-1');
  }

  return {
    valid: errors.filter(e => !e.startsWith('Warning:')).length === 0,
    errors,
  };
}

