import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getRegion } from "@/lib/aws/clients";
import { getCallerIdentity } from "@/lib/sts";
import { createFromS3Action } from "../actions";
import { CreateFields, CreateZipForm } from "../zip-upload";

export default async function NewFunctionPage() {
  const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
  const context = { region, account: identity.account ?? "" };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="console-kicker">Lambda function</p><h2 className="console-heading">Create function</h2></div>
        <Link href="/lambda" className="btn">Cancel</Link>
      </div>
      <p className="text-sm text-muted">Use an existing IAM execution role. This console does not create or modify IAM roles.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="console-window">
          <div className="console-title">Upload a local ZIP</div>
          <div className="p-5"><CreateZipForm context={context} /></div>
        </section>
        <section className="console-window">
          <div className="console-title">Deploy a ZIP from S3</div>
          <ActionForm action={createFromS3Action} className="space-y-4 p-5">
            <input type="hidden" name="region" value={context.region} />
            <input type="hidden" name="account" value={context.account} />
            <CreateFields />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-medium">S3 bucket</span><input required name="s3Bucket" className="w-full" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Object key</span><input required name="s3Key" className="w-full" placeholder="releases/function.zip" /></label>
            </div>
            <label className="block space-y-1 text-sm"><span className="font-medium">Object version (optional)</span><input name="s3ObjectVersion" className="w-full" /></label>
            <p className="text-xs text-muted">The S3 bucket must be in {region}. Lambda reads the object during creation.</p>
            <button className="font-bold">Create function</button>
          </ActionForm>
        </section>
      </div>
    </section>
  );
}
