import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Berg Vision" },
      {
        name: "description",
        content:
          "Preferências da organização, integrações e opções do painel Berg Vision.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={Settings}
      title="Configurações"
      description="Em breve: preferências da organização, integrações e opções gerais do painel."
    />
  ),
});
