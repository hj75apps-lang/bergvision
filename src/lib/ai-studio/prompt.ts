export type ImageBrief = {
  brand: string;
  project: string;
  objective: string;
  category: string;
  theme: string;
  audience: string;
  headline: string;
  cta: string;
  product: string;
  style: string;
  palette: string;
  typography: string;
  aspect: string;
};

/** Monta as instruções para a IA a partir do briefing (só usa campos preenchidos). */
export function buildImagePrompt(b: ImageBrief, hasRefs: boolean): string {
  const orient =
    b.aspect === "9:16" || b.aspect === "3:4" ? "vertical" : b.aspect === "1:1" ? "quadrada" : "horizontal";
  const lines: string[] = [
    `Peça publicitária ${orient} (${b.aspect}) para tela de mídia indoor.`,
    `Objetivo: ${b.objective}.`,
  ];
  const add = (label: string, v: string) => {
    if (v.trim()) lines.push(`${label}: ${v.trim()}.`);
  };
  add("Marca", b.brand);
  add("Segmento", b.category);
  add("Produto/serviço", b.product);
  add("Cena", b.theme);
  add("Público-alvo", b.audience);
  add("Estilo visual", b.style);
  add("Paleta de cores", b.palette);
  add("Tipografia", b.typography);
  if (b.headline.trim()) lines.push(`Texto principal exatamente: "${b.headline.trim()}".`);
  if (b.cta.trim()) lines.push(`Chamada para ação exatamente: "${b.cta.trim()}".`);
  if (hasRefs) lines.push("Use as imagens enviadas como referência e preserve a logomarca original sem alterá-la.");
  lines.push("Composição limpa, alto contraste, legível à distância, sem marcas d'água.");
  return lines.join("\n");
}
