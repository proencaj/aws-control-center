"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setRegion } from "@/app/actions";
import { RegionSelect } from "@/components/region-select";
import { Sidebar } from "@/components/sidebar";

type Workspace = {
  id: string;
  href: string;
  service: string;
  title: string;
  region: string;
  lastActive: number;
};

type WorkspaceContextValue = {
  activeId: string;
  activeRegion: string;
  isActive: (id?: string) => boolean;
  openService: (href: string, forceNew?: boolean) => void;
  workspaceId: string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "aws-control-center.workspaces.v1";

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function serviceFor(pathname: string) {
  return pathname.split("/")[1] || "directory";
}

function titleFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return "Directory";
  const service = parts[0] === "logs-monitor" ? "Logs Monitor" : parts[0] === "logs-explorer" ? "Logs Explorer" : parts[0].toUpperCase();
  const resource = parts.at(-1);
  return resource && resource !== parts[0] ? `${service} · ${resource}` : service;
}

function workspaceHref(href: string, workspaceId: string, region: string) {
  const url = new URL(href, window.location.origin);
  url.searchParams.set("tab", workspaceId);
  url.searchParams.set("region", region);
  return `${url.pathname}${url.search}${url.hash}`;
}

function validStored(value: unknown): value is { tabs: Workspace[]; activeId: string } {
  if (!value || typeof value !== "object") return false;
  const stored = value as { tabs?: unknown; activeId?: unknown };
  return Array.isArray(stored.tabs) && typeof stored.activeId === "string" && stored.tabs.every((tab) => {
    if (!tab || typeof tab !== "object") return false;
    const item = tab as Partial<Workspace>;
    return typeof item.id === "string" && typeof item.href === "string" && item.href.startsWith("/") && typeof item.service === "string" && typeof item.title === "string" && typeof item.region === "string" && typeof item.lastActive === "number";
  });
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceShell");
  return value;
}

export function useWorkspaceActive() {
  const value = useContext(WorkspaceContext);
  return value ? value.isActive(value.workspaceId) : true;
}

