import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { ProviderList, type Query } from "../views";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  try {
    return await ProviderList({
      region: await getRegion(),
      query: await searchParams,
    });
  } catch (error) {
    return <ErrorNotice message={toUiError(error)} />;
  }
}
