"use client";

export function AccountSelect({ accounts, current, onChange }: { accounts: { id: string; name: string }[]; current: string; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="account">Account</label>
      <select id="account" name="account" key={current} defaultValue={current} onChange={(event) => onChange(event.target.value)}>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} ({account.id})
          </option>
        ))}
      </select>
    </div>
  );
}
