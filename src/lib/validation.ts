import * as v from 'valibot';

export const RegisterSchema = v.object({
  username: v.pipe(
    v.string('Username is required'),
    v.minLength(3, 'Username must be at least 3 characters'),
    v.maxLength(50, 'Username must be less than 50 characters'),
    v.regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
  ),
  password: v.pipe(
    v.string('Password is required'),
    v.minLength(6, 'Password must be at least 6 characters'),
    v.maxLength(128, 'Password must be less than 128 characters')
  )
});

export const LoginSchema = v.object({
  username: v.pipe(
    v.string('Username is required'),
    v.minLength(1, 'Username is required')
  ),
  password: v.pipe(
    v.string('Password is required'),
    v.minLength(1, 'Password is required')
  )
});

export type RegisterInput = v.InferInput<typeof RegisterSchema>;
export type LoginInput = v.InferInput<typeof LoginSchema>;