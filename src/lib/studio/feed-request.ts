/** Monta o corpo enviado à função widget-rss (RSS/Atom ou API JSON). */
export function feedRequestBody(
  config: Record<string, unknown>,
  url: string,
  max: number,
): Record<string, unknown> {
  const s = (k: string) => {
    const v = config[k];
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    url,
    max,
    json_items_path: s("jsonItemsPath"),
    json_title_template: s("jsonTitleTemplate"),
    json_image_field: s("jsonImageField"),
    json_date_field: s("jsonDateField"),
  };
}

export function feedKey(config: Record<string, unknown>): string {
  return ["jsonItemsPath", "jsonTitleTemplate", "jsonImageField", "jsonDateField"]
    .map((k) => (typeof config[k] === "string" ? (config[k] as string) : ""))
    .join("|");
}
