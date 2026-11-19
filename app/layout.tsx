import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { getAccount, listAccounts } from "@/lib/aws/accounts";
import { getCallerIdentity, identityName } from "@/lib/sts";
import { getRegion } from "@/lib/aws/clients";
import { listRegions } from "@/lib/ec2";
import "./globals.css";


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
    <html lang="en">
      <body>
        <WorkspaceShell initialRegion={current} regions={regions} accounts={listAccounts()} currentAccountId={account?.id} identity={identity}>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
