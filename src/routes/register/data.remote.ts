import { form, getRequestEvent } from "$app/server";
import { createSession, createUser } from "$lib/auth";
import { error, redirect } from "@sveltejs/kit";

export const register = form(async (data) => {
    // Check the user is logged in
    const username = data.get('username');
    const password = data.get('password');

    // Check the data is valid
    if (typeof username !== 'string' || typeof password !== 'string') {
        error(400, 'Invalid username or password');
    }

    try {
      const user = await createUser(username, password);
      const session = await createSession(user.id);

      const { cookies } = getRequestEvent();
      
      cookies.set('session', session.id, {
        path: '/',
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
      
      redirect(302, '/chat');
    } catch (err: any) {
      if (err.code === 'P2002') {
        error(400, 'Username already taken');
      }
      console.error('Registration error:', err);
      error(500, 'Something went wrong. Please try again.');
    }
  
});