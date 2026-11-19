import "server-only";
import { readFileSync } from "node:fs";
import { cookies } from "next/headers";
import { z } from "zod";

export const ACCOUNT_COOKIE = "account";

const accountsSchema = z.array(
  z.object({
    id: z.string().regex(/^\d{12}$/, "id must be a 12-digit account id"),
    name: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
  }),
);
type Account = z.infer<typeof accountsSchema>[number];

let loaded: Account[] | undefined;

export function parseAccounts(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // The native message quotes part of the file, which holds secrets.
    throw new Error("accounts.json is not valid JSON");
  }
  const result = accountsSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`accounts.json is invalid. ${problems.join("; ")}`);
  }
  return result.data;
}

function accounts() {
  if (loaded) return loaded;
  try {
    loaded = parseAccounts(readFileSync(process.env.ACCOUNTS_FILE ?? "accounts.json", "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    loaded = [];
  }
  return loaded;
}

export function listAccounts() {
  return accounts().map(({ id, name }) => ({ id, name }));
}

export function hasAccounts() {
  return accounts().length > 0;
}

export async function getAccount() {
  const selected = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const all = accounts();
  return all.find((account) => account.id === selected) ?? all[0];
}

// Clients are cached per region and shared by every account, so the account is
// resolved on each request. The near expiration makes the SDK call this again
// instead of memoizing the first account's keys forever.
export const accountCredentials = async () => {
  const account = await getAccount();
  if (!account) throw new Error("No account configured. Add one to accounts.json.");
  return {
    accessKeyId: account.accessKeyId,
    secretAccessKey: account.secretAccessKey,
    sessionToken: account.sessionToken || undefined,
    expiration: new Date(Date.now() + 60_000),
  };
};
