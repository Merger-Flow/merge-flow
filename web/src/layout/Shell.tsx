import { ActivityBar } from "./ActivityBar";
import { EditorGroups } from "./EditorGroups";
import { Panel } from "./Panel";
import { PrimarySideBar } from "./PrimarySideBar";
import { Statusbar } from "./StatusBar";

// Shell is the fixed VS Code-like workspace frame. Each child owns one grid
// region so the editor can grow while the panel and status bar keep their size.
export function Shell() {
  return (
    <main className="grid h-screen min-h-0 grid-cols-[48px_240px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_180px_22px] overflow-hidden bg-vscode-bg text-vscode-text">
      <ActivityBar />
      <PrimarySideBar />
      <EditorGroups />
      <Panel />
      <Statusbar />
    </main>
  );
}
