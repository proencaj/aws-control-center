import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { getAccount, listAccounts } from "@/lib/aws/accounts";
import { getCallerIdentity, identityName } from "@/lib/sts";
import { getRegion } from "@/lib/aws/clients";
import { listRegions } from "@/lib/ec2";
import { getTheme, themeIcon } from "@/lib/theme";
import "./globals.css";
import "./themes/default.css";
import "./themes/apple.css";
import "./themes/win95.css";
import "./themes/wow.css";

export function generateMetadata(): Metadata {
  const theme = getTheme();
  return {
    title: "AWS Control Center",
    description: "A lightweight console for your AWS account",
    icons: { icon: themeIcon(theme) },
  };
}

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
  const theme = getTheme();
  const [current, regions, account, identity] = await Promise.all([getRegion(), loadRegions(), getAccount(), loadIdentityName()]);

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement,m=localStorage.getItem("aws-control-center.color-mode"),p=localStorage.getItem("aws-control-center.account-details");if(m==="light"||m==="dark")r.dataset.colorMode=m;if(p==="hidden")r.dataset.accountDetails="hidden"}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <WorkspaceShell initialRegion={current} regions={regions} accounts={listAccounts()} currentAccountId={account?.id} identity={identity}>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
