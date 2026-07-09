import { createFileRoute } from "@tanstack/react-router";
import { ListMusic } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists · Berg Vision" },
      {
        name: "description",
        content:
          "Monte playlists dinâmicas para as suas telas com transições e duração personalizadas.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={ListMusic}
      title="Playlists"
      description="Em breve: monte sequências de mídias com transições, duração e agendamento por player."
    />
  ),
});
