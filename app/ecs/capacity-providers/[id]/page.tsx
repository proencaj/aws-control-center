import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { ProviderView } from "../../views";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return await ProviderView({ region: await getRegion(), name: id });
  } catch (error) {
    return <ErrorNotice message={toUiError(error)} />;
  }
}
