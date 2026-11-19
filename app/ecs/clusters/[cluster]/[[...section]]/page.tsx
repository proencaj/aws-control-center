import { notFound } from "next/navigation";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { resourceName } from "@/lib/ecs-validation";
import { ClusterView, type Query } from "../../../views";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ cluster: string; section?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { cluster, section = [] } = await params;
  if (
    !resourceName.safeParse(cluster).success ||
    section.length > 3 ||
    (section[0] &&
      !["services", "tasks", "container-instances"].includes(section[0])) ||
    (section[2] &&
      (section[0] !== "services" ||
        !["tasks", "deployments", "autoscaling"].includes(section[2])))
  )
    notFound();
  try {
    return await ClusterView({
      region: await getRegion(),
      cluster,
      section,
      query: await searchParams,
    });
  } catch (error) {
    return <ErrorNotice message={toUiError(error)} />;
  }
}
