import { Suspense } from "react";
import type { Metadata } from "next";
import { CircleCheck, CircleX, Clock, LoaderCircle, Ban } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Section } from "@/components/metrics/section";
import { NetworkIcon } from "@/components/overview/network-icon";
import { AutoRefresh } from "@/components/publishing/auto-refresh";
import { PublishForm, type PickerConfig } from "@/components/publishing/publish-form";
import { Button } from "@/components/ui/button";
import { utcToZonedInput } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getDriveAccount, listPublishAccounts, listScheduledPosts, postsInFlight, SCHEDULED_SHOWN, type ScheduledPost, type ScheduledTarget } from "@/lib/metrics/publishing-data";
import type { PostStatus } from "@/lib/publishing/runner";
import { cancelPostAction, retryTargetAction } from "./actions";

export const metadata: Metadata = { title: "Publicar · Metrix" };

const NETWORK: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };

const POST_STATUS: Record<PostStatus, string> = {
  scheduled: "Programada",
  publishing: "Publicando",
  done: "Publicada",
  partial: "Publicada en parte",
  failed: "Falló",
  canceled: "Cancelada",
};

const TARGET_STATUS = {
  pending: { icon: Clock, label: "En cola", tone: "text-muted-foreground" },
  processing: { icon: LoaderCircle, label: "Procesando", tone: "text-sky-700 dark:text-sky-400" },
  published: { icon: CircleCheck, label: "Publicado", tone: "text-emerald-700 dark:text-emerald-400" },
  failed: { icon: CircleX, label: "Falló", tone: "text-red-700 dark:text-red-400" },
  canceled: { icon: Ban, label: "Cancelado", tone: "text-muted-foreground" },
} as const;

function TargetRow({ target }: { target: ScheduledTarget }) {
  const meta = TARGET_STATUS[target.status];
  const Icon = meta.icon;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <span className="flex w-28 items-center gap-1.5 text-sm font-medium">
        <NetworkIcon platform={target.platform} />
        {NETWORK[target.platform]}
      </span>
      <span className={`flex items-center gap-1 text-sm ${meta.tone}`}>
        <Icon aria-hidden className="size-4" />
        {meta.label}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        {target.permalink ? (
          <a href={target.permalink} target="_blank" rel="noreferrer" className="w-fit font-medium underline underline-offset-4">
            Ver publicación
          </a>
        ) : null}
        {target.note ? <span className="text-xs text-muted-foreground">{target.note}</span> : null}
        {target.error ? <span className="text-xs text-muted-foreground">{target.error}</span> : null}
      </span>
      {target.status === "failed" ? (
        <form action={retryTargetAction}>
          <input type="hidden" name="id" value={target.id} />
          <Button type="submit" size="sm" variant="outline">
            Reintentar
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function PostCard({ post }: { post: ScheduledPost }) {
  const cancelable = post.targets.some((target) => target.status === "pending");
  const firstLine = post.caption.split("\n").find((line) => line.trim()) ?? post.fileName ?? "Video sin texto";
  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold">{firstLine}</p>
          <p className="text-xs text-muted-foreground">
            {POST_STATUS[post.status]} · {formatDateTime(post.scheduledAt)}
            {post.fileName ? ` · ${post.fileName}` : ""}
          </p>
        </div>
        {cancelable ? (
          <form action={cancelPostAction}>
            <input type="hidden" name="id" value={post.id} />
            <Button type="submit" size="sm" variant="ghost">
              Cancelar
            </Button>
          </form>
        ) : null}
      </div>
      <ul className="divide-y">
        {post.targets.map((target) => (
          <TargetRow key={target.id} target={target} />
        ))}
      </ul>
    </li>
  );
}

async function NewPost() {
  const env = getEnv();
  const [accounts, drive] = await Promise.all([listPublishAccounts(), getDriveAccount()]);
  const keys = env.GOOGLE_CLIENT_ID && env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY && env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER;
  const pickerProblem = !keys
    ? "Falta configurar Google Picker (NEXT_PUBLIC_GOOGLE_PICKER_API_KEY y NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER)."
    : !drive
      ? "Conecta Google Drive en Configuración → Conexiones con la cuenta donde guardas los videos."
      : drive.status !== "active"
        ? "Reconecta Google Drive en Configuración → Conexiones."
        : null;
  const picker: PickerConfig | null =
    keys && !pickerProblem
      ? {
          clientId: env.GOOGLE_CLIENT_ID!,
          apiKey: env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY!,
          appId: env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER!,
          loginHint: drive?.email ?? undefined,
        }
      : null;
  return (
    <PublishForm
      accounts={accounts}
      picker={picker}
      pickerProblem={pickerProblem}
      minScheduledAt={utcToZonedInput(new Date(), env.REPORT_TIMEZONE)}
      timeZoneLabel={env.REPORT_TIMEZONE === "America/Mexico_City" ? "hora de Ciudad de México" : env.REPORT_TIMEZONE}
    />
  );
}

async function PostList() {
  const posts = await listScheduledPosts();
  if (posts.length === 0) return <EmptyState message="Todavía no hay publicaciones. Las que programes aparecerán aquí con el estado de cada red." />;
  return (
    <>
      <AutoRefresh active={postsInFlight(posts)} />
      <ul className="flex flex-col gap-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Se muestran las últimas {SCHEDULED_SHOWN}.</p>
    </>
  );
}

export default function PublishPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Publicar</h1>
        <p className="text-sm text-muted-foreground">
          Elige un video de tu Google Drive, escribe el texto y publícalo ahora o a la hora que quieras en Instagram, Facebook, YouTube y TikTok.
        </p>
      </header>
      {/* Both read the session, so they render at request time. */}
      <Section title="Nueva publicación">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
          <NewPost />
        </Suspense>
      </Section>
      <Section title="Programadas y publicadas">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
          <PostList />
        </Suspense>
      </Section>
    </>
  );
}
