import * as v from 'valibot';

export const RegisterSchema = v.pipe(
	v.object({
		username: v.pipe(
			v.string('login.validation.username.required'),
			v.minLength(3, 'login.validation.username.too-short'),
			v.maxLength(50, 'login.validation.username.too-long'),
			v.regex(/^[a-z0-9_-]+$/, 'login.validation.username.invalid-characters')
		),
		password: v.pipe(
			v.string('login.validation.password.required'),
			v.minLength(6, 'login.validation.password.too-short'),
			v.maxLength(128, 'login.validation.password.too-long')
		),
		confirmPassword: v.pipe(
			v.string('login.validation.confirm-password.required'),
			v.minLength(6, 'login.validation.confirm-password.too-short'),
			v.maxLength(128, 'login.validation.confirm-password.too-long')
		),
		deviceOs: v.string()
	}),
	v.check(
		(input) => input.password === input.confirmPassword,
		'login.validation.passwords-dont-match'
	)
);

export const LoginSchema = v.object({
	username: v.pipe(
		v.string('login.validation.username.required'),
		v.minLength(1, 'login.validation.username.required')
	),
	password: v.pipe(
		v.string('login.validation.password.required'),
		v.minLength(1, 'login.validation.password.required')
	),
	deviceOs: v.string()
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
