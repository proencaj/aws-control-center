import Link from "next/link";
import { FilterSearch } from "@/components/filter-search";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { getRegion } from "@/lib/aws/clients";
import { listRepositories } from "@/lib/ecr";
import { CopyRepositoryUri, PushCommands } from "./push-commands";
import { repositoryUrl } from "./urls";

function queryUrl(query: string, next?: string) {
  const params = new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(next ? { next } : {}),
  });
  return `/ecr${params.size ? `?${params}` : ""}`;
}

export default async function RepositoriesPage({
  searchParams,
}: PageProps<"/ecr">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  const region = await getRegion();
  const result = await attempt(listRepositories(region, query, next));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="console-kicker">Private registry / {region}</p>
          <h2 className="console-heading">Repositories</h2>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href={queryUrl(query, next)}>
            Refresh
          </Link>
          <Link className="btn font-bold" href="/ecr/new">
            Create repository
          </Link>
        </div>
      </div>
      <FilterSearch
        param="q"
        value={query}
        label="Search repositories"
        placeholder="Find repositories by name"
      />
      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                {result.data.repositories.length} repositories in this result
                batch
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3">Repository name</th>
                  <th className="px-4 py-3">Tag mutability</th>
                  <th className="px-4 py-3">Encryption</th>
                  <th className="px-4 py-3">Created (UTC)</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.repositories.map((repository) => (
                  <tr key={repository.repositoryArn}>
                    <td className="px-4 py-3">
                      <Link
                        className="underline"
                        href={repositoryUrl(repository.repositoryName!)}
                      >
                        {repository.repositoryName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {repository.imageTagMutability ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {repository.encryptionConfiguration?.encryptionType ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {repository.createdAt
                        ?.toISOString()
                        .replace("T", " ")
                        .slice(0, 19) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
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
                      </div>
                    </td>
                  </tr>
                ))}
                {!result.data.repositories.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted">
                      {query
                        ? result.data.nextToken
                          ? "No matches in this batch. Continue searching the registry."
                          : "No repositories match this search."
                        : "No private repositories exist in this region."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-4 text-xs">
            {next && (
              <Link className="underline" href={queryUrl(query)}>
                First page
              </Link>
            )}
            {result.data.nextToken && (
              <Link
                className="underline"
                href={queryUrl(query, result.data.nextToken)}
              >
                {query ? "Continue search →" : "Next page →"}
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
