import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
  icon: Icon = Sparkles,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Berg Vision
        </p>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
      </header>

      <Card className="relative overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/15 blur-[100px]" />
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-primary/25 to-primary/0 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <Badge className="rounded-full border-none bg-primary/15 text-primary hover:bg-primary/20">
            Em breve
          </Badge>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}