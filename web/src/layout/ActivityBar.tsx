import { Files,Search,GitBranch,Play,Settings } from "lucide-react";

export function ActivityBar(){
    return(
        <div className="col-start-1 row-span-2 flex flex-col items-center gap-5 bg-vscode-activity py-2.5">
            <Files size={24} className="cursor-pointer text-white"/>
            <Search size={24} className="cursor-pointer text-vscode-muted hover:text-white"/>
            <GitBranch size={24} className="cursor-pointer text-vscode-muted hover:text-white"/>
            <Play size={24} className="cursor-pointer text-vscode-muted hover:text-white"/>
            <div className="grow"/>
            <Settings size={24} className="cursor-pointer text-vscode-muted hover:text-white"/>
        </div>
    );
}