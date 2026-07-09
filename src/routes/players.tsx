import { createFileRoute } from "@tanstack/react-router";
import { MonitorPlay } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Players · Berg Vision" },
      {
        name: "description",
        content:
          "Gerencie os players da sua rede Berg Vision: pareamento, status e agendamento.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={MonitorPlay}
      title="Players"
      description="Em breve você vai parear, monitorar e agendar conteúdo para toda a sua rede de players a partir daqui."
    />
  ),
});