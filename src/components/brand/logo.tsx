import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const LIGHT_SRC = "/assets/logo-light.png";
const DARK_SRC = "/assets/logo-dark.png";

export function Logo({
  className,
  alt = "Berg Vision",
}: {
  className?: string;
  alt?: string;
}) {
  const { theme } = useTheme();
  const src = theme === "dark" ? DARK_SRC : LIGHT_SRC;
  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-auto w-auto object-contain select-none", className)}
      draggable={false}
    />
  );
}