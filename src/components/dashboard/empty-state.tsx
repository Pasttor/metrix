import Link from "next/link";

export function EmptyState({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      <p>{message}</p>
      {action ? (
        <Link href={action.href} className="font-medium text-foreground underline underline-offset-4">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
