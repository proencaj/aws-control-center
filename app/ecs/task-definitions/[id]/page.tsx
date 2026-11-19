import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { DefinitionView, type Query } from "../../views";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  try {
    const { id } = await params;
    return await DefinitionView({
      region: await getRegion(),
      id: id,
      query: await searchParams,
    });
  } catch (error) {
    return <ErrorNotice message={toUiError(error)} />;
  }
}
