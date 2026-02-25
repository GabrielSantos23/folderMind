import { cn } from "@/lib/utils";
import { AnimatedShinyText as AnimatedShinyTextUI } from "./ui/animated-shiny-text";

export function AnimatedShinyText({
  onOpenPanel,
}: {
  onOpenPanel?: () => void;
}) {
  return (
    <button
      onClick={onOpenPanel}
      className="ml-2 text-xs text-primary hover:underline cursor-pointer"
    >
      <AnimatedShinyTextUI>
        <span> Review in panel →</span>
      </AnimatedShinyTextUI>
    </button>
  );
}
