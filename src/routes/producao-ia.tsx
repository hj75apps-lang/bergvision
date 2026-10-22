import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
        <TabsContent value="config" className="mt-4">
          <ProvidersCard />
        </TabsContent>
        {TABS.filter((t) => !["visao", "imagem", "config"].includes(t.id)).map((t) => (
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

function CreateImageTab() {
  const { membership, user } = useAuth();
  const providers = useProviders();
  const canCreate = membership?.role !== "viewer";
  const [brief, setBrief] = useState<ImageBrief>(emptyBrief);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [quality, setQuality] = useState("medium");
  const [refs, setRefs] = useState<{ name: string; url: string }[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ image: string; model: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoPrompt = useMemo(() => buildImagePrompt(brief, refs.length > 0), [brief, refs.length]);
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
    if (!brief.theme.trim() && !prompt) {
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
          <CardTitle className="text-base">Briefing da imagem</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
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
