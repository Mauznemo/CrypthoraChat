export async function createDm({ userId }: { userId: string }) {
    const response = await fetch('/api/chat/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });

    const data = await response.json();
    if (!response.ok) throw { body: data };
    return data; // Should return { chatId: string }
}

export async function createGroup({ groupName, userIds }: { groupName: string; userIds: string[] }) {
    const response = await fetch('/api/chat/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, userIds })
    });

    const data = await response.json();
    if (!response.ok) throw { body: data };
    return data; // Should return { chatId: string }
}
