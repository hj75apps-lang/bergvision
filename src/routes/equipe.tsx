import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe · Berg Vision" },
      {
        name: "description",
        content:
          "Convide membros e defina papéis (owner, admin, editor, viewer) para sua organização.",
      },
    ],
  }),
  component: () => (
    <ComingSoon
      icon={Users}
      title="Equipe"
      description="Em breve: convide membros, defina papéis e gerencie permissões da sua organização."
    />
  ),
});
