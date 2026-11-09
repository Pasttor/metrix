import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-page";

export const metadata: Metadata = {
  title: "Términos · Metrix",
  description: "Términos de uso de Metrix.",
};

export default function TermsPage() {
  return (
    <PublicPage title="Términos de uso">
      <p>Última actualización: 9 de noviembre de 2026.</p>
      <h2>Qué es Metrix</h2>
      <p>
        Metrix es una herramienta personal de un solo usuario para consultar las métricas de las cuentas propias de su dueño en YouTube,
        Instagram, Facebook y TikTok, y para programar y publicar en ellas sus propios videos. No se ofrece al público ni se comercializa.
      </p>
      <h2>Uso permitido</h2>
      <ul>
        <li>Solo el dueño de las cuentas conectadas puede entrar a Metrix.</li>
        <li>Metrix usa solo las APIs oficiales de cada red.</li>
        <li>
          Metrix publica únicamente los videos que el usuario elige de su Google Drive, con el texto que él escribe y a la hora que él programa.
          No edita ni borra contenido existente. El usuario es responsable de lo que publica y de respetar las normas de cada red.
        </li>
        <li>Los datos se usan únicamente para mostrar estadísticas y reportes al propio usuario y para hacer las publicaciones que programa.</li>
      </ul>
      <h2>Acceso y revocación</h2>
      <p>
        El usuario puede desconectar cualquier red en cualquier momento desde la configuración de la red correspondiente (por ejemplo, las apps
        autorizadas de TikTok, la cuenta de Google o las integraciones comerciales de Meta). Después de revocar el acceso, Metrix deja de leer
        datos nuevos de esa red y no puede publicar en ella.
      </p>
      <h2>Privacidad</h2>
      <p>
        El tratamiento de los datos se describe en la <a href="/privacidad" className="text-foreground underline underline-offset-4">política de privacidad</a>.
      </p>
      <h2>Sin garantías</h2>
      <p>Metrix se ofrece tal cual, para uso personal. Las cifras dependen de lo que entrega cada red y pueden llegar con retraso o ajustarse.</p>
    </PublicPage>
  );
}
