import {
  normalizeSourceCategory,
  SOURCE_PRESENTATION,
  type InterfaceVariant,
} from "@/config/argusDesignSystem";

interface Props {
  category?: string | null;
  label?: string | null;
  variant?: InterfaceVariant;
  compact?: boolean;
}

export default function SourceTypeBadge({
  category,
  label,
  variant = "citizen",
  compact = false,
}: Props) {
  const presentation = SOURCE_PRESENTATION[normalizeSourceCategory(category)];
  const displayLabel = label?.trim() || (variant === "operator" ? presentation.operatorLabel : presentation.citizenLabel);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border font-semibold uppercase ${presentation.className} ${
        compact ? "px-1.5 py-0.5 text-[0.55rem]" : "px-2.5 py-1 text-[0.62rem]"
      }`}
    >
      <span className="shrink-0 font-mono text-[0.52rem]" aria-hidden="true">
        {presentation.iconText}
      </span>
      <span className="truncate">{displayLabel}</span>
    </span>
  );
}
