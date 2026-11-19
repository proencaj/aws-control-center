import type { Metadata } from "next";
import localFont from "next/font/local";
import { WorkspaceShell } from "@/components/workspace";
import { getAccount, listAccounts } from "@/lib/aws/accounts";
import { getCallerIdentity, identityName } from "@/lib/sts";
import { getRegion } from "@/lib/aws/clients";
import { listRegions } from "@/lib/ec2";
import "./globals.css";

const berkeley = localFont({
  src: [
    {
      path: "./fonts/BerkeleyMono-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    { path: "./fonts/BerkeleyMono-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/BerkeleyMono-Italic.ttf", weight: "400", style: "italic" },
    {
      path: "./fonts/BerkeleyMono-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-berkeley",
  display: "swap",
  fallback: ["Monaco", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: "AWS Control Center",
  description: "A lightweight console for your AWS account",
};

async function loadRegions() {
  try {
    return await listRegions();
  } catch {
    // Missing credentials or permissions. The selector still shows the current region.
    return [];
  }
}

async function loadIdentityName() {
  try {
    return identityName((await getCallerIdentity()).arn ?? "");
  } catch {
    return undefined;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [current, regions, account, identity] = await Promise.all([getRegion(), loadRegions(), getAccount(), loadIdentityName()]);

  return (
    <html lang="en" className={berkeley.variable}>
      <body>
        <WorkspaceShell initialRegion={current} regions={regions} accounts={listAccounts()} currentAccountId={account?.id} identity={identity}>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
