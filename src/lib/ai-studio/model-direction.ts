/** Direção de cena por modo (imagem ou vídeo) para os modelos prontos. */
import type { ImageBrief } from "./prompt";

export type ModelMode = "imagem" | "video";

const IMAGE_DIRECTION: Record<string, string> = {
  "Fotográfico realista": "fotografia publicitária com lente 50-85 mm, profundidade de campo rasa, luz principal suave lateral com preenchimento, texturas reais e nítidas",
  Minimalista: "composição minimalista com muito espaço negativo, poucos elementos, sombras suaves e fundo liso",
  "Vibrante / varejo": "composição dinâmica de varejo, cores saturadas, elementos em diagonal, iluminação forte e brilhante",
  "Luxo / premium": "estética premium, iluminação de recorte (rim light), reflexos sutis, fundo escuro elegante e detalhes dourados",
  "3D moderno": "render 3D moderno, materiais brilhantes, iluminação de estúdio volumétrica, perspectiva levemente elevada",
  Ilustração: "ilustração vetorial limpa, formas simples, contornos suaves e cores chapadas harmoniosas",
};

const VIDEO_FROM_IMAGE_STYLE: Record<string, string> = {
  "Fotográfico realista": "Cinematográfico",
  Minimalista: "Institucional",
  "Vibrante / varejo": "Vibrante / varejo",
  "Luxo / premium": "Câmera lenta elegante",
  "3D moderno": "Animação 3D",
  Ilustração: "Animação 3D",
};

const VIDEO_CAMERA: Record<string, string> = {
  Oferta: "aproximação rápida (push-in) até o produto, finalizando em plano fechado estável",
  "Publicidade de produto": "giro orbital lento ao redor do produto, em câmera lenta",
  Institucional: "travelling lateral suave pelo ambiente, câmera estabilizada",
  Serviço: "plano médio com leve aproximação no profissional em ação",
  "Conteúdo educativo": "câmera quase parada com leve zoom, movimento calmo",
  "Data comemorativa": "descida suave (crane down) com luzes desfocadas em bokeh",
  "Campanha de marca": "dolly-in dramático com luz lateral marcante",
};

/** Direção de arte detalhada para gerar a IMAGEM a partir do modelo. */
export function imageDirection(b: Partial<ImageBrief>): string {
  const style = b.style ?? "";
  return [
    "Direção de arte:",
    `- Cena: ${b.theme ?? ""}.`,
    `- Tratamento visual: ${IMAGE_DIRECTION[style] ?? "visual profissional e limpo"}.`,
    "- Enquadramento: assunto principal em destaque no terço central, área livre para título e chamada.",
    b.palette ? `- Paleta dominante: ${b.palette}, com contraste forte para os textos.` : "",
    "- Quadro estático, sem efeito de movimento ou desfoque de ação.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Valores iniciais do formulário de VÍDEO a partir do modelo. */
export function videoInitial(b: Partial<ImageBrief>) {
  const objective = b.objective ?? "";
  const camera = VIDEO_CAMERA[objective] ?? "movimento de câmera lento e estável";
  const scene = [
    `${b.theme ?? ""}.`,
    b.category ? `Ambiente de ${b.category}.` : "",
    "Início: plano de abertura revelando o ambiente.",
    "Meio: foco no assunto principal com detalhes em close.",
    "Fim: plano estável com espaço livre para sobrepor textos, combinando com o primeiro quadro para repetir em loop.",
    b.palette ? `Cores predominantes: ${b.palette}.` : "",
    b.headline ? `Clima da mensagem: "${b.headline}" (sem escrever texto no vídeo).` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    scene,
    style: VIDEO_FROM_IMAGE_STYLE[b.style ?? ""] ?? "Cinematográfico",
    camera,
    aspect: b.aspect === "9:16" || b.aspect === "3:4" ? "9:16" : "16:9",
  };
}
