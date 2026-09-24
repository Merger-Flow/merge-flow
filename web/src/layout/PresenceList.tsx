import React from "react";
import { usePresenceStore } from "../ws/presenceStore";

export function PresenceList() {
    const users = usePresenceStore((state) => Object.values(state.users));

    return (
        <div className="flex flex-col p-2 space-y-1">
            <div className="text-[11px] font-bold text-vscode-foreground-muted uppercase tracking-wider mb-2 px-2">
                Collaborators
            </div>
            {users.length === 0 ? (
                <div className="text-[12px] text-vscode-foreground-muted px-2 italic">
                    No other users online
                </div>
            ) : (
                users.map((user) => (
                    <div 
                        key={user.userId} 
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-vscode-sidebar-hover cursor-default transition-colors"
                    >
                        <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: getColorForUser(user.userId) }} 
                        />
                        <span className="text-[12px] text-vscode-foreground">
                            {user.name}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
}

function getColorForUser(userId: string): string {
    const colors = ["#ff5f56", "#ffbd2e", "#27c93f", "#00aaff", "#a371f7", "#ff9fdf"];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}
