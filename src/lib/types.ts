import type { Prisma } from '$prisma';

export const safeUserFields = {
	id: true,
	username: true,
	displayName: true,
	profilePic: true,
	profileIv: true
} satisfies Prisma.UserSelect;

export type MessageWithRelations = Prisma.MessageGetPayload<{
	include: {
		user: { select: typeof safeUserFields };
		chat: true;
		readBy: { select: typeof safeUserFields };
		replyTo: { include: { user: { select: typeof safeUserFields } } };
	};
}>;

export type SafeUser = Prisma.UserGetPayload<{
	select: typeof safeUserFields;
}>;
