import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-page";

export const metadata: Metadata = {
  title: "Acerca de · Metrix",
  description: "Dashboard personal de métricas de YouTube, Instagram, Facebook y TikTok.",
};

export default function AboutPage() {
  return (
    <PublicPage title="Acerca de Metrix">
      <p>
        Metrix es un dashboard <strong className="text-foreground">personal y de un solo usuario</strong> para seguir las métricas de las cuentas
        propias del creador en YouTube, Instagram, Facebook y TikTok.
      </p>
      <h2>Qué hace</h2>
      <ul>
        <li>Lee métricas de las cuentas del propio usuario mediante las APIs oficiales de cada red.</li>
        <li>Guarda una foto diaria de esas métricas para ver su evolución, comparar periodos y armar reportes.</li>
        <li>Muestra gráficas de vistas, seguidores, retención de audiencia, publicaciones y audiencia.</li>
        <li>
          Publica, en la fecha y hora que el propio usuario programa, los videos que él mismo elige de su Google Drive, en sus cuentas de
          Instagram, Facebook, YouTube y TikTok.
        </li>
      </ul>
      <h2>Qué no hace</h2>
      <ul>
        <li>No publica nada que el usuario no haya programado, ni edita o borra contenido existente.</li>
        <li>No ve otros archivos de Google Drive: solo los videos que el usuario elige con el selector de Google.</li>
        <li>No usa scraping ni servicios no oficiales.</li>
        <li>No ofrece cuentas a otras personas: el acceso está limitado a su dueño.</li>
      </ul>
      <p>
        Consulta la <a href="/privacidad" className="text-foreground underline underline-offset-4">política de privacidad</a> para saber qué datos
        se leen, cómo se guardan y cómo eliminarlos.
      </p>
    </PublicPage>
  );
}
