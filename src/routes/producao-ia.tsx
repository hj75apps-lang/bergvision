import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Video,
  Tag,
  Lightbulb,
  Building2,
  Shapes,
  FolderOpen,
  Settings2,
  LayoutGrid,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchProviderStatus,
  fileToDataUrl,
  generateImage,
  saveImageToLibrary,
  type AiProvider,
} from "@/lib/ai-studio/api";
import { buildImagePrompt, type ImageBrief } from "@/lib/ai-studio/prompt";

const TABS = [
  { id: "visao", label: "Visão geral", icon: LayoutGrid },
  { id: "imagem", label: "Criar imagem", icon: ImagePlus },
  { id: "video", label: "Criar vídeo", icon: Video },
  { id: "ofertas", label: "Ofertas e promoções", icon: Tag },
  { id: "dicas", label: "Dicas e conteúdo", icon: Lightbulb },
  { id: "marca", label: "Marca e contatos", icon: Building2 },
  { id: "modelos", label: "Modelos e categorias", icon: Shapes },
  { id: "biblioteca", label: "Biblioteca de criações", icon: FolderOpen },
  { id: "config", label: "Configurações de IA", icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/producao-ia")({
  validateSearch: (s: Record<string, unknown>): { aba?: TabId } => {
    const v = s.aba;
    return TABS.some((t) => t.id === v) ? { aba: v as TabId } : {};
  },
  head: () => ({
    meta: [
      { title: "Produção Visual com IA · Berg Vision" },
      { name: "description", content: "Crie imagens e vídeos publicitários com IA para suas telas." },
      { property: "og:title", content: "Produção Visual com IA · Berg Vision" },
      { property: "og:description", content: "Crie imagens e vídeos publicitários com IA para suas telas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProducaoIaPage,
});

function useProviders() {
  return useQuery({ queryKey: ["ai-providers"], queryFn: fetchProviderStatus, staleTime: 60_000 });
}

function ProducaoIaPage() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate({ from: "/producao-ia" });
  const tab: TabId = aba ?? "visao";
  const setTab = (v: string) => navigate({ search: { aba: v as TabId }, replace: true });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Produção Visual com IA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie peças publicitárias para as suas telas e salve direto na Biblioteca.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max gap-1 rounded-2xl p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm">
                <t.icon className="h-4 w-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="visao" className="mt-4">
          <OverviewTab onGo={setTab} />
        </TabsContent>
        <TabsContent value="imagem" className="mt-4">
          <CreateImageTab />
        </TabsContent>
        <TabsContent value="ofertas" className="mt-4">
          <OffersTab />
        </TabsContent>
        <TabsContent value="dicas" className="mt-4">
          <TipsTab />
        </TabsContent>
        <TabsContent value="marca" className="mt-4">
          <BrandTab />
        </TabsContent>
        <TabsContent value="modelos" className="mt-4">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <ProvidersCard />
        </TabsContent>
        {TABS.filter((t) => !["visao", "imagem", "ofertas", "dicas", "marca", "modelos", "config"].includes(t.id)).map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4">
            <Card className="rounded-2xl border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <t.icon className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">{t.label}</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Esta seção está sendo construída e será liberada nas próximas etapas.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ProvidersCard() {
  const q = useProviders();
  const rows: { key: "openai" | "gemini" | "runway"; label: string; use: string }[] = [
    { key: "openai", label: "OpenAI", use: "Imagens" },
    { key: "gemini", label: "Google Gemini", use: "Imagens" },
    { key: "runway", label: "Runway", use: "Vídeos" },
  ];
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">Integrações de IA</CardTitle>
        <CardDescription>
          As chaves ficam guardadas com segurança no servidor e nunca aparecem no navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
        {q.data &&
          rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.use}</p>
              </div>
              {q.data[r.key] ? (
                <Badge className="gap-1 rounded-full bg-primary/15 text-primary hover:bg-primary/15">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 rounded-full text-muted-foreground">
                  <XCircle className="h-3.5 w-3.5" /> Sem chave
                </Badge>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ onGo }: { onGo: (t: string) => void }) {
  const q = useProviders();
  const none = q.data && !q.data.openai && !q.data.gemini;
  const actions = [
    { id: "imagem", label: "Criar imagem", icon: ImagePlus },
    { id: "video", label: "Criar vídeo", icon: Video },
    { id: "ofertas", label: "Criar oferta", icon: Tag },
    { id: "dicas", label: "Conteúdo educativo", icon: Lightbulb },
  ];
  return (
    <div className="space-y-4">
      {none && (
        <Card className="rounded-2xl border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm">
            Nenhuma chave de IA de imagem está configurada ainda. Veja a aba “Configurações de IA”.
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={() => onGo(a.id)}
            className="flex flex-col items-start gap-3 rounded-2xl border bg-card/60 p-4 text-left transition hover:border-primary/50 hover:bg-card"
          >
            <a.icon className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>
      <ProvidersCard />
    </div>
  );
}

const ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"];
const OBJECTIVES = [
  "Publicidade de produto",
  "Oferta",
  "Institucional",
  "Conteúdo educativo",
  "Data comemorativa",
  "Serviço",
  "Campanha de marca",
];
const STYLES = ["Fotográfico realista", "Minimalista", "Ilustração", "3D moderno", "Luxo / premium", "Vibrante / varejo"];

const emptyBrief: ImageBrief = {
  brand: "",
  project: "",
  objective: OBJECTIVES[0],
  category: "",
  theme: "",
  audience: "",
  headline: "",
  cta: "",
  product: "",
  style: STYLES[0],
  palette: "",
  typography: "",
  aspect: "9:16",
};

type CreateImageProps = {
  initial?: Partial<ImageBrief>;
  extraPrompt?: string;
  extraFields?: ReactNode;
  title?: string;
  validate?: () => string | null;
};

function CreateImageTab({ initial, extraPrompt = "", extraFields, title = "Briefing da imagem", validate }: CreateImageProps = {}) {
  const { membership, user } = useAuth();
  const providers = useProviders();
  const canCreate = membership?.role !== "viewer";
  const [brief, setBrief] = useState<ImageBrief>({ ...emptyBrief, ...initial });
  const kit = useBrandKit(membership?.organization_id);
  const [useContacts, setUseContacts] = useState(false);
  useEffect(() => {
    if (!kit) return;
    setBrief((b) => ({
      ...b,
      brand: b.brand || kit.name,
      palette: b.palette || kit.colors,
      typography: b.typography || kit.typography,
    }));
  }, [kit]);
  const contactsPrompt = useContacts && kit ? brandContactsLine(kit) : "";
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [quality, setQuality] = useState("medium");
  const [refs, setRefs] = useState<{ name: string; url: string }[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ image: string; model: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoPrompt = useMemo(
    () => [buildImagePrompt(brief, refs.length > 0), extraPrompt, contactsPrompt].filter(Boolean).join("\n"),
    [brief, refs.length, extraPrompt, contactsPrompt],
  );
  const finalPrompt = prompt ?? autoPrompt;
  const set = (k: keyof ImageBrief) => (v: string) => setBrief((b) => ({ ...b, [k]: v }));
  const providerReady = providers.data ? providers.data[provider] : true;

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files).slice(0, 4 - refs.length)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} passa de 8 MB.`);
        continue;
      }
      next.push({ name: f.name, url: await fileToDataUrl(f) });
    }
    setRefs(next);
  };

  const run = async () => {
    const v = validate?.();
    if (v) {
      toast.error(v);
      return;
    }
    if (!brief.theme.trim() && !prompt && !extraPrompt) {
      toast.error("Descreva o tema da imagem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await generateImage({
        provider,
        prompt: finalPrompt,
        aspect: brief.aspect,
        quality,
        references: refs.map((x) => x.url),
      });
      setResult({ image: r.image, model: r.model, prompt: finalPrompt });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result || !membership?.organization_id) return;
    setSaving(true);
    try {
      await saveImageToLibrary({
        dataUrl: result.image,
        name: brief.project.trim() || "Criação IA",
        orgId: membership.organization_id,
        userId: user?.id ?? null,
      });
      toast.success("Imagem salva na Biblioteca, pasta “Criações IA”.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.image;
    a.download = `${brief.project.trim() || "criacao-ia"}.png`;
    a.click();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {extraFields}
          <Field label="Marca ou empresa" value={brief.brand} onChange={set("brand")} />
          <Field label="Nome do projeto" value={brief.project} onChange={set("project")} />
          <Pick label="Objetivo da campanha" value={brief.objective} options={OBJECTIVES} onChange={set("objective")} />
          <Field label="Categoria profissional" value={brief.category} onChange={set("category")} placeholder="Ex.: farmácia, academia" />
          <div className="sm:col-span-2">
            <Label className="text-xs">Tema e descrição da imagem *</Label>
            <Textarea className="mt-1" rows={3} value={brief.theme} onChange={(e) => set("theme")(e.target.value)} />
          </div>
          <Field label="Público-alvo" value={brief.audience} onChange={set("audience")} />
          <Field label="Produto ou serviço" value={brief.product} onChange={set("product")} />
          <Field label="Texto principal" value={brief.headline} onChange={set("headline")} />
          <Field label="Chamada para ação" value={brief.cta} onChange={set("cta")} />
          <Pick label="Estilo visual" value={brief.style} options={STYLES} onChange={set("style")} />
          <Field label="Paleta de cores" value={brief.palette} onChange={set("palette")} placeholder="Ex.: azul-marinho e dourado" />
          <Field label="Tipografia" value={brief.typography} onChange={set("typography")} placeholder="Ex.: sem serifa, negrito" />
          <Pick label="Proporção" value={brief.aspect} options={ASPECTS} onChange={set("aspect")} />
          <div>
            <Label className="text-xs">Modelo de IA</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI · GPT Image</SelectItem>
                <SelectItem value="gemini">Google · Gemini Image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Qualidade</Label>
            <Select value={quality} onValueChange={setQuality} disabled={provider !== "openai"}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Rascunho (rápido)</SelectItem>
                <SelectItem value="medium">Padrão</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Logomarca e imagens de referência (até 4)</Label>
            <Input className="mt-1" type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} disabled={refs.length >= 4} />
            {refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {refs.map((r, i) => (
                  <div key={i} className="relative">
                    <img src={r.url} alt={r.name} className="h-16 w-16 rounded-xl border object-cover" />
                    <button
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 shadow"
                      onClick={() => setRefs(refs.filter((_, j) => j !== i))}
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              A IA usa a logomarca como referência, mas não garante reproduzir logos e textos com perfeição. Para a peça final, ajuste no Studio.
            </p>
          </div>
          {kit && brandContactsLine(kit) && (
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input type="checkbox" checked={useContacts} onChange={(e) => setUseContacts(e.target.checked)} />
              Incluir os contatos da marca no rodapé da peça
            </label>
          )}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Instruções enviadas à IA</Label>
              {prompt !== null && (
                <button className="text-xs text-primary" onClick={() => setPrompt(null)}>Voltar ao automático</button>
              )}
            </div>
            <Textarea className="mt-1 font-mono text-xs" rows={5} value={finalPrompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card className="rounded-2xl lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!providerReady && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-xs">
                A chave deste modelo ainda não foi configurada. Escolha outro modelo ou configure a chave.
              </p>
            )}
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-muted/30">
              {busy ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" /> Gerando… pode levar até 1 minuto
                </div>
              ) : result ? (
                <img src={result.image} alt="Imagem gerada" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            {error && <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
            {result && !busy && <p className="text-[11px] text-muted-foreground">Modelo: {result.model}</p>}
            <Button className="w-full rounded-xl" onClick={run} disabled={busy || !canCreate || !providerReady}>
              {result ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {result ? "Gerar novamente" : "Gerar imagem"}
            </Button>
            {!canCreate && <p className="text-xs text-muted-foreground">Seu perfil é somente leitura.</p>}
            {result && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="rounded-xl" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                </Button>
                <Button variant="secondary" className="rounded-xl" onClick={download}>
                  <Download className="h-4 w-4" /> Baixar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input className="mt-1" value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function Pick(props: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const OFFER_TYPES = ["Desconto", "Leve mais, pague menos", "Lançamento", "Liquidação", "Combo", "Frete grátis", "Oferta relâmpago"];

function OffersTab() {
  const [o, setO] = useState({ type: OFFER_TYPES[0], product: "", price: "", oldPrice: "", discount: "", validity: "", conditions: "" });
  const set = (k: keyof typeof o) => (v: string) => setO((x) => ({ ...x, [k]: v }));
  const extraPrompt = useMemo(() => {
    const l = ["Peça publicitária de OFERTA para varejo, com destaque máximo para o preço, legível de longe em tela de mídia indoor."];
    l.push(`Tipo de oferta: ${o.type}.`);
    if (o.product) l.push(`Produto em oferta: ${o.product}.`);
    if (o.price) l.push(`Preço promocional em destaque grande: "${o.price}".`);
    if (o.oldPrice) l.push(`Preço anterior riscado, menor: "${o.oldPrice}".`);
    if (o.discount) l.push(`Selo de desconto: "${o.discount}".`);
    if (o.validity) l.push(`Validade em texto pequeno: "${o.validity}".`);
    if (o.conditions) l.push(`Condições em texto pequeno: "${o.conditions}".`);
    return l.join("\n");
  }, [o]);
  return (
    <CreateImageTab
      title="Briefing da oferta"
      initial={{ objective: "Oferta", style: "Vibrante / varejo" }}
      extraPrompt={extraPrompt}
      validate={() => (!o.product.trim() ? "Informe o produto em oferta." : null)}
      extraFields={
        <>
          <Pick label="Tipo de oferta" value={o.type} options={OFFER_TYPES} onChange={set("type")} />
          <Field label="Produto em oferta *" value={o.product} onChange={set("product")} />
          <Field label="Preço promocional" value={o.price} onChange={set("price")} placeholder="Ex.: R$ 9,90" />
          <Field label="Preço anterior" value={o.oldPrice} onChange={set("oldPrice")} placeholder="Ex.: R$ 14,90" />
          <Field label="Selo de desconto" value={o.discount} onChange={set("discount")} placeholder="Ex.: -30%" />
          <Field label="Validade" value={o.validity} onChange={set("validity")} placeholder="Ex.: até 31/10" />
          <div className="sm:col-span-2">
            <Field label="Condições" value={o.conditions} onChange={set("conditions")} placeholder="Ex.: enquanto durarem os estoques" />
          </div>
          <div className="border-t sm:col-span-2" />
        </>
      }
    />
  );
}

const TIP_FORMATS = ["Dica rápida", "Passo a passo", "Você sabia?", "Curiosidade", "Lista de cuidados", "Data comemorativa", "Aviso ao público"];

function TipsTab() {
  const [t, setT] = useState({ format: TIP_FORMATS[0], subject: "", title: "", points: "", source: "" });
  const set = (k: keyof typeof t) => (v: string) => setT((x) => ({ ...x, [k]: v }));
  const extraPrompt = useMemo(() => {
    const l = ["Peça de CONTEÚDO EDUCATIVO para mídia indoor: visual limpo, informativo, poucos textos, grandes e legíveis de longe. Sem aparência de anúncio de preço."];
    l.push(`Formato: ${t.format}.`);
    if (t.subject) l.push(`Assunto: ${t.subject}.`);
    if (t.title) l.push(`Título em destaque: "${t.title}".`);
    const pts = t.points.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5);
    if (pts.length) l.push(`Tópicos curtos, com ícones simples, nesta ordem: ${pts.map((x, i) => `${i + 1}) "${x}"`).join("; ")}.`);
    if (t.source) l.push(`Rodapé discreto: "${t.source}".`);
    return l.join("\n");
  }, [t]);
  return (
    <CreateImageTab
      title="Briefing do conteúdo"
      initial={{ objective: "Conteúdo educativo", style: "Minimalista" }}
      extraPrompt={extraPrompt}
      validate={() => (!t.subject.trim() ? "Informe o assunto da dica." : null)}
      extraFields={
        <>
          <Pick label="Formato" value={t.format} options={TIP_FORMATS} onChange={set("format")} />
          <Field label="Assunto *" value={t.subject} onChange={set("subject")} placeholder="Ex.: hidratação no calor" />
          <div className="sm:col-span-2">
            <Field label="Título" value={t.title} onChange={set("title")} placeholder="Ex.: Beba água a cada hora" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Tópicos (um por linha, até 5)</Label>
            <Textarea className="mt-1" rows={3} value={t.points} onChange={(e) => set("points")(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Fonte ou rodapé" value={t.source} onChange={set("source")} placeholder="Ex.: Fonte: Ministério da Saúde" />
          </div>
          <div className="border-t sm:col-span-2" />
        </>
      }
    />
  );
}

type BrandKit = {
  name: string; slogan: string; colors: string; typography: string;
  phone: string; whatsapp: string; instagram: string; site: string; address: string;
};
const emptyKit: BrandKit = { name: "", slogan: "", colors: "", typography: "", phone: "", whatsapp: "", instagram: "", site: "", address: "" };
const kitKey = (org: string) => `bv:brand-kit:${org}`;
const KIT_EVENT = "bv:brand-kit-changed";

function readKit(org?: string): BrandKit | null {
  if (!org || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(kitKey(org));
    return raw ? { ...emptyKit, ...(JSON.parse(raw) as Partial<BrandKit>) } : null;
  } catch {
    return null;
  }
}

function useBrandKit(org?: string): BrandKit | null {
  const [kit, setKit] = useState<BrandKit | null>(null);
  useEffect(() => {
    setKit(readKit(org));
    const on = () => setKit(readKit(org));
    window.addEventListener(KIT_EVENT, on);
    return () => window.removeEventListener(KIT_EVENT, on);
  }, [org]);
  return kit;
}

function brandContactsLine(k: BrandKit): string {
  const parts = [
    k.whatsapp && `WhatsApp ${k.whatsapp}`,
    k.phone && `Tel. ${k.phone}`,
    k.instagram && `Instagram ${k.instagram}`,
    k.site && k.site,
    k.address && k.address,
  ].filter(Boolean);
  const l: string[] = [];
  if (k.slogan) l.push(`Slogan da marca, discreto: "${k.slogan}".`);
  if (parts.length) l.push(`Rodapé com contatos, legível: "${parts.join(" · ")}".`);
  return l.join("\n");
}

function BrandTab() {
  const { membership } = useAuth();
  const org = membership?.organization_id;
  const canEdit = membership?.role !== "viewer";
  const [k, setK] = useState<BrandKit>(emptyKit);
  useEffect(() => {
    setK(readKit(org) ?? emptyKit);
  }, [org]);
  const set = (f: keyof BrandKit) => (v: string) => setK((x) => ({ ...x, [f]: v }));
  const save = () => {
    if (!org) return;
    window.localStorage.setItem(kitKey(org), JSON.stringify(k));
    window.dispatchEvent(new Event(KIT_EVENT));
    toast.success("Dados da marca salvos.");
  };
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">Marca e contatos</CardTitle>
        <CardDescription>
          Preencha uma vez: o nome, as cores e a tipografia entram sozinhos nos briefings, e os contatos podem ir no rodapé das peças. Ficam salvos neste navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da marca" value={k.name} onChange={set("name")} />
        <Field label="Slogan" value={k.slogan} onChange={set("slogan")} />
        <Field label="Cores da marca" value={k.colors} onChange={set("colors")} placeholder="Ex.: vermelho e branco" />
        <Field label="Tipografia" value={k.typography} onChange={set("typography")} placeholder="Ex.: sem serifa, negrito" />
        <Field label="WhatsApp" value={k.whatsapp} onChange={set("whatsapp")} placeholder="(66) 99999-9999" />
        <Field label="Telefone" value={k.phone} onChange={set("phone")} />
        <Field label="Instagram" value={k.instagram} onChange={set("instagram")} placeholder="@suamarca" />
        <Field label="Site" value={k.site} onChange={set("site")} />
        <div className="sm:col-span-2">
          <Field label="Endereço" value={k.address} onChange={set("address")} />
        </div>
        <div className="sm:col-span-2">
          <Button className="rounded-xl" onClick={save} disabled={!canEdit || !org}>
            <Save className="h-4 w-4" /> Salvar dados da marca
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ModelPreset = { id: string; category: string; name: string; brief: Partial<ImageBrief> };
const MODEL_PRESETS: ModelPreset[] = [
  { id: "farm-oferta", category: "Farmácia", name: "Oferta de vitaminas", brief: { objective: "Oferta", category: "farmácia", theme: "Frascos de vitaminas sobre bancada clara, folhas verdes, sensação de saúde e bem-estar", style: "Fotográfico realista", palette: "verde e branco", aspect: "9:16" } },
  { id: "farm-dica", category: "Farmácia", name: "Dica de saúde", brief: { objective: "Conteúdo educativo", category: "farmácia", theme: "Copo de água e ícones de saúde, ambiente leve e limpo", style: "Minimalista", palette: "azul claro e branco", aspect: "16:9" } },
  { id: "acad-matricula", category: "Academia", name: "Matrícula promocional", brief: { objective: "Oferta", category: "academia", theme: "Pessoa treinando com energia em academia moderna, iluminação dramática", style: "Vibrante / varejo", palette: "preto e amarelo", headline: "Matrícula grátis", aspect: "9:16" } },
  { id: "acad-motiv", category: "Academia", name: "Frase motivacional", brief: { objective: "Campanha de marca", category: "academia", theme: "Halteres em close com fundo escuro e luz lateral", style: "3D moderno", palette: "preto e laranja", aspect: "16:9" } },
  { id: "rest-prato", category: "Restaurante", name: "Prato do dia", brief: { objective: "Publicidade de produto", category: "restaurante", theme: "Prato executivo apetitoso visto de cima, mesa de madeira, luz natural", style: "Fotográfico realista", palette: "tons quentes", headline: "Prato do dia", aspect: "16:9" } },
  { id: "rest-combo", category: "Restaurante", name: "Combo lanche", brief: { objective: "Oferta", category: "lanchonete", theme: "Hambúrguer, batata e refrigerante em composição dinâmica com respingos", style: "Vibrante / varejo", palette: "vermelho e amarelo", aspect: "9:16" } },
  { id: "merc-hort", category: "Supermercado", name: "Feira de hortifrúti", brief: { objective: "Oferta", category: "supermercado", theme: "Frutas e verduras frescas em caixotes, gotas de água", style: "Fotográfico realista", palette: "verde e laranja", headline: "Quarta do hortifrúti", aspect: "16:9" } },
  { id: "merc-acougue", category: "Supermercado", name: "Açougue", brief: { objective: "Oferta", category: "supermercado", theme: "Cortes de carne nobre em tábua com ervas e sal grosso", style: "Luxo / premium", palette: "vermelho escuro e preto", aspect: "9:16" } },
  { id: "clin-inst", category: "Clínica", name: "Institucional da clínica", brief: { objective: "Institucional", category: "clínica", theme: "Recepção de clínica moderna, profissional sorridente, ambiente acolhedor", style: "Fotográfico realista", palette: "azul e branco", aspect: "16:9" } },
  { id: "data-natal", category: "Datas comemorativas", name: "Natal", brief: { objective: "Data comemorativa", theme: "Decoração de Natal elegante com luzes desfocadas e presentes", style: "Luxo / premium", palette: "vermelho, verde e dourado", headline: "Feliz Natal", aspect: "16:9" } },
  { id: "data-maes", category: "Datas comemorativas", name: "Dia das Mães", brief: { objective: "Data comemorativa", theme: "Flores delicadas e presente com laço, luz suave", style: "Minimalista", palette: "rosa e branco", headline: "Feliz Dia das Mães", aspect: "9:16" } },
  { id: "serv-agend", category: "Serviços", name: "Agende seu horário", brief: { objective: "Serviço", category: "salão de beleza", theme: "Salão de beleza moderno, cadeira e espelho iluminado", style: "Luxo / premium", palette: "preto e dourado", cta: "Agende pelo WhatsApp", aspect: "9:16" } },
  { id: "fisio-inst", category: "Fisioterapia", name: "Reabilitação e movimento", brief: { objective: "Institucional", category: "fisioterapia", theme: "Fisioterapeuta auxiliando paciente em exercício de reabilitação, clínica clara e moderna", style: "Fotográfico realista", palette: "verde-água e branco", aspect: "16:9" } },
  { id: "fisio-dica", category: "Fisioterapia", name: "Dica de postura", brief: { objective: "Conteúdo educativo", category: "fisioterapia", theme: "Ilustração de coluna alinhada e pessoa com boa postura ao computador", style: "Ilustração", palette: "azul e verde claro", headline: "Cuide da sua postura", aspect: "9:16" } },
  { id: "nutri-inst", category: "Nutrição", name: "Alimentação equilibrada", brief: { objective: "Institucional", category: "nutrição", theme: "Prato colorido e saudável com legumes, grãos e frutas, luz natural", style: "Fotográfico realista", palette: "verde e laranja", aspect: "16:9" } },
  { id: "nutri-dica", category: "Nutrição", name: "Dica de hidratação", brief: { objective: "Conteúdo educativo", category: "nutrição", theme: "Garrafa de água com rodelas de limão e hortelã, fundo limpo", style: "Minimalista", palette: "azul claro e verde", headline: "Beba mais água", aspect: "9:16" } },
  { id: "psico-inst", category: "Psicologia", name: "Saúde mental", brief: { objective: "Institucional", category: "psicologia", theme: "Consultório acolhedor com poltronas, plantas e luz suave", style: "Minimalista", palette: "lilás e bege", headline: "Cuide da sua mente", aspect: "16:9" } },
  { id: "psico-campanha", category: "Psicologia", name: "Setembro Amarelo", brief: { objective: "Data comemorativa", category: "psicologia", theme: "Laço amarelo e mãos unidas, mensagem de acolhimento", style: "Minimalista", palette: "amarelo e branco", headline: "Falar é a melhor solução", aspect: "9:16" } },
  { id: "cardio-inst", category: "Cardiologia", name: "Coração saudável", brief: { objective: "Institucional", category: "cardiologia", theme: "Coração estilizado com linha de eletrocardiograma, ambiente médico limpo", style: "3D moderno", palette: "vermelho e branco", aspect: "16:9" } },
  { id: "cardio-checkup", category: "Cardiologia", name: "Check-up cardiológico", brief: { objective: "Serviço", category: "cardiologia", theme: "Médico cardiologista com estetoscópio e paciente sorridente", style: "Fotográfico realista", palette: "azul e vermelho", cta: "Agende seu check-up", aspect: "9:16" } },
  { id: "derma-inst", category: "Dermatologia", name: "Cuidados com a pele", brief: { objective: "Institucional", category: "dermatologia", theme: "Pele saudável em close com luz suave, produtos dermatológicos ao lado", style: "Luxo / premium", palette: "nude e branco", aspect: "16:9" } },
  { id: "derma-protetor", category: "Dermatologia", name: "Use protetor solar", brief: { objective: "Conteúdo educativo", category: "dermatologia", theme: "Frasco de protetor solar sob sol forte, praia ao fundo desfocada", style: "Vibrante / varejo", palette: "amarelo e azul", headline: "Use protetor solar todos os dias", aspect: "9:16" } },
  { id: "estet-proc", category: "Estética", name: "Procedimento facial", brief: { objective: "Serviço", category: "estética", theme: "Cliente relaxada recebendo tratamento facial em spa elegante", style: "Luxo / premium", palette: "rosé e dourado", cta: "Agende sua avaliação", aspect: "9:16" } },
  { id: "estet-promo", category: "Estética", name: "Pacote promocional", brief: { objective: "Oferta", category: "estética", theme: "Toalhas, velas e produtos de beleza em composição sofisticada", style: "Luxo / premium", palette: "nude e dourado", aspect: "16:9" } },
  { id: "oftal-inst", category: "Oftalmologia", name: "Exame de vista", brief: { objective: "Serviço", category: "oftalmologia", theme: "Olho em close com reflexo de tabela de letras, consultório moderno", style: "Fotográfico realista", palette: "azul e branco", cta: "Agende seu exame", aspect: "16:9" } },
  { id: "oftal-oculos", category: "Oftalmologia", name: "Óculos e lentes", brief: { objective: "Publicidade de produto", category: "ótica", theme: "Armações de óculos modernas expostas sobre superfície clara", style: "Minimalista", palette: "preto e branco", aspect: "9:16" } },
  { id: "neuro-inst", category: "Neurologia", name: "Cuidado neurológico", brief: { objective: "Institucional", category: "neurologia", theme: "Cérebro estilizado com conexões luminosas, ambiente médico", style: "3D moderno", palette: "azul escuro e ciano", aspect: "16:9" } },
  { id: "neuro-dica", category: "Neurologia", name: "Sono de qualidade", brief: { objective: "Conteúdo educativo", category: "neurologia", theme: "Quarto tranquilo à noite com lua e cama arrumada", style: "Ilustração", palette: "azul-marinho e lilás", headline: "Durma bem, viva melhor", aspect: "9:16" } },
  { id: "mec-revisao", category: "Mecânica", name: "Revisão completa", brief: { objective: "Serviço", category: "oficina mecânica", theme: "Mecânico trabalhando em motor de carro em oficina organizada", style: "Fotográfico realista", palette: "preto e laranja", cta: "Agende sua revisão", aspect: "16:9" } },
  { id: "mec-oleo", category: "Mecânica", name: "Troca de óleo", brief: { objective: "Oferta", category: "oficina mecânica", theme: "Óleo dourado sendo despejado em motor, ferramentas ao lado", style: "Vibrante / varejo", palette: "amarelo e preto", headline: "Troca de óleo com desconto", aspect: "9:16" } },
  { id: "acoug-churrasco", category: "Açougue", name: "Kit churrasco", brief: { objective: "Oferta", category: "açougue", theme: "Picanha, linguiça e costela em grelha com brasa e fumaça", style: "Fotográfico realista", palette: "vermelho e preto", headline: "Kit churrasco", aspect: "16:9" } },
  { id: "acoug-cortes", category: "Açougue", name: "Cortes especiais", brief: { objective: "Publicidade de produto", category: "açougue", theme: "Cortes nobres de carne em balcão refrigerado iluminado", style: "Luxo / premium", palette: "vinho e preto", aspect: "9:16" } },
  { id: "const-oferta", category: "Materiais para Construção", name: "Oferta de materiais", brief: { objective: "Oferta", category: "materiais para construção", theme: "Sacos de cimento, tijolos e ferramentas em composição dinâmica", style: "Vibrante / varejo", palette: "amarelo e cinza", aspect: "16:9" } },
  { id: "const-reforma", category: "Materiais para Construção", name: "Hora de reformar", brief: { objective: "Campanha de marca", category: "materiais para construção", theme: "Ambiente sendo reformado com tintas, rolos e pisos novos", style: "Fotográfico realista", palette: "laranja e azul", headline: "Sua reforma começa aqui", aspect: "9:16" } },
  { id: "pet-banho", category: "Pet shop", name: "Banho e tosa", brief: { objective: "Serviço", category: "pet shop", theme: "Cachorro feliz com espuma durante o banho, ambiente colorido", style: "Vibrante / varejo", palette: "azul e amarelo", cta: "Agende pelo WhatsApp", aspect: "9:16" } },
  { id: "odonto-inst", category: "Odontologia", name: "Sorriso saudável", brief: { objective: "Institucional", category: "odontologia", theme: "Sorriso branco em close, consultório odontológico moderno", style: "Fotográfico realista", palette: "azul claro e branco", aspect: "16:9" } },
  { id: "padaria-cafe", category: "Padaria", name: "Café da manhã", brief: { objective: "Publicidade de produto", category: "padaria", theme: "Pães quentinhos, café e croissants em mesa rústica, luz da manhã", style: "Fotográfico realista", palette: "tons quentes", aspect: "16:9" } },
];

function ModelsTab() {
  const cats = useMemo(() => ["Todas", ...Array.from(new Set(MODEL_PRESETS.map((m) => m.category)))], []);
  const [cat, setCat] = useState("Todas");
  const [sel, setSel] = useState<ModelPreset | null>(null);
  if (sel) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setSel(null)}>
            ← Voltar aos modelos
          </Button>
          <Badge variant="outline" className="rounded-full">{sel.category} · {sel.name}</Badge>
        </div>
        <CreateImageTab key={sel.id} title={`Modelo: ${sel.name}`} initial={{ ...sel.brief, project: sel.name }} />
      </div>
    );
  }
  const list = cat === "Todas" ? MODEL_PRESETS : MODEL_PRESETS.filter((m) => m.category === cat);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <Button key={c} size="sm" variant={c === cat ? "default" : "secondary"} className="rounded-full" onClick={() => setCat(c)}>
            {c}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <button
            key={m.id}
            onClick={() => setSel(m)}
            className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-4 text-left transition hover:border-primary/50 hover:bg-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              <Badge variant="outline" className="rounded-full text-[10px]">{m.brief.aspect}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">{m.category} · {m.brief.objective}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{m.brief.theme}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
