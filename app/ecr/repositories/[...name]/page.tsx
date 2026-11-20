import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { FilterSearch } from "@/components/filter-search";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { getRepository, listImages } from "@/lib/ecr";
import { getCallerIdentity } from "@/lib/sts";
import {
  deleteImageAction,
  deleteRepositoryAction,
  updateMutabilityAction,
} from "../../actions";
import { CopyRepositoryUri, PushCommands } from "../../push-commands";
import { repositoryUrl } from "../../urls";

function formatBytes(value?: number) {
  if (value === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function imagesUrl(
  name: string,
  options: { q?: string; status?: string; next?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status && options.status !== "ANY")
    params.set("status", options.status);
  if (options.next) params.set("next", options.next);
  const base = repositoryUrl(name);
  return `${base}${params.size ? `?${params}` : ""}`;
}

export default async function RepositoryPage({
  params,
  searchParams,
}: PageProps<"/ecr/repositories/[...name]">) {
  const [{ name: parts }, queryParams, region, identity] = await Promise.all([
    params,
    searchParams,
    getRegion(),
    getCallerIdentity(),
  ]);
  const name = parts.join("/");
  const tab = queryParams.tab === "settings" ? "settings" : "images";
  const repositoryResult = await attempt(getRepository(region, name));
  if ("error" in repositoryResult)
    return <ErrorNotice message={repositoryResult.error} />;
  const repository = repositoryResult.data;
  const context = { region, account: identity.account ?? "" };
  const base = repositoryUrl(name);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="console-kicker">Private repository</p>
          <h2 className="console-heading break-all">{name}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {repository.repositoryUri && (
            <CopyRepositoryUri uri={repository.repositoryUri} />
          )}
          {repository.repositoryUri && (
            <PushCommands
              repositoryUri={repository.repositoryUri}
              region={region}
            />
          )}
          <Link
            className="btn"
            href={`${base}${tab === "settings" ? "?tab=settings" : ""}`}
          >
            Refresh
          </Link>
        </div>
      </div>
      <dl className="console-window grid gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Repository URI", repository.repositoryUri],
          ["Tag mutability", repository.imageTagMutability],
          ["Encryption", repository.encryptionConfiguration?.encryptionType],
          [
            "Created (UTC)",
            repository.createdAt?.toISOString().replace("T", " ").slice(0, 19),
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 bg-surface p-4">
            <dt className="console-kicker">{label}</dt>
            <dd className="mt-1 break-all">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <nav className="console-tabs text-sm" aria-label="Repository sections">
        <Link aria-current={tab === "images" ? "page" : undefined} href={base}>
          Images
        </Link>
        <Link
          aria-current={tab === "settings" ? "page" : undefined}
          href={`${base}?tab=settings`}
        >
          Settings
        </Link>
      </nav>
      {tab === "settings" ? (
        <Settings repository={repository} context={context} />
      ) : (
        <Images
          name={name}
          region={region}
          context={context}
          searchParams={queryParams}
        />
      )}
    </section>
  );
}

async function Images({
  name,
  region,
  context,
  searchParams,
}: {
  name: string;
  region: string;
  context: { region: string; account: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const next =
    typeof searchParams.next === "string" ? searchParams.next : undefined;
  const rawStatus =
    typeof searchParams.status === "string" ? searchParams.status : "ANY";
  const status =
    rawStatus === "TAGGED" || rawStatus === "UNTAGGED" ? rawStatus : "ANY";
  const result = await attempt(listImages(region, name, q, next, status));
  return (
    <div className="space-y-4">
      <div className="group-box space-y-3 p-3">
        <FilterSearch
          param="q"
          value={q}
          label="Search images"
          placeholder="Find images by tag or digest"
        />
        <form className="flex flex-wrap items-end gap-2 text-sm">
          {q && <input type="hidden" name="q" value={q} />}
          <label className="space-y-1">
            <span className="console-kicker block">Tag status</span>
            <select name="status" defaultValue={status}>
              <option value="ANY">Any</option>
              <option value="TAGGED">Tagged</option>
              <option value="UNTAGGED">Untagged</option>
            </select>
          </label>
          <button>Apply</button>
        </form>
      </div>
      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                {result.data.images.length} images in this result batch
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3">Image tags</th>
                  <th className="px-4 py-3">Digest</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Pushed (UTC)</th>
                  <th className="px-4 py-3">Media type</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.images.map((image) => (
                  <tr key={image.imageDigest}>
                    <td className="px-4 py-3">
                      {image.imageTags?.length ? (
                        image.imageTags.join(", ")
                      ) : (
                        <span className="text-muted">Untagged</span>
                      )}
                    </td>
                    <td
                      className="max-w-56 truncate px-4 py-3 font-mono text-xs"
                      title={image.imageDigest}
                    >
                      {image.imageDigest ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatBytes(image.imageSizeInBytes)}
                    </td>
                    <td className="px-4 py-3">
                      {image.imagePushedAt
                        ?.toISOString()
                        .replace("T", " ")
                        .slice(0, 19) ?? "—"}
                    </td>
                    <td
                      className="max-w-48 truncate px-4 py-3"
                      title={image.imageManifestMediaType}
                    >
                      {image.imageManifestMediaType ??
                        image.artifactMediaType ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {image.imageDigest && (
                        <ConfirmDelete
                          action={deleteImageAction.bind(
                            null,
                            name,
                            image.imageDigest,
                          )}
                          resourceName={image.imageDigest}
                          label="Delete image"
                          impact="This permanently removes the image manifest and every tag attached to this digest."
                          hiddenFields={context}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {!result.data.images.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      {q
                        ? result.data.nextToken
                          ? "No matches in this batch. Continue searching the repository."
                          : "No images match this search."
                        : "No images match the selected tag status."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-4 text-xs">
            {next && (
              <Link className="underline" href={imagesUrl(name, { q, status })}>
                First page
              </Link>
            )}
            {result.data.nextToken && (
              <Link
                className="underline"
                href={imagesUrl(name, {
                  q,
                  status,
                  next: result.data.nextToken,
                })}
              >
                {q ? "Continue search →" : "Next page →"}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Settings({
  repository,
  context,
}: {
  repository: Awaited<ReturnType<typeof getRepository>>;
  context: { region: string; account: string };
}) {
  const name = repository.repositoryName!;
  const exclusions = (
    repository.imageTagMutabilityExclusionFilters ?? []
  ).flatMap((filter) =>
    filter.filterType && filter.filter
      ? [{ filterType: filter.filterType, filter: filter.filter }]
      : [],
  );
  const hasExclusions = exclusions.length > 0;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="console-window">
        <div className="console-title">Image tag mutability</div>
        <ActionForm
          action={updateMutabilityAction.bind(
            null,
            name,
            JSON.stringify(exclusions),
          )}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="region" value={context.region} />
          <input type="hidden" name="account" value={context.account} />
          <label className="block space-y-1 text-sm">
            <span>Setting</span>
            <select
              className="w-full"
              name="imageTagMutability"
              defaultValue={repository.imageTagMutability}
            >
              {hasExclusions ? (
                <>
                  <option value="MUTABLE_WITH_EXCLUSION">
                    Mutable with exclusions
                  </option>
                  <option value="IMMUTABLE_WITH_EXCLUSION">
                    Immutable with exclusions
                  </option>
                </>
              ) : (
                <>
                  <option value="MUTABLE">Mutable</option>
                  <option value="IMMUTABLE">Immutable</option>
                </>
              )}
            </select>
          </label>
          {hasExclusions && (
            <div className="group-box p-3 text-sm">
              <p className="font-medium">Preserved exclusion filters</p>
              <ul className="mt-2 list-inside list-disc font-mono text-xs">
                {exclusions.map((filter) => (
                  <li key={filter.filter}>
                    {filter.filterType}: {filter.filter}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="font-bold">Save changes</button>
        </ActionForm>
      </section>
      <section className="console-window">
        <div className="console-title">Delete repository</div>
        <div className="space-y-4 p-5 text-sm">
          <p>
            Only an empty repository can be deleted. Delete every image first.
          </p>
          <ConfirmDelete
            action={deleteRepositoryAction.bind(null, name)}
            resourceName={name}
            label="Delete repository"
            impact="This permanently deletes the empty repository. Images are never force-deleted."
            hiddenFields={context}
          />
        </div>
      </section>
    </div>
  );
}
