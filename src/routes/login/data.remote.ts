import { form, getRequestEvent } from "$app/server";
import { createSession, validateUser } from "$lib/auth";
import { error, redirect } from "@sveltejs/kit";

export const login = form(async (data) => {
	// Check the user is logged in
	const username = data.get('username');
	const password = data.get('password');

	// Check the data is valid
	if (typeof username !== 'string' || typeof password !== 'string') {
		error(400, 'Invalid username or password');
	}

	const user = await validateUser(username, password);
    
    if (!user) {
      error(400, 'Invalid username or password')
    }

    const session = await createSession(user.id);

    const { cookies } = getRequestEvent();
    
    cookies.set('session', session.id, {
      path: '/',
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
    
	redirect(303, '/chat');
});