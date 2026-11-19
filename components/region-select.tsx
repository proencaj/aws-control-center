"use client";

export function RegionSelect({ regions, current, onChange }: { regions: string[]; current: string; onChange: (region: string) => void }) {
  const options = regions.includes(current) ? regions : [current, ...regions];

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="region">
        Region
      </label>
      <select
        id="region"
        name="region"
        defaultValue={current}
        onChange={(event) => onChange(event.target.value)}
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
