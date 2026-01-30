import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Validate password strength
 * Returns { valid: boolean, error?: string } for detailed feedback
 */
export const validatePassword = (password: string): boolean => {
  // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};

/**
 * Get detailed password validation error message
 */
export const getPasswordValidationError = (password: string): string | null => {
  if (!password) {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least 1 lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least 1 uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least 1 number';
  }
  if (!/[@$!%*?&]/.test(password)) {
    return 'Password must contain at least 1 special character from: @ $ ! % * ? &';
  }
  // Check for invalid characters
  if (!/^[A-Za-z\d@$!%*?&]+$/.test(password)) {
    return 'Password contains invalid characters. Only letters, numbers, and these special characters are allowed: @ $ ! % * ? &';
  }
  return null; // Valid
};
