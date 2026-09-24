import React from "react";
import { PresenceList } from "./PresenceList";

export function PrimarySideBar() {
    return (
        <div className="flex h-full w-60 flex-col bg-vscode-sidebar border-r border-vscode-border text-vscode-foreground">
            <div className="p-4 font-semibold text-sm border-b border-vscode-border">
                Explorer
            </div>
            <div className="flex-grow overflow-y-auto">
                {/* Placeholder for file tree */}
                <div className="p-2 text-vscode-foreground-muted text-xs italic">
                    No folders open
                </div>
            </div>
            <div className="mt-auto border-t border-vscode-border bg-vscode-sidebar-darker">
                <PresenceList />
            </div>
        </div>
    );
}

