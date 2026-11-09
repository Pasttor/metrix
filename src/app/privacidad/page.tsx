import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-page";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacidad · Metrix",
  description: "Política de privacidad de Metrix.",
};

const UPDATED = "9 de noviembre de 2026";

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
          fuentes de tráfico). Con <code>youtube.upload</code> sube los videos que el usuario programa.
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
          <strong className="text-foreground">TikTok</strong>: perfil y estadísticas de los videos propios y, con <code>video.upload</code> y{" "}
          <code>video.publish</code>, publicación de los videos que el usuario programa.
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
          De cada publicación programada se guardan el texto, la fecha, el identificador y el nombre del archivo de Drive, y el resultado en cada
          red. El video pasa directo de Google Drive a cada red y no se almacena.
        </li>
        <li>La aplicación se ejecuta en Vercel. Supabase y Vercel actúan solo como proveedores de infraestructura.</li>
      </ul>

      <h2 id="eliminacion">Eliminación de datos</h2>
      <ul>
        <li>
          Se puede retirar el acceso en cualquier momento desde{" "}
          <a href="https://myaccount.google.com/connections" className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
            la cuenta de Google
          </a>{" "}
          o desde la configuración de integraciones comerciales de Facebook e Instagram. A partir de ese momento Metrix ya no puede leer datos
          nuevos.
        </li>
        <li>Al desconectar una red, sus datos guardados y sus tokens se pueden borrar por completo de la base de datos a petición del dueño.</li>
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
