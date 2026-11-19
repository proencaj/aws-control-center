"use client";

import Link from "next/link";
import { Folder, File, ChevronDown } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { objectAction, type ObjectActionState } from "./actions";
import {
  formatSize,
  objectsUrl,
  storageClasses,
  storageInfo,
  storageName,
} from "./options";

export type ObjectRow = {
  key: string;
  size: number;
  etag: string;
  storageClass: string;
  modified: string;
};
type Operation = "delete" | "storage";
const buttonClass = "";

export function ObjectBrowser({
  bucket,
  prefix = "",
  folders = [],
  objects,
  versioning,
}: {
  bucket: string;
  prefix?: string;
  folders?: string[];
  objects: ObjectRow[];
  versioning: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedObjects = objects.filter((object) => selected.has(object.key));
  const eligible = objects.filter((object) => object.etag);
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  const [dialog, setDialog] = useState<{
    operation: Operation;
    objects: ObjectRow[];
  } | null>(null);
  const base = prefix.endsWith("/")
    ? prefix
    : prefix.slice(0, prefix.lastIndexOf("/") + 1);
  function open(operation: Operation) {
    setMenu(false);
    setDialog({ operation, objects: selectedObjects });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {objects.length} objects / {folders.length} folders on this page{" "}
          <span className="text-muted">
            · {selectedObjects.length} selected
          </span>
        </p>
        <div
          className="relative"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenu(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setMenu(false);
          }}
        >
          <button
            type="button"
            className={`${buttonClass} flex items-center gap-2`}
            disabled={!selectedObjects.length}
            aria-expanded={menu}
            aria-controls={menuId}
            onClick={() => setMenu(!menu)}
          >
            Actions <ChevronDown size={14} />
          </button>
          {menu && (
            <div
              id={menuId}
              className="raised absolute right-0 z-10 mt-1 w-60 p-1"
            >
              <button
                type="button"
                onClick={() => open("storage")}
                className="block w-full text-left"
              >
                Change storage class
              </button>
              <button
                type="button"
                onClick={() => open("delete")}
                className="block w-full text-left"
              >
                Delete objects
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="console-window overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all objects on this page"
                  disabled={!eligible.length}
                  checked={
                    eligible.length > 0 &&
                    selectedObjects.length === eligible.length
                  }
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selectedObjects.length > 0 &&
                        selectedObjects.length < eligible.length;
                  }}
                  onChange={(event) =>
                    setSelected(
                      new Set(
                        event.target.checked
                          ? eligible.map((object) => object.key)
                          : [],
                      ),
                    )
                  }
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Last modified (UTC)</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Storage class</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {folders.map((folder) => (
              <tr key={`folder:${folder}`}>
                <td />
                <td className="px-4 py-3">
                  <Link
                    className="flex items-center gap-2 underline"
                    href={objectsUrl(bucket, folder)}
                  >
                    <Folder size={16} className="shrink-0" />
                    {folder.slice(base.length)}
                  </Link>
                </td>
                <td className="px-4 py-3">Folder</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
              </tr>
            ))}
            {objects.map((object) => (
              <tr
                key={object.key}
                className={selected.has(object.key) ? "bg-surface" : undefined}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${object.key}`}
                    checked={selected.has(object.key)}
                    disabled={!object.etag}
                    onChange={(event) => {
                      const updated = new Set(selected);
                      if (event.target.checked) updated.add(object.key);
                      else updated.delete(object.key);
                      setSelected(updated);
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="flex items-center gap-2 underline"
                    href={`/s3/${encodeURIComponent(bucket)}/object?${new URLSearchParams({ key: object.key })}`}
                  >
                    <File size={16} className="shrink-0" />
                    <span className="break-all">
                      {object.key.slice(base.length)}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {object.key.split("/").pop()?.includes(".")
                    ? object.key.split(".").pop()
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {object.modified
                    ? object.modified.replace("T", " ").slice(0, 19)
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatSize(object.size)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {storageName(object.storageClass)}
                </td>
              </tr>
            ))}
            {!objects.length && !folders.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No objects found for this prefix.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <ObjectActionDialog
          bucket={bucket}
          versioning={versioning}
          operation={dialog.operation}
          objects={dialog.objects}
          onClose={() => {
            setDialog(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function ObjectActionDialog({
  bucket,
  versioning,
  operation,
  objects,
  onClose,
}: {
  bucket: string;
  versioning: string;
  operation: Operation;
  objects: ObjectRow[];
  onClose: () => void;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, action, pending] = useActionState<ObjectActionState, FormData>(
    objectAction,
    {},
  );
  const [confirmation, setConfirmation] = useState("");
  const [target, setTarget] = useState<(typeof storageClasses)[number] | "">(
    "",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const deleting = operation === "delete";
  const required = objects.length === 1 ? objects[0].key : bucket;
  const oversized = objects.some((object) => object.size > 5 * 1024 ** 3);
  useEffect(() => {
    modal.current?.showModal();
  }, []);
  return (
    <dialog
      ref={modal}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onClose}
      className="console-window m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto text-foreground"
    >
      <div className="console-title">
        <span>S3 / {deleting ? "Delete objects" : "Storage class"}</span>
        <span>{objects.length} selected</span>
      </div>
      <form action={action} className="space-y-5 p-5">
        <h2 id={titleId} className="console-heading">
          {deleting ? "Delete objects" : "Change storage class"}
        </h2>
        <p className="break-all text-sm">
          Bucket: <strong>{bucket}</strong> · Versioning: {versioning}
        </p>
        <input
          type="hidden"
          name="payload"
          value={JSON.stringify({
            bucket,
            operation,
            objects: objects.map(({ key, etag }) => ({ key, etag })),
            ...(target ? { storageClass: target } : {}),
          })}
        />
        <div className="max-h-48 overflow-auto border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">Object key</th>
                <th className="p-2">Size</th>
                <th className="p-2">Current class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {objects.map((object) => (
                <tr key={object.key}>
                  <td className="break-all p-2">{object.key}</td>
                  <td className="whitespace-nowrap p-2">
                    {formatSize(object.size)}
                  </td>
                  <td className="p-2">{storageName(object.storageClass)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deleting ? (
          <div className="space-y-3 text-sm">
            <p>
              {versioning === "Enabled"
                ? "This adds a delete marker for each selected object. Existing versions remain stored."
                : versioning === "Not enabled"
                  ? "This permanently deletes the selected objects. They cannot be recovered through S3."
                  : versioning === "Suspended"
                    ? "This permanently removes any null version and adds a delete marker. Other versions remain stored."
                    : "Without versioning, deletion is permanent. With versioning enabled, S3 adds delete markers; suspended versioning can permanently remove null versions."}
            </p>
            <p className="text-muted">
              Only the listed object keys are affected. Folder contents are not
              deleted recursively.
            </p>
            <label className="block space-y-2">
              <span>
                Type <code className="break-all font-semibold">{required}</code>{" "}
                to confirm.
              </span>
              <textarea
                name="confirm"
                rows={2}
                autoComplete="off"
                className="w-full"
                value={confirmation}
                disabled={pending || Boolean(state.results)}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <label className="block space-y-2">
              <span>New storage class</span>
              <select
                className="w-full"
                required
                value={target}
                disabled={pending || Boolean(state.results)}
                onChange={(event) =>
                  setTarget(event.target.value as typeof target)
                }
              >
                <option value="">Choose a storage class</option>
                {storageClasses.map((value) => (
                  <option key={value} value={value}>
                    {storageInfo[value].name}
                  </option>
                ))}
              </select>
            </label>
            {target && (
              <p className="border border-border bg-surface p-3">
                {storageInfo[target].description}
              </p>
            )}
            <p>
              Each object is copied onto its current key. Metadata, tags,
              supported ACL grants, encryption type and KMS key are preserved.
              Last modified changes; versioned buckets retain the old version
              and store a new one.
            </p>
            <p className="text-muted">
              Copy requests, retrieval and minimum storage charges may apply.
              Archived objects must be restored first. Objects over 5 GiB, SSE-C
              encryption and Object Lock buckets require a separate copy or
              Lifecycle workflow.
            </p>
            {oversized && (
              <p role="alert" className="font-semibold">
                This selection contains an object over 5 GiB. Deselect it to
                continue here.
              </p>
            )}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="acknowledge"
                value="yes"
                checked={acknowledged}
                disabled={pending || Boolean(state.results)}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                I understand this rewrites the selected objects and may incur
                storage and request charges.
              </span>
            </label>
          </div>
        )}
        {state.error && (
          <p role="alert" className="border border-border p-3 text-sm">
            {state.error}
          </p>
        )}
        {state.results && (
          <section className="space-y-2" aria-label="Action results">
            <p role="status" className="text-sm font-semibold">
              {
                state.results.filter((result) => result.status !== "failed")
                  .length
              }{" "}
              succeeded /{" "}
              {
                state.results.filter((result) => result.status === "failed")
                  .length
              }{" "}
              failed
            </p>
            <ul className="max-h-48 space-y-2 overflow-auto text-xs">
              {state.results.map((result) => (
                <li
                  key={result.key}
                  className="break-all border border-border p-2"
                >
                  {result.key}: <strong>{result.status}</strong>
                  {result.error && <p>{result.error}</p>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Close this dialog to review the refreshed list. Failed objects can
              be selected again.
            </p>
          </section>
        )}
        {pending && (
          <p role="status" className="text-sm">
            Applying changes…
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={pending}
            onClick={() => modal.current?.close()}
          >
            {state.results ? "Close" : "Cancel"}
          </button>
          {!state.results && (
            <button
              type="submit"
              className="font-bold"
              disabled={
                pending ||
                (deleting
                  ? confirmation !== required
                  : !target || !acknowledged || oversized)
              }
            >
              {deleting ? "Delete selected objects" : "Change storage class"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
