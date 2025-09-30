import type { Prisma } from '$prisma';

export const safeUserFields = {
	id: true,
	username: true,
	displayName: true,
	profilePicPath: true
} satisfies Prisma.UserSelect;

export type MessageWithRelations = Prisma.MessageGetPayload<{
	include: {
		user: { select: typeof safeUserFields };
		chat: true;
		readBy: { select: typeof safeUserFields };
		replyTo: { include: { user: { select: typeof safeUserFields } } };
	};
}>;

export type ClientMessage = MessageWithRelations & {
	decryptionFailed?: boolean;
};

export type SafeUser = Prisma.UserGetPayload<{
	select: typeof safeUserFields;
}>;

export const chatWithoutMessagesFields = {
	id: true,
	currentKeyVersion: true,
	lastMessageAt: true,
	name: true,
	type: true,
	imagePath: true,
	ownerId: true,
	participants: { include: { user: { select: safeUserFields } } }
} satisfies Prisma.ChatSelect;

export type ChatWithoutMessages = Prisma.ChatGetPayload<{
	select: typeof chatWithoutMessagesFields;
}>;

export type ClientChat = ChatWithoutMessages & {
	unreadMessages?: number;
};

export type ChatParticipant = Prisma.ChatParticipantGetPayload<{
	select: {
		chatId: true;
		userId: true;
		joinKeyVersion: true;
		joinedAt: true;
		user: { select: typeof safeUserFields };
	};
}>;
