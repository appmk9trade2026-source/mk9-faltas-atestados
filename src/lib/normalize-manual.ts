export const normalizeManualText = (value: string | null | undefined): string => {
  return (value || "").trim();
};
