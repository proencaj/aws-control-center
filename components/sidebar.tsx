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
    <aside className="flex w-full shrink-0 flex-col gap-2 p-1 md:sticky md:top-0 md:h-[calc(100dvh-3rem)] md:w-60 md:self-start">
      <label className="sunken flex items-center gap-2 px-2 py-1 text-sm">
        <Search size={16} />
        <input
          type="search"
          aria-label="Search services"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search services"
          className="w-full bg-transparent p-0 shadow-none outline-none"
        />
      </label>

      <nav
        aria-label="Services"
        className="sunken flex min-h-0 flex-1 flex-wrap content-start gap-0.5 p-1 text-sm md:flex-col md:flex-nowrap md:overflow-y-auto"
      >
        {visible.map(({ label, href, icon: Icon }) => (
          <div
            key={href}
            className="flex items-center has-[button[aria-current=page]]:bg-selection has-[button[aria-current=page]]:text-selection-foreground"
          >
            <button
              aria-current={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "page" : undefined}
              onClick={() => openService(href)}
              className="plain flex flex-1 items-center gap-2 bg-transparent px-2 py-1 text-left shadow-none"
            >
              <Icon size={16} />{label}
            </button>
            <button aria-label={`Open another ${label} tab`} title="Open in new tab" onClick={() => openService(href, true)} className="btn-icon m-px p-0.5"><Plus size={12} /></button>
          </div>
        ))}
        {visible.length === 0 && <p className="px-2 py-1">No results</p>}
      </nav>
    </aside>
  );
}
