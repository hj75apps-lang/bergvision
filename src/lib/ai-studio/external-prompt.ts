/** Prompts detalhados para copiar e usar em outras plataformas (Midjourney, ChatGPT, Gemini, Runway, Sora etc.). */

export function buildExternalImagePrompt(base: string, aspect: string, hasRefs: boolean): string {
  return [
    "Você é um diretor de arte sênior especializado em mídia indoor (telas digitais em lojas, clínicas e recepções).",
    "Crie UMA imagem publicitária final, pronta para exibição, seguindo rigorosamente o briefing abaixo.",
    "",
    "## BRIEFING",
    base.trim(),
    "",
    "## ESPECIFICAÇÕES TÉCNICAS",
    `- Proporção obrigatória: ${aspect}.`,
    "- Resolução alta (mínimo 1920 px no lado maior), nitidez máxima.",
    "- Leitura à distância de 3 a 5 metros: hierarquia clara (título > oferta/informação > chamada > marca).",
    "- Margem de segurança de 5% em todas as bordas; nenhum texto colado nas extremidades.",
    "- Contraste forte entre texto e fundo (WCAG AA ou superior).",
    "",
    "## DIREÇÃO DE ARTE",
    "- Iluminação profissional de estúdio, cores vibrantes e fiéis à paleta informada.",
    "- Composição limpa, com respiro; no máximo 3 blocos de texto.",
    "- Textos em Português (BR), escritos exatamente como no briefing, sem erros de ortografia.",
    hasRefs ? "- Use as imagens de referência anexadas; preserve a logomarca sem distorcer, recolorir ou redesenhar." : "",
    "",
    "## EVITAR",
    "- Marcas d'água, assinaturas, texto ilegível ou inventado, mãos/rostos deformados, poluição visual, bordas cortadas.",
    "",
    `Parâmetros sugeridos (Midjourney): --ar ${aspect} --style raw --v 7`,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n## /g, "\n\n## ");
}

export function buildExternalVideoPrompt(o: {
  base: string;
  aspect: string;
  duration: string;
  resolution: string;
  negative: string;
  hasImage: boolean;
}): string {
  return [
    "Você é um diretor de fotografia especializado em vídeos curtos para mídia indoor (telas digitais em ambientes comerciais).",
    "Gere UM vídeo cinematográfico, contínuo e realista, seguindo o roteiro abaixo.",
    "",
    "## CENA",
    o.base.trim(),
    "",
    "## ESPECIFICAÇÕES TÉCNICAS",
    `- Proporção: ${o.aspect} (${o.aspect === "9:16" ? "vertical" : "horizontal"}).`,
    `- Duração: ${o.duration} segundos, plano único sem cortes bruscos.`,
    `- Resolução: ${o.resolution}, 24-30 fps, movimento suave e estável.`,
    "- Loop agradável: o último quadro deve combinar com o primeiro para repetição contínua na tela.",
    "- Sem áudio obrigatório (a tela costuma ficar sem som).",
    o.hasImage ? "- Use a imagem anexada como quadro inicial e mantenha o produto/marca fiel a ela." : "",
    "",
    "## DIREÇÃO",
    "- Iluminação profissional, profundidade de campo rasa, cores ricas e naturais.",
    "- Foco no produto/assunto principal; deixe espaço livre para sobreposição de textos depois.",
    "",
    "## EVITAR",
    `- ${o.negative.trim() || "texto ilegível, marcas d'água, distorções"}; tremores, deformações, objetos surgindo do nada.`,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n## /g, "\n\n## ");
}