export function WorkspaceShell({
  children,
  initialRegion,
  regions,
}: {
  children: React.ReactNode;
  initialRegion: string;
  regions: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeHref = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;
  const routeTabId = searchParams.get("tab");
  const initialId = routeTabId ?? "initial";
  const [tabs, setTabs] = useState<Workspace[]>([{
    id: initialId,
    href: routeHref,
    service: serviceFor(pathname),
    title: titleFor(pathname),
    region: searchParams.get("region") ?? initialRegion,
    lastActive: 0,
  }]);
  const [activeId, setActiveId] = useState(initialId);
  const [ready, setReady] = useState(false);
  const [cached, setCached] = useState<Record<string, React.ReactNode>>({});
  const cookieRegion = useRef(initialRegion);
  const activationOrder = useRef(1);
  const hydrated = useRef(false);
  const pendingActivation = useRef<string | null>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let restored: { tabs: Workspace[]; activeId: string } | undefined;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      if (validStored(parsed)) restored = parsed;
    } catch {}

    const urlId = new URL(window.location.href).searchParams.get("tab");
    if (restored?.tabs.length) {
      const selected = urlId && restored.tabs.some((tab) => tab.id === urlId) ? urlId : restored.activeId;
      activationOrder.current = Math.max(1, ...restored.tabs.map((tab) => tab.lastActive));
      // Storage hydration must happen after the server-rendered shell mounts.
      setTabs(restored.tabs);
      setActiveId(restored.tabs.some((tab) => tab.id === selected) ? selected : restored.tabs[0].id);
    } else if (!urlId) {
      const nextId = id();
      const href = workspaceHref(window.location.href, nextId, initialRegion);
      setTabs([{ id: nextId, href, service: serviceFor(pathname), title: titleFor(pathname), region: initialRegion, lastActive: 1 }]);
      setActiveId(nextId);
      router.replace(href, { scroll: false });
    }
    setReady(true);
  }, [initialRegion, pathname, router]);

  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
  }, [activeId, ready, tabs]);

  useEffect(() => {
    if (!ready) return;
    if (!routeTabId) {
      router.replace(workspaceHref(routeHref, activeId, active.region), { scroll: false });
      return;
    }
    const currentId = routeTabId;
    const region = searchParams.get("region") ?? tabs.find((tab) => tab.id === currentId)?.region ?? initialRegion;
    // Next navigation is an external store; mirror it into the workspace registry.
    setTabs((current) => {
      let changed = false;
      const next = current.map((tab) => {
        if (tab.id !== currentId) return tab;
        const service = serviceFor(pathname);
        const title = titleFor(pathname);
        if (tab.href === routeHref && tab.service === service && tab.title === title && tab.region === region) return tab;
        changed = true;
        return { ...tab, href: routeHref, service, title, region };
      });
      if (!current.some((tab) => tab.id === currentId)) {
        changed = true;
        next.push({ id: currentId, href: routeHref, service: serviceFor(pathname), title: titleFor(pathname), region, lastActive: ++activationOrder.current });
      }
      return changed ? next : current;
    });
    if (pendingActivation.current === currentId) pendingActivation.current = null;
    if (currentId !== activeId && pendingActivation.current !== activeId) setActiveId(currentId);
  }, [active.region, activeId, initialRegion, pathname, ready, routeHref, routeTabId, router, searchParams, tabs]);

  useLayoutEffect(() => {
    if (!ready || !routeTabId) return;
    const tab = tabs.find((item) => item.id === routeTabId);
    if (!tab || tab.href !== routeHref || cached[routeTabId]) return;
    // Retaining the RSC subtree keeps client state alive while another tab is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCached((current) => ({ ...current, [routeTabId]: children }));
  }, [cached, children, ready, routeHref, routeTabId, tabs]);

  async function activate(tab: Workspace) {
    if (cookieRegion.current !== tab.region) {
      const data = new FormData();
      data.set("region", tab.region);
      await setRegion(data);
      cookieRegion.current = tab.region;
    }
    pendingActivation.current = tab.id;
    setActiveId(tab.id);
    const order = ++activationOrder.current;
    setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, lastActive: order } : item));
    router.push(tab.href, { scroll: false });
  }

  function openService(href: string, forceNew = false) {
    const service = serviceFor(new URL(href, window.location.origin).pathname);
    const existing = !forceNew ? [...tabs].filter((tab) => tab.service === service).sort((a, b) => b.lastActive - a.lastActive)[0] : undefined;
    if (existing) {
      void activate(existing);
      return;
    }
    const nextId = id();
    const next: Workspace = {
      id: nextId,
      href: workspaceHref(href, nextId, active.region),
      service,
      title: titleFor(new URL(href, window.location.origin).pathname),
      region: active.region,
      lastActive: ++activationOrder.current,
    };
    setTabs((current) => [...current, next]);
    void activate(next);
  }

  async function close(tabId: string) {
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setCached((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (remaining.length) {
      setTabs(remaining);
      if (tabId === activeId) await activate([...remaining].sort((a, b) => b.lastActive - a.lastActive)[0]);
      return;
    }
    const nextId = id();
    const next: Workspace = { id: nextId, href: workspaceHref("/", nextId, active.region), service: "directory", title: "Directory", region: active.region, lastActive: ++activationOrder.current };
    setTabs([next]);
    await activate(next);
  }

  async function changeRegion(region: string) {
    const root = active.service === "directory" ? "/" : `/${active.service}`;
    const href = workspaceHref(root, active.id, region);
    setCached((current) => {
      const next = { ...current };
      delete next[active.id];
      return next;
    });
    setTabs((current) => current.map((tab) => tab.id === active.id ? { ...tab, region, href, title: titleFor(root) } : tab));
    const data = new FormData();
    data.set("region", region);
    await setRegion(data);
    cookieRegion.current = region;
    router.push(href, { scroll: false });
  }

  useEffect(() => {
    if (!ready) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest("a");
      if (!anchor || anchor.target || anchor.download || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      const href = workspaceHref(anchor.href, active.id, active.region);
      setCached((current) => {
        const next = { ...current };
        delete next[active.id];
        return next;
      });
      const order = ++activationOrder.current;
      setTabs((current) => current.map((tab) => tab.id === active.id ? { ...tab, href, service: serviceFor(anchor.pathname), title: titleFor(anchor.pathname), lastActive: order } : tab));
      router.push(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, ready, router]);

  useEffect(() => {
    const syncUrl = () => {
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, href, title: titleFor(window.location.pathname), service: serviceFor(window.location.pathname) } : tab));
    };
    window.addEventListener("workspace-url-change", syncUrl);
    return () => window.removeEventListener("workspace-url-change", syncUrl);
  }, [activeId]);

  function tabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = (event.target as Element).closest<HTMLElement>("[role=tab]");
    if (!target) return;
    const index = tabs.findIndex((tab) => tab.id === target.dataset.workspace);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (event.key === "Delete") {
      event.preventDefault();
      void close(tabs[index].id);
      return;
    } else return;
    event.preventDefault();
    void activate(tabs[next]);
  }

  const context: WorkspaceContextValue = {
    activeId,
    activeRegion: active.region,
    isActive: (workspaceId = activeId) => workspaceId === activeId,
    openService,
    workspaceId: routeTabId ?? activeId,
  };

  return (
    <WorkspaceContext.Provider value={context}>
      <div className="flex min-h-screen flex-col bg-background text-foreground antialiased md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3 lg:px-8">
            <span className="console-kicker">AWS / Resource console</span>
            <RegionSelect regions={regions} current={active.region} onChange={changeRegion} />
          </header>
          <div role="tablist" aria-label="Open workspaces" onKeyDown={tabKeyDown} className="flex max-w-full overflow-x-auto border-b border-border bg-background md:sticky md:top-0 md:z-10">
            {tabs.map((tab) => (
              <div key={tab.id} className="flex shrink-0 border-r border-border" role="presentation">
                <button role="tab" data-workspace={tab.id} tabIndex={tab.id === activeId ? 0 : -1} aria-selected={tab.id === activeId} onClick={() => void activate(tab)} className="max-w-56 truncate px-4 py-2 text-xs text-muted hover:bg-surface aria-selected:bg-foreground aria-selected:text-background">
                  {tab.title}
                </button>
                <button aria-label={`Close ${tab.title}`} onClick={() => void close(tab.id)} className="px-2 text-muted hover:bg-surface hover:text-foreground"><X size={14} /></button>
              </div>
            ))}
          </div>
          <main className="flex-1 px-5 py-8 lg:px-8">
            {tabs.map((tab) => {
              const routeOwnsTab = routeTabId === tab.id;
              const content = routeOwnsTab && (tab.href !== routeHref || !cached[tab.id]) ? children : cached[tab.id];
              return (
                <WorkspaceContext.Provider key={tab.id} value={{ ...context, workspaceId: tab.id }}>
                  <section hidden={tab.id !== activeId} aria-hidden={tab.id !== activeId}>
                    <div className="mx-auto max-w-6xl">{content}</div>
                  </section>
                </WorkspaceContext.Provider>
              );
            })}
          </main>
          <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-2 text-xs text-muted lg:px-8"><span>LOCAL CONSOLE</span><span>EC2 / ECS / LOGS / S3</span></footer>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
