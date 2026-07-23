export function Panel(){
    return(
        <div className="col-start-3 row-start-2 flex flex-col border-t border-vscode-border bg-vscode-panel">
            <div className="flex gap-5 px-5 py-2.5 text-xs uppercase text-vscode-muted">
                <span className="cursor-pointer hover:text-white">Problems</span>
                <span className="cursor-pointer hover:text-white">Output</span>
                <span className="cursor-pointer border-b border-white pb-0.5 text-white">Terminal</span>
            </div>
            <div className="px-5 py-2.5 font-mono text-[13px] text-[]">
                user@collab-editor:~$ npm run dev<br/>
                VITE ready in 150ms<br/>
                Local:https://localhost:5173/
            </div>
        </div>
    );
}