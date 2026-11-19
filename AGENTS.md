# AWS Control Center

A local web interface, built with Next.js, that works like a lightweight AWS Management Console. It reads AWS credentials from environment variables and uses the AWS SDK to list, create, edit and delete resources in a real AWS account.

## Goals

1. **Console-like UX.** Familiar navigation: service list, region selector, resource tables, detail pages, create/edit forms. Inspired by the AWS console layout, but no AWS logos, icons or copied assets.
2. **Real operations.** Every screen talks to a real AWS account through the SDK. No mocks in the running app.
3. **Full CRUD per service.** Read first, then create, update and delete.
4. **Safe by default.** Credentials never reach the browser. Destructive actions require explicit confirmation.
5. **Small and readable.** One service at a time, minimal abstractions, easy to add the next service.

## Non-goals

- Multi-user hosting, login, or multi-account management. This runs locally for one person.
- Covering every AWS service or every API option.
- Replacing the AWS CLI or Terraform for infrastructure management.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (latest stable), App Router, React Server Components |
| Language | TypeScript, `strict: true` |
| AWS access | AWS SDK for JavaScript v3, one modular client per service (`@aws-sdk/client-s3`, `@aws-sdk/client-ec2`, ...) |
| Styling | Tailwind CSS |
| UI components | shadcn/ui (copied into the repo, only what is used) |
| Icons | `lucide-react`, grayscale, 16px in navigation |
| Forms / validation | Native forms + Server Actions, `zod` for input validation |
| Tests | Vitest, `aws-sdk-client-mock` for SDK calls |
| Lint / format | ESLint (Next.js config), Prettier |
| Package manager | **npm**. Do not use pnpm, yarn or bun. |
| Runtime | Node.js 26, run through Docker (`node:26-alpine`) and Docker Compose |

## Credentials and configuration

Credentials live in `.env.local` (git-ignored). Commit an `.env.example` with empty values.

```bash
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=     # optional, for temporary credentials
AWS_REGION=us-east-1   # default region, the UI can override per request
```

The SDK picks these up through its default credential chain. Do not pass keys manually to clients.

Docker Compose injects `.env.local` at runtime via `env_file`. `.dockerignore` excludes `.env*`, so credentials are never baked into the image.

### Hard rules

- **Never** prefix AWS variables with `NEXT_PUBLIC_`.
- **Never** import `@aws-sdk/*` from a Client Component. SDK code lives only in files marked `import "server-only"`.
- **Never** log, return or render credentials, even partially.
- AWS calls happen only in Server Components, Server Actions, or Route Handlers.

## Architecture

```
app/
  layout.tsx               # shell: top bar (region selector, account id), side nav
  page.tsx                 # home: service list
  s3/
    page.tsx               # list buckets
    [bucket]/page.tsx      # list objects
    actions.ts             # "use server" mutations: create/delete bucket, upload/delete object
  ec2/ ...
  dynamodb/ ...
lib/
  aws/
    clients.ts             # client factories per service, keyed by region
    errors.ts              # maps SDK ServiceException to UI-friendly errors
  s3.ts                    # S3 calls used by app/s3 (server-only)
  ec2.ts
components/
  ui/                      # shadcn/ui primitives
  resource-table.tsx       # shared table only after 3 services need it
  confirm-delete.tsx       # "type the resource name to confirm" dialog
```

### Data flow

- **Reads:** Server Component calls a function in `lib/<service>.ts`, renders the result. Use `searchParams` for region, pagination tokens and filters, so URLs are shareable and refresh-safe.
- **Writes:** Form submits to a Server Action in `app/<service>/actions.ts`. The action validates input with zod, calls `lib/<service>.ts`, then `revalidatePath`. Return `{ error }` on failure, do not throw to the client.
- **Region:** selected in the top bar, stored in a cookie, read on the server when creating clients. Global services (IAM, S3 bucket listing) ignore it.
- **Pagination:** use the SDK paginators (`paginateListObjectsV2`, etc.) or pass `NextToken`/`ContinuationToken` through the URL. Never load an unbounded list into memory.

### Error handling

- Catch SDK errors only at the action/page boundary. Map by `error.name` (`AccessDenied`, `NoSuchBucket`, `ResourceNotFoundException`, ...) in `lib/aws/errors.ts`.
- Show `AccessDenied` clearly. Missing IAM permissions are expected and must not crash the page.
- Missing credentials at startup show a single setup screen explaining which env vars to set.

## Service roadmap

Build in this order. Finish read + write for one service before starting the next.

1. **Account basics**: STS `GetCallerIdentity` (show account id, verifies credentials), region list.
2. **S3**: buckets (list, create, delete), objects (list with prefixes as folders, upload, download via presigned URL, delete).
3. **DynamoDB**: tables (list, describe, create, delete), items (scan/query with pagination, put, edit, delete).
4. **EC2**: instances (list, describe, start, stop, reboot, terminate), security groups (list, edit rules).
5. **Lambda**: functions (list, view config, invoke with JSON payload, update env vars, delete).
6. **IAM**: users, roles, policies (list, view, attach/detach).

Later candidates: CloudWatch Logs, SQS, SNS, Secrets Manager.

## Safety for destructive actions

- Delete/terminate requires a dialog where the user types the resource name, like the AWS console.
- Show what will be affected (e.g. "bucket must be empty", "this terminates 3 instances").
- No bulk delete across resource types. No "delete all".
- Prefer the SDK's dry-run flags where they exist (EC2 `DryRun`) when validating forms.

## Style

- **Minimalist.** Plain layouts, generous whitespace, thin borders, no shadows, gradients or decorative elements.
- **Grayscale only.** Colors range from white to black. No accent, brand or status colors (no red, green, amber, blue). Convey state with text, weight, borders and icons instead.
- **Light and dark mode.** Both are required on every screen. Follow the system preference (`prefers-color-scheme`). Use Tailwind `dark:` variants and define colors once as CSS variables in `app/globals.css`, so no component hardcodes a color.
- **Destructive actions** are marked by wording and the confirm dialog, not by color.
- Use Tailwind's `neutral` or `zinc` scale only. Never `slate`, `red`, `green` or any other hue.

## Conventions

- Follow the minimalist philosophy: fewest files and abstractions that work. Extract shared code only on the third repetition.
- Name things after AWS concepts: `Bucket`, `ObjectKey`, `InstanceId`, `TableName`. Reuse the SDK's exported types instead of redefining them.
- One `lib/<service>.ts` per service. Keep SDK calls there so pages and actions stay thin.
- Keep components server-side by default. Add `"use client"` only for interactivity (dialogs, region selector, upload progress).
- Test `lib/<service>.ts` functions and Server Actions with `aws-sdk-client-mock`. Never hit a real account in tests.

## Commands

Run the app with Docker Compose. Source is bind-mounted, so hot reload works.

```bash
docker compose up --build              # http://localhost:3000
docker compose exec app npm run lint
docker compose exec app npm test
docker compose exec app npm install <pkg>
```

`node_modules` and `.next` live in anonymous volumes inside the container, not on the host. Compose reuses those volumes across restarts, so after dependencies change in `package-lock.json` (e.g. after a pull), run `docker compose up --build -V` to rebuild and refresh them.

## Testing against a real account

Use a dedicated sandbox account or an IAM user with limited permissions. Do not point this app at production while developing write features.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
