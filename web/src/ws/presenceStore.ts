import { create } from "zustand";
import type { PresenceUser } from "../editor/RemoteCursor";

interface PresenceState {
    users: Record<string, PresenceUser>;
    setUser: (user: PresenceUser) => void;
    removeUser: (userId: string) => void;
    setAllUsers: (users: PresenceUser[]) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
    users: {},
    setUser: (user) => set((state) => ({
        users: { ...state.users, [user.userId]: user }
    })),
    removeUser: (userId) => set((state) => {
        const newUsers = { ...state.users };
        delete newUsers[userId];
        return { users: newUsers };
    }),
    setAllUsers: (users) => set({
        users: users.reduce((acc, user) => ({ ...acc, [user.userId]: user }), {})
    }),
}));
