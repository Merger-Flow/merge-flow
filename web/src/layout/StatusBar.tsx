import { GitBranch,XCircle,AlertTriangle } from "lucide-react";

export function Statusbar(){
    return(
        <div className="col-span-3 row-start-3 flex items-center justify-between bg-vscode-status px-2.5 text-xs text-white">
            <div className="flex items-center gap-4">
                <span className="flex cursor-pointer items-center gap-1 rounded px-1 hover:bg-white/20">
                    <GitBranch size={14}/> main
                </span>
                <span className="flex cursor-pointer items-center gap-1 rounded px-1 hover:bg-white/20">
                <XCircle size={14}/> 0 <AlertTriangle size={14}/> 0
                </span>
            </div>
            <div className="flex items-center gap-4">
                <span className="cursor-pointer rounded px-1 hover:bg-white/20">Ln 1,Col 1</span>
                <span className="cursor-pointer rounded px-1 hover:bg-white/20">Spaces:1</span>
                <span className="cursor-pointer rounded px-1 hover:bg-white/20">UTF-8</span>
                <span className="cursor-pointer rounded px-1 hover:bg-white/20">TypeScript JSX</span>
            </div>
        </div>
    );
}