"use client";

import {
  Home,
  Search,
  Server,
  Container,
  ScrollText,
  HardDrive,
  Plus,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "@/components/workspace";

// Add new services here as they are built (ec2, ecs, s3, ...).
const items = [
  { label: "Directory", href: "/", icon: Home },
  { label: "EC2", href: "/ec2", icon: Server },
  { label: "ECS", href: "/ecs", icon: Container },
  { label: "Logs Monitor", href: "/logs-monitor", icon: ScrollText },
  { label: "Logs Explorer", href: "/logs-explorer", icon: Search },
  { label: "S3", href: "/s3", icon: HardDrive },
];

export function Sidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const { openService } = useWorkspace();
  const visible = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-border bg-surface p-4 md:sticky md:top-0 md:h-dvh md:w-60 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
      <span className="border-b-4 border-double border-border px-2 pb-4 font-display text-3xl leading-none uppercase">
        AWS
        <br />
        Control Center
      </span>

      <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm focus-within:border-foreground">
        <Search size={16} className="text-muted" />
        <input
          type="search"
          aria-label="Search services"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search services"
          className="w-full bg-transparent outline-none placeholder:text-muted"
        />
      </label>

      <div className="space-y-2">
        <p className="console-kicker px-2">System menu</p>
        <nav
          aria-label="Services"
          className="flex flex-wrap gap-1 text-sm md:flex-col"
        >
          {visible.map(({ label, href, icon: Icon }) => (
            <div
              key={href}
              className="flex border border-transparent text-muted hover:border-border hover:text-foreground has-[button[aria-current=page]]:border-foreground has-[button[aria-current=page]]:bg-foreground has-[button[aria-current=page]]:text-background"
            >
              <button
                aria-current={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "page" : undefined}
                onClick={() => openService(href)}
                className="flex flex-1 items-center gap-2 px-2 py-2 text-left"
              >
                <Icon size={16} />{label}
              </button>
              <button aria-label={`Open another ${label} tab`} title="Open in new tab" onClick={() => openService(href, true)} className="px-2"><Plus size={14} /></button>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="px-2 py-1.5 text-muted">No results</p>
          )}
        </nav>
      </div>
      <p className="mt-auto hidden border-t border-border px-2 pt-4 text-xs text-muted md:block">
        Select a service to browse its resources.
      </p>
    </aside>
  );
}
