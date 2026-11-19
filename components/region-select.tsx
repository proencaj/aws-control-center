"use client";

export function RegionSelect({ regions, current, onChange }: { regions: string[]; current: string; onChange: (region: string) => void }) {
  const options = regions.includes(current) ? regions : [current, ...regions];

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="region" className="text-muted">
        Region
      </label>
      <select
        id="region"
        name="region"
        defaultValue={current}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 outline-none focus:border-foreground"
      >
        {options.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </select>
    </div>
  );
}
