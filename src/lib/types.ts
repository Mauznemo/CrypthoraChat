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

export type ClientMessage = MessageWithRelations & {
	decryptedContent?: string;
	decryptionFailed?: boolean;
};

export type SafeUser = Prisma.UserGetPayload<{
	select: typeof safeUserFields;
}>;

export const chatWithoutMessagesFields = {
	id: true,
	currentKeyVersion: true,
	name: true,
	type: true,
	image: true,
	imageIv: true,
	ownerId: true,
	participants: { include: { user: { select: safeUserFields } } }
} satisfies Prisma.ChatSelect;

export type ChatWithoutMessages = Prisma.ChatGetPayload<{
	select: typeof chatWithoutMessagesFields;
}>;

export type ChatParticipant = Prisma.ChatParticipantGetPayload<{
	select: {
		chatId: true;
		userId: true;
		joinKeyVersion: true;
		joinedAt: true;
		user: { select: typeof safeUserFields };
	};
}>;
