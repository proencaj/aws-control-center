import { getRegion } from "@/lib/aws/clients";
import { NewCluster } from "../../views";
export default async function Page() {
  return <NewCluster region={await getRegion()} />;
}
