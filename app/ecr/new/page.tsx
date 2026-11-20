import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getRegion } from "@/lib/aws/clients";
import { getCallerIdentity } from "@/lib/sts";
import { createRepositoryAction } from "../actions";

export default async function NewRepositoryPage() {
  const [region, identity] = await Promise.all([
    getRegion(),
    getCallerIdentity(),
  ]);
  return (
    <section className="console-window max-w-3xl">
      <div className="console-title">
        <span>Create private repository</span>
        <Link href="/ecr" className="underline">
          Cancel
        </Link>
      </div>
      <ActionForm action={createRepositoryAction} className="space-y-5 p-5">
        <input type="hidden" name="region" value={region} />
        <input type="hidden" name="account" value={identity.account} />
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Repository name</span>
          <input
            required
            name="repositoryName"
            className="w-full"
            placeholder="team/application"
            minLength={2}
            maxLength={256}
          />
          <span className="block text-xs text-muted">
            Lowercase letters, numbers, separators, and / namespaces.
          </span>
        </label>
        <fieldset className="group-box space-y-3 p-4">
          <legend className="px-1 font-medium">Image tag mutability</legend>
          <label className="flex gap-2 text-sm">
            <input
              type="radio"
              name="imageTagMutability"
              value="MUTABLE"
              defaultChecked
            />{" "}
            Mutable — tags can be overwritten
          </label>
          <label className="flex gap-2 text-sm">
            <input type="radio" name="imageTagMutability" value="IMMUTABLE" />{" "}
            Immutable — pushed tags cannot be overwritten
          </label>
        </fieldset>
        <div className="group-box p-4 text-sm">
          <strong>Encryption:</strong> AES-256 managed by ECR
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/ecr" className="btn">
            Cancel
          </Link>
          <button className="font-bold">Create repository</button>
        </div>
      </ActionForm>
    </section>
  );
}
