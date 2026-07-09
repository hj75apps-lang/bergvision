import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca · Berg Vision" },
      {
        name: "description",
        content:
          "Sua biblioteca de mídias — imagens, vídeos e assets prontos para publicação.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={Library}
      title="Biblioteca"
      description="Em breve: upload, organização em pastas e busca de todas as mídias da sua rede."
    />
  ),
});
