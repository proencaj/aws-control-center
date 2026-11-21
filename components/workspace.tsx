"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cloud, Columns2, Shield, Square, Terminal, X } from "lucide-react";
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

type Pane = "left" | "right";
type PaneState = { service: string; region: string };

type WorkspaceContextValue = {
  activeId: string;
  activeRegion: string;
  activeService: string;
  isActive: (id?: string) => boolean;
  openService: (href: string) => void;
  workspaceId: string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "aws-control-center.workspaces.v1";
// The right pane is this same app inside an iframe, with its own tabs under its own key.
const RIGHT_STORAGE_KEY = `${STORAGE_KEY}.right`;

const isEmbedded = () => window.top !== window.self;
const storageKey = () => (isEmbedded() ? RIGHT_STORAGE_KEY : STORAGE_KEY);

function post(target: Window | null | undefined, message: Record<string, unknown>) {
  target?.postMessage(message, window.location.origin);
}

// Both panes share one region cookie, so the focused pane writes its region before server actions run.
async function syncRegionCookie(region: string, fallback: string) {
  const current = document.cookie.match(/(?:^|; )region=([^;]*)/)?.[1] ?? fallback;
  if (current === region) return;
  const data = new FormData();
  data.set("region", region);
  await setRegion(data);
}

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
  const [split, setSplit] = useState(false);
  const [focused, setFocused] = useState<Pane>("left");
  const [rightSrc, setRightSrc] = useState("/");
  const [rightKey, setRightKey] = useState(0);
  const [rightState, setRightState] = useState<PaneState>({ service: "directory", region: initialRegion });
  const rightFrame = useRef<HTMLIFrameElement>(null);
  const commands = useRef<{ openService: (href: string) => void; changeRegion: (region: string) => Promise<void> } | null>(null);
  const activationOrder = useRef(1);
  const hydrated = useRef(false);
  const pendingActivation = useRef<string | null>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let restored: { tabs: Workspace[]; activeId: string; split?: boolean } | undefined;
    let rightHref = "/";
    try {
      const raw = sessionStorage.getItem(storageKey());
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      if (validStored(parsed)) restored = parsed;
      const right: unknown = JSON.parse(sessionStorage.getItem(RIGHT_STORAGE_KEY) ?? "null");
      if (!isEmbedded() && restored?.split && validStored(right)) {
        rightHref = (right.tabs.find((tab) => tab.id === right.activeId) ?? right.tabs[0])?.href ?? "/";
      }
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
      setSplit(!isEmbedded() && restored.split === true);
      setRightSrc(rightHref);
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
    sessionStorage.setItem(storageKey(), JSON.stringify({ tabs, activeId, split }));
  }, [activeId, ready, split, tabs]);

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
    await syncRegionCookie(tab.region, initialRegion);
    pendingActivation.current = tab.id;
    setActiveId(tab.id);
    const order = ++activationOrder.current;
    setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, lastActive: order } : item));
    router.push(tab.href, { scroll: false });
  }

  // One tab per service in each pane. Split the screen to see a service twice.
  function openService(href: string) {
    const service = serviceFor(new URL(href, window.location.origin).pathname);
    const existing = [...tabs].filter((tab) => tab.service === service).sort((a, b) => b.lastActive - a.lastActive)[0];
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
    sessionStorage.removeItem(RIGHT_STORAGE_KEY);
    setRightSrc("/");
    setRightKey((key) => key + 1);
    setFocused("left");
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
    router.push(href, { scroll: false });
  }

  useEffect(() => {
    if (!ready) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest("a");
      if (!anchor || anchor.target || anchor.download || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      const service = serviceFor(anchor.pathname);
      // Linking to a service this pane already has reuses that tab instead of duplicating it.
      const other = service !== active.service ? tabs.find((tab) => tab.service === service) : undefined;
      const target = other ?? active;
      const href = workspaceHref(anchor.href, target.id, active.region);
      setCached((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
      const order = ++activationOrder.current;
      setTabs((current) => current.map((tab) => tab.id === target.id ? { ...tab, href, service, title: titleFor(anchor.pathname), region: active.region, lastActive: order } : tab));
      if (other) {
        pendingActivation.current = other.id;
        setActiveId(other.id);
      }
      router.push(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, ready, router, tabs]);

  useEffect(() => {
    const syncUrl = () => {
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, href, title: titleFor(window.location.pathname), service: serviceFor(window.location.pathname) } : tab));
    };
    window.addEventListener("workspace-url-change", syncUrl);
    return () => window.removeEventListener("workspace-url-change", syncUrl);
  }, [activeId]);

  useEffect(() => {
    commands.current = { openService, changeRegion };
  });

  // Right pane (iframe): tell the parent which pane is focused and what it shows, and run its commands.
  useEffect(() => {
    if (!ready || !isEmbedded()) return;
    post(window.parent, { type: "pane-state", service: active.service, region: active.region });
    const focus = () => {
      post(window.parent, { type: "pane-focus" });
      void syncRegionCookie(active.region, initialRegion);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const message = event.data as { type?: string; href?: string; region?: string };
      if (message.type === "open-service" && typeof message.href === "string") commands.current?.openService(message.href);
      if (message.type === "change-region" && typeof message.region === "string") void commands.current?.changeRegion(message.region);
    };
    document.addEventListener("pointerdown", focus, true);
    document.addEventListener("focusin", focus, true);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("pointerdown", focus, true);
      document.removeEventListener("focusin", focus, true);
      window.removeEventListener("message", onMessage);
    };
  }, [active.region, active.service, initialRegion, ready]);

  // Parent: track the right pane's focus and state.
  useEffect(() => {
    if (!split) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== rightFrame.current?.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data as { type?: string; service?: string; region?: string };
      if (message.type === "pane-focus") setFocused("right");
      if (message.type === "pane-state" && typeof message.service === "string" && typeof message.region === "string") setRightState({ service: message.service, region: message.region });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [split, rightKey]);

  function focusLeft() {
    if (focused === "left") return;
    setFocused("left");
    void syncRegionCookie(active.region, initialRegion);
  }

  function toggleSplit() {
    if (split) {
      sessionStorage.removeItem(RIGHT_STORAGE_KEY);
      setSplit(false);
      focusLeft();
      return;
    }
    sessionStorage.removeItem(RIGHT_STORAGE_KEY);
    setRightSrc("/");
    setRightKey((key) => key + 1);
    setRightState({ service: "directory", region: active.region });
    setSplit(true);
  }

  const rightFocused = split && focused === "right";
  const toolbarRegion = rightFocused ? rightState.region : active.region;

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

  // Sidebar and region changes go to whichever pane was focused last.
  const rightWindow = () => rightFrame.current?.contentWindow;
  const routedOpenService = (href: string) => (rightFocused ? post(rightWindow(), { type: "open-service", href }) : openService(href));
  const routedChangeRegion = (region: string) => (rightFocused ? post(rightWindow(), { type: "change-region", region }) : void changeRegion(region));

  const context: WorkspaceContextValue = {
    activeId,
    activeRegion: active.region,
    activeService: rightFocused ? rightState.service : active.service,
    isActive: (workspaceId = activeId) => workspaceId === activeId,
    openService: routedOpenService,
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
              <button
                type="button"
                className="title-icon-button btn-icon"
                aria-label={split ? "Single screen" : "Split screen"}
                aria-pressed={split}
                title={split ? "Single screen" : "Split screen"}
                onClick={toggleSplit}
              >
                {split ? <Square size={16} aria-hidden /> : <Columns2 size={16} aria-hidden />}
              </button>
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
                  <RegionSelect key={toolbarRegion} regions={regions} current={toolbarRegion} onChange={routedChangeRegion} />
                </div>
              </header>
              <div className="flex min-w-0 flex-1 flex-col md:flex-row">
                <div
                  className={`flex min-w-0 flex-1 basis-0 flex-col ${split ? "pane" : ""}`}
                  data-focused={split && focused === "left"}
                  onPointerDownCapture={split ? focusLeft : undefined}
                  onFocusCapture={split ? focusLeft : undefined}
                >
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
                </div>
                {split && (
                  <div className="pane h-[80dvh] min-w-0 flex-1 basis-0 md:sticky md:top-0 md:h-dvh md:self-start" data-focused={focused === "right"}>
                    <iframe key={rightKey} ref={rightFrame} src={rightSrc} title="Right pane" className="h-full w-full border-0" />
                  </div>
                )}
              </div>
              <footer className="app-footer flex gap-1 p-1 text-xs"><span className="status-field flex-1">Local console</span><span className="status-field hidden sm:block">EC2 / ECS / Logs / S3</span></footer>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
