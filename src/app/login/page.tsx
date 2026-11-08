import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar · Metrix",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Metrix</CardTitle>
          <CardDescription>Te enviaremos un enlace de acceso a tu correo.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Reads the URL (error and next params), so it renders at request time. */}
          <Suspense fallback={<div className="h-28" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
