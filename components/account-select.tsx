"use client";

export function AccountSelect({ accounts, current, onChange }: { accounts: { id: string; name: string }[]; current: string; onChange: (id: string) => void }) {
  return (
    <>
      <div className="private-value flex items-center gap-2 text-sm">
        <label htmlFor="account">Account</label>
        <select id="account" name="account" key={current} defaultValue={current} onChange={(event) => onChange(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.id})
            </option>
          ))}
        </select>
      </div>
      <div className="private-mask flex items-center gap-2 text-sm">
        <label htmlFor="account-hidden">Account</label>
        <select id="account-hidden" aria-label="Account hidden" disabled defaultValue="hidden">
          <option value="hidden">****</option>
        </select>
      </div>
    </>
  );
}
