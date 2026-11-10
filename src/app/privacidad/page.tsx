import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-page";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacidad · Metrix",
  description: "Política de privacidad de Metrix.",
};

const UPDATED = "10 de noviembre de 2026";

export default function PrivacyPage() {
  const contact = getEnv().CONTACT_EMAIL;
  return (
    <PublicPage title="Política de privacidad">
      <p>Última actualización: {UPDATED}.</p>
      <p>
        Metrix es una aplicación personal de un solo usuario. Su dueño la usa para ver las métricas de sus propias cuentas de YouTube, Instagram,
        Facebook y TikTok. No se ofrece a otras personas.
      </p>

      <h2>Datos que se leen y permisos</h2>
      <ul>
        <li>
          <strong className="text-foreground">YouTube</strong> (permisos <code>youtube.readonly</code> y <code>yt-analytics.readonly</code>): datos
          del canal, lista de videos y sus estadísticas, y reportes de YouTube Analytics (vistas, tiempo de visualización, retención, audiencia y
          fuentes de tráfico). Con <code>youtube.upload</code> sube los videos que el usuario programa, con la visibilidad que él elige.
          Metrix usa los Servicios de la API de YouTube; al conectar YouTube también aplica la 
          <a href="https://policies.google.com/privacy" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            Política de privacidad de Google
          </a>
          .
        </li>
        <li>
          <strong className="text-foreground">Google Drive</strong> (permiso <code>drive.file</code>): solo los videos que el usuario elige con el
          selector de Google, para descargarlos en el momento de publicarlos. Metrix no ve ni lista el resto de su Drive y no guarda copia de los
          videos.
        </li>
        <li>
          <strong className="text-foreground">Facebook e Instagram</strong> (permisos de lectura de Páginas e Instagram): datos de la Página y de
          la cuenta profesional de Instagram vinculada, sus publicaciones y sus estadísticas, y datos públicos de cuentas de empresa o creador que
          el usuario elige comparar. Con <code>instagram_content_publish</code> y <code>pages_manage_posts</code> publica los Reels que el
          usuario programa.
        </li>
        <li>
          <strong className="text-foreground">TikTok</strong> (permisos <code>user.info.basic</code>, <code>user.info.profile</code>,{" "}
          <code>user.info.stats</code> y <code>video.list</code>): perfil y estadísticas de los videos propios. Con <code>video.publish</code>{" "}
          publica los videos que el usuario programa, con la privacidad, las interacciones y la divulgación de contenido comercial que él elige
          en cada publicación.
        </li>
      </ul>

      <h2>Cómo se usan</h2>
      <p>
        Para mostrar al dueño de la cuenta sus propias métricas, su evolución y reportes, y para publicar en sus cuentas los videos que él mismo
        elige y programa, con el texto que él escribe. Metrix no publica nada por su cuenta, no edita ni borra contenido existente, no vende ni
        comparte datos con terceros y no los usa para publicidad.
      </p>
      <p>
        El uso y la transferencia de la información recibida de las APIs de Google se apegan a la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-foreground underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          Política de datos de usuario de los servicios de las APIs de Google
        </a>
        , incluidos los requisitos de uso limitado.
      </p>

      <h2>Cómo se guardan</h2>
      <ul>
        <li>Las métricas se guardan en una base de datos de Supabase con acceso restringido al dueño (seguridad a nivel de fila).</li>
        <li>Los tokens de acceso se guardan cifrados con AES-256-GCM y nunca se envían al navegador.</li>
        <li>
          Si el dueño conecta un asistente de IA (por ejemplo, Claude) mediante el servidor MCP de Metrix, ese asistente puede leer los datos
          guardados y programar publicaciones solo después de que el dueño lo autorice con su sesión, y el acceso se puede quitar en cualquier
          momento desde Configuración → Claude.
        </li>
        <li>
          De cada publicación programada se guardan el texto, la fecha, el identificador y el nombre del archivo de Drive, y el resultado en cada
          red. El video pasa directo de Google Drive a cada red y no se almacena.
        </li>
        <li>La aplicación se ejecuta en Vercel. Supabase y Vercel actúan solo como proveedores de infraestructura.</li>
      </ul>

      <h2 id="eliminacion">Eliminación de datos</h2>
      <ul>
        <li>
          En Configuración → Conexiones, el botón <strong className="text-foreground">Desconectar y borrar datos</strong> de cada cuenta quita
          el acceso de Metrix en la red (Google y TikTok) y borra de inmediato todos los datos guardados de esa cuenta: métricas, publicaciones,
          tokens y su historial.
        </li>
        <li>
          También se puede retirar el acceso en cualquier momento desde la 
          <a href="https://security.google.com/settings/security/permissions" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            página de permisos de la cuenta de Google
          </a>
          , desde Configuración y privacidad → Seguridad → Apps con permiso en TikTok o desde las integraciones comerciales de Facebook e
          Instagram. A partir de ese momento Metrix ya no puede leer datos nuevos ni publicar; Metrix lo detecta en su sincronización diaria y
          marca la cuenta para reconectar.
        </li>
        <li>Para pedir que se borre cualquier dato restante, usa el correo de contacto de abajo. Se atiende en un máximo de 7 días.</li>
      </ul>

      <h2>Contacto</h2>
      <p>
        {contact ? (
          <>
            Para cualquier duda o para pedir la eliminación de datos, escribe a{" "}
            <a href={`mailto:${contact}`} className="text-foreground underline underline-offset-4">
              {contact}
            </a>
            .
          </>
        ) : (
          "Para cualquier duda o para pedir la eliminación de datos, usa el correo de contacto del desarrollador registrado en la app de Google o de Meta."
        )}
      </p>
    </PublicPage>
  );
}
