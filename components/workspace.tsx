"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cloud, Shield, Terminal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setAccount, setRegion } from "@/app/actions";
import { AccountSelect } from "@/components/account-select";
import { AppearanceControls } from "@/components/appearance-controls";
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

const serviceTitles: Record<string, string> = {
  "ai-debugger": "AI Debugger",
  ecr: "ECR",
  ec2: "EC2",
  ecs: "ECS",
  lambda: "Lambda",
  sns: "SNS",
  sqs: "SQS",
  "logs-explorer": "Logs Explorer",
  "logs-monitor": "Logs Monitor",
  s3: "S3",
};

function titleFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return "Directory";
  const service = serviceTitles[parts[0]] ?? parts[0].toUpperCase();
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
  accounts,
  currentAccountId,
  identity,
}: {
  children: React.ReactNode;
  initialRegion: string;
  regions: string[];
  accounts: { id: string; name: string }[];
  currentAccountId?: string;
  identity?: string;
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
      const restoredTabs = restored.tabs.map((tab) => ({
        ...tab,
        title: titleFor(new URL(tab.href, window.location.origin).pathname),
      }));
      const selected = urlId && restoredTabs.some((tab) => tab.id === urlId) ? urlId : restored.activeId;
      activationOrder.current = Math.max(1, ...restoredTabs.map((tab) => tab.lastActive));
      // Storage hydration must happen after the server-rendered shell mounts.
      setTabs(restoredTabs);
      setActiveId(restoredTabs.some((tab) => tab.id === selected) ? selected : restoredTabs[0].id);
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

  // Tabs, cached pages and URLs all belong to one account, so switching drops them.
  async function changeAccount(accountId: string) {
    const data = new FormData();
    data.set("account", accountId);
    await setAccount(data);
    // Keep the active tab id. The route still carries it until the navigation lands,
    // and a new id would make the sync effect re-add the old tab.
    const next: Workspace = { ...active, href: workspaceHref("/", active.id, active.region), service: "directory", title: "Directory", lastActive: ++activationOrder.current };
    setCached({});
    setTabs([next]);
    router.push(next.href, { scroll: false });
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

  const accountName = accounts.find((account) => account.id === currentAccountId)?.name;

  const context: WorkspaceContextValue = {
    activeId,
    activeRegion: active.region,
    isActive: (workspaceId = activeId) => workspaceId === activeId,
    openService,
    workspaceId: routeTabId ?? activeId,
  };

  return (
    <WorkspaceContext.Provider value={context}>
      <div className="app-frame min-h-screen p-2 md:p-4">
        <div className="console-window app-shell flex min-h-[calc(100dvh-2rem)] flex-col">
          <div className="console-title app-title">
            <span className="app-brand flex items-center gap-2">
              <span className="brand-icon brand-default" aria-hidden><Terminal size={20} /></span>
              <span className="brand-icon brand-apple" aria-hidden><Cloud size={20} /></span>
              <span className="brand-icon brand-win95" aria-hidden>▣</span>
              <span className="brand-icon brand-wow brand-emblem" aria-hidden><Shield size={22} /></span>
              AWS Control Center
            </span>
            <div className="app-account-tools flex items-center gap-2">
              <span>
                <span className="private-value">{accountName ?? "Personal workspace"}</span>
                <span className="private-mask">****</span>
              </span>
              <AppearanceControls />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col md:flex-row">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="app-toolbar flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="console-kicker">Resource console</span>
                <div className="flex flex-wrap items-center gap-3">
                  {identity && <span className="text-sm">Identity <strong className="private-value" title={identity}>{identity.length > 20 ? `${identity.slice(0, 17)}...` : identity}</strong><strong className="private-mask">****</strong></span>}
                  {currentAccountId && <AccountSelect accounts={accounts} current={currentAccountId} onChange={changeAccount} />}
                  <RegionSelect regions={regions} current={active.region} onChange={changeRegion} />
                </div>
              </header>
          <div role="tablist" aria-label="Open workspaces" onKeyDown={tabKeyDown} className="workspace-tabs flex max-w-full gap-1 overflow-x-auto p-2 md:sticky md:top-0 md:z-10">
            {tabs.map((tab) => (
              <div key={tab.id} className="sheet-tab flex shrink-0 items-center" role="presentation" data-selected={tab.id === activeId}>
                <button role="tab" data-workspace={tab.id} tabIndex={tab.id === activeId ? 0 : -1} aria-selected={tab.id === activeId} onClick={() => void activate(tab)} className="plain max-w-56 truncate bg-transparent px-1 text-sm shadow-none">
                  {tab.title}
                </button>
                <button aria-label={`Close ${tab.title}`} onClick={() => void close(tab.id)} className="plain bg-transparent px-1 shadow-none"><X size={12} /></button>
              </div>
            ))}
          </div>
          <main className="workspace-content relative z-0 min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
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
              <footer className="flex gap-1 p-1 text-xs"><span className="status-field flex-1">Local console</span><span className="status-field hidden sm:block">EC2 / ECS / Logs / S3</span></footer>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
