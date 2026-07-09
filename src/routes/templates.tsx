import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates · Berg Vision" },
      {
        name: "description",
        content:
          "Templates de layout com zonas configuráveis para as suas telas indoor.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={LayoutTemplate}
      title="Templates"
      description="Em breve: catálogo de templates com zonas de mídia, playlist e widgets prontos para uso."
    />
  ),
});
