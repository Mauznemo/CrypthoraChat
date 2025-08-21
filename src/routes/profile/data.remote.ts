
import { command, getRequestEvent } from "$app/server";
import { deleteSession } from "$lib/auth";


export const logout = command( async () => {
    const { cookies, locals } = getRequestEvent();
	if (locals.sessionId) {
      await deleteSession(locals.sessionId);
      locals.user = null;
      locals.sessionId = undefined;
    }
    
    cookies.delete('session', { path: '/' });
});