import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plataforma PDI — FYI Korn Ferry",
  description: "Planos de Desenvolvimento Individual baseados no FYI Korn Ferry",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={ptBR}>
      <html lang="pt-BR">
        <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb" }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
