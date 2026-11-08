import { LogOut } from "lucide-react";
import { signOut } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { getSessionEmail } from "@/lib/db/server";

/** Reads the session, so it must render inside <Suspense>. */
export async function UserMenu() {
  const email = await getSessionEmail();
  return (
    <div className="flex items-center gap-2">
      {email ? <span className="hidden text-sm text-muted-foreground lg:inline">{email}</span> : null}
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
