"use client";

import {
  Home,
  Search,
  Server,
  Container,
  ScrollText,
  HardDrive,
  Package,
  Bot,
  Zap,
  Bell,
  MessageSquare,
} from "lucide-react";
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
  { label: "ECR", href: "/ecr", icon: Package },
  { label: "Lambda", href: "/lambda", icon: Zap },
  { label: "SNS", href: "/sns", icon: Bell },
  { label: "SQS", href: "/sqs", icon: MessageSquare },
  { label: "AI Debugger", href: "/ai-debugger", icon: Bot },
];

export function Sidebar() {
  const [query, setQuery] = useState("");
  const { activeService, openService } = useWorkspace();
  const visible = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <aside className="app-sidebar flex w-full shrink-0 flex-col gap-4 p-3 md:sticky md:top-0 md:min-h-[calc(100dvh-6rem)] md:w-60 md:self-start">
      <label className="sidebar-search flex items-center gap-2 px-2 py-1 text-sm">
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

      <p className="px-2 text-xs font-semibold text-muted">Services</p>
      <nav
        aria-label="Services"
        className="flex min-h-0 flex-1 flex-wrap content-start gap-1 text-sm md:flex-col md:flex-nowrap md:overflow-y-auto"
      >
        {visible.map(({ label, href, icon: Icon }) => (
          <div key={href} className="sidebar-item flex items-center">
            <button
              aria-current={(href.split("/")[1] || "directory") === activeService ? "page" : undefined}
              onClick={() => openService(href)}
              className="plain flex flex-1 items-center gap-2.5 bg-transparent px-2 py-2 text-left shadow-none"
            >
              <Icon size={16} />
              {label}
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="px-2 py-1">No results</p>}
      </nav>
    </aside>
  );
}
