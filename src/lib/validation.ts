import * as v from 'valibot';

export const RegisterSchema = v.pipe(
	v.object({
		username: v.pipe(
			v.string('Username is required'),
			v.minLength(3, 'Username must be at least 3 characters'),
			v.maxLength(50, 'Username must be less than 50 characters'),
			v.regex(
				/^[a-z0-9_-]+$/,
				'Username can only contain lower case letters, numbers, underscores, and hyphens'
			)
		),
		password: v.pipe(
			v.string('Password is required'),
			v.minLength(6, 'Password must be at least 6 characters'),
			v.maxLength(128, 'Password must be less than 128 characters')
		),
		confirmPassword: v.pipe(
			v.string('Confirm Password is required'),
			v.minLength(6, 'Confirm Password must be at least 6 characters'),
			v.maxLength(128, 'Confirm Password must be less than 128 characters')
		)
	}),
	v.check((input) => input.password === input.confirmPassword, 'Passwords do not match')
);

export const LoginSchema = v.object({
	username: v.pipe(v.string('Username is required'), v.minLength(1, 'Username is required')),
	password: v.pipe(v.string('Password is required'), v.minLength(1, 'Password is required'))
});

export function collectErrorMessages(issues: v.BaseIssue<unknown>[]): string[] {
	if (issues.length === 0) return [];

	const flattened = v.flatten(issues as [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]);

	const rootErrors = flattened.root ?? [];
	const otherErrors = flattened.other ?? [];

	const nestedErrors = Object.values(flattened.nested ?? {}).flatMap((errs) => errs ?? []);

	return [...rootErrors, ...otherErrors, ...nestedErrors];
}

export function collectErrorMessagesString(
	issues: v.BaseIssue<unknown>[],
	separator = ', '
): string {
	return collectErrorMessages(issues).join(separator);
}

export type RegisterInput = v.InferInput<typeof RegisterSchema>;
export type LoginInput = v.InferInput<typeof LoginSchema>;
