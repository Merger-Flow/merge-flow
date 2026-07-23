import { ChevronDown, FileCode2 } from 'lucide-react';

export function PrimarySideBar() {
  return (
    <div className="col-start-2 row-span-2 border-r border-vscode-border bg-vscode-sidebar">
      <div className="px-2.5 py-2.5 text-[11px] font-bold tracking-widest text-vscode-text">
        EXPLORER
      </div>
      <div className="flex cursor-pointer items-center bg-vscode-inactive-tab px-2.5 py-1 text-vscode-text">
        <ChevronDown size={16} className="mr-1" /> 
        <span className="text-xs font-bold">COLLAB-EDITOR</span>
      </div>
      <div className="flex cursor-pointer items-center py-1 pl-[30px] pr-2.5 text-[#519aba] hover:bg-vscode-inactive-tab">
        <FileCode2 size={16} className="mr-2" /> 
        <span className="text-sm text-vscode-text">clientReplica.ts</span>
      </div>
    </div>
  );
}