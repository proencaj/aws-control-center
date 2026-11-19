export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="console-window text-sm">
      <p className="console-title">Request failed / Could not load data</p>
      <div className="space-y-3 p-4">
        <p className="break-words">{message}</p>
        <p className="text-xs text-muted">
          Check the selected region and account permissions, then reload to
          retry.
        </p>
      </div>
    </div>
  );
}
