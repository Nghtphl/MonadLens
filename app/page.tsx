"use client";

import { useEffect, useRef, useState } from "react";
import Landing from "@/components/Landing";
import Workspace from "@/components/Workspace";

const WORKSPACE_HASH = "#workspace";
type View = "intro" | "workspace";

export default function Home() {
  const [view, setView] = useState<View>("intro");
  // The workspace mounts on first use and then stays mounted, so the editor,
  // its code and any results survive a trip back to the overview.
  const [entered, setEntered] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusWorkspace = useRef(false);

  useEffect(() => {
    const sync = () => {
      const wantsWorkspace = window.location.hash === WORKSPACE_HASH;
      if (wantsWorkspace) setEntered(true);
      setView(wantsWorkspace ? "workspace" : "intro");
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (view === "workspace" && focusWorkspace.current) {
      focusWorkspace.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  const openWorkspace = () => {
    if (window.location.hash !== WORKSPACE_HASH) window.history.pushState(null, "", WORKSPACE_HASH);
    focusWorkspace.current = true;
    setEntered(true);
    setView("workspace");
  };

  const backToIntro = () => {
    if (window.location.hash === WORKSPACE_HASH) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
    setView("intro");
  };

  return (
    <div className="app-root">
      {view === "intro" && <Landing onStart={openWorkspace} />}
      {entered && <Workspace active={view === "workspace"} headingRef={headingRef} onBackToIntro={backToIntro} />}
    </div>
  );
}
