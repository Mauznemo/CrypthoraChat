import type { Prisma } from '$prisma';
export type MessageWithRelations = Prisma.MessageGetPayload<{
	include: { user: true; chat: true; readBy: true; replyTo: { include: { user: true } } };
}>;
