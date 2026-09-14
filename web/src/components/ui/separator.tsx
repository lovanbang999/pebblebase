import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "cn"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  const hasCustomHeight = typeof className === "string" && className.includes("h-");

  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px",
        !hasCustomHeight && "data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
