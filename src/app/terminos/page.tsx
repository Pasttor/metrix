import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-page";

export const metadata: Metadata = {
  title: "Términos · Metrix",
  description: "Términos de uso de Metrix.",
};

export default function TermsPage() {
  return (
    <PublicPage title="Términos de uso">
      <p>Última actualización: 10 de noviembre de 2026.</p>
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
      <h2>Servicios de terceros</h2>
      <ul>
        <li>
          Metrix usa los Servicios de la API de YouTube. Al usar Metrix con YouTube, aceptas quedar sujeto a los{" "}
          <a href="https://www.youtube.com/t/terms" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Términos del servicio de YouTube
          </a>{" "}
          y a la{" "}
          <a href="https://policies.google.com/privacy" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Política de privacidad de Google
          </a>
          .
        </li>
        <li>
          Las publicaciones en TikTok se rigen por los{" "}
          <a href="https://www.tiktok.com/legal/page/global/terms-of-service/en" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Términos del servicio de TikTok
          </a>
          , su{" "}
          <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Confirmación de uso de música
          </a>{" "}
          y, si el video es contenido de marca, su{" "}
          <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Política de contenido de marca
          </a>
          .
        </li>
        <li>Las publicaciones en Facebook e Instagram se rigen por los términos y las normas comunitarias de Meta.</li>
      </ul>
      <h2>Acceso y revocación</h2>
      <p>
        El usuario puede desconectar cualquier cuenta desde Configuración → Conexiones con <strong className="text-foreground">Desconectar y
        borrar datos</strong>, o desde la configuración de la red correspondiente (las apps con permiso de TikTok, los permisos de la cuenta de
        Google o las integraciones comerciales de Meta). Después de revocar el acceso, Metrix deja de leer datos nuevos de esa red y no puede
        publicar en ella.
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
