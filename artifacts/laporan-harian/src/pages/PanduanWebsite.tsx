import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Tutorial = {
  id: number;
  title: string;
  content: string;
  sortOrder: number;
  screenshotData: string | null;
  screenshotMimeType: string | null;
};

type TutorialDraft = Pick<Tutorial, "title" | "content" | "sortOrder"> & {
  screenshotData?: string | null;
  screenshotMimeType?: string | null;
};

const emptyDraft: TutorialDraft = {
  title: "",
  content: "",
  sortOrder: 0,
  screenshotData: null,
  screenshotMimeType: null,
};

function normalizeTutorialContent(content: string) {
  return content.replace(/\\r\\n|\\n|\\r/g, "\n");
}

function stepsFromContent(content: string) {
  return normalizeTutorialContent(content)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const MAX_SCREENSHOT_BYTES = 700 * 1024;
const INITIAL_SCREENSHOT_DIMENSION = 1200;
const MIN_SCREENSHOT_DIMENSION = 480;

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Gambar tidak dapat dibaca"));
    reader.readAsDataURL(file);
  });
}

async function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gambar tidak dapat diproses"));
    image.src = dataUrl;
  });
}

async function prepareScreenshot(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar");
  }

  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak dapat memproses gambar");

  for (
    let maxDimension = INITIAL_SCREENSHOT_DIMENSION;
    maxDimension >= MIN_SCREENSHOT_DIMENSION;
    maxDimension = Math.floor(maxDimension * 0.8)
  ) {
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.78, 0.68, 0.58, 0.48]) {
      const compressed = canvas.toDataURL("image/jpeg", quality);
      const estimatedBytes = Math.ceil((compressed.length - compressed.indexOf(",") - 1) * 0.75);
      if (estimatedBytes <= MAX_SCREENSHOT_BYTES) {
        return { dataUrl: compressed, mimeType: "image/jpeg" };
      }
    }
  }

  throw new Error("Ukuran gambar masih terlalu besar. Coba crop gambar atau gunakan screenshot yang lebih kecil.");
}

export default function PanduanWebsite() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = String(user?.role ?? "").toLowerCase() === "admin";
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<TutorialDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const tutorialsQuery = useQuery({
    queryKey: ["tutorials"],
    queryFn: () => apiRequest<Tutorial[]>("/api/tutorials"),
  });

  const tutorials = tutorialsQuery.data ?? [];

  const startEdit = (item: Tutorial) => {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      content: normalizeTutorialContent(item.content),
      sortOrder: item.sortOrder,
      screenshotData: item.screenshotData,
      screenshotMimeType: item.screenshotMimeType,
    });
  };

  const save = async () => {
    if (isSaving || isProcessingImage || !draft.title.trim() || !draft.content.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        ...draft,
        content: normalizeTutorialContent(draft.content),
      };
      await apiRequest(editingId === "new" ? "/api/tutorials" : `/api/tutorials/${editingId}`, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEditingId(null);
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: ["tutorials"] });
      toast({ title: "Panduan disimpan" });
    } catch (error) {
      toast({ title: "Gagal menyimpan panduan", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item: Tutorial) => {
    if (!window.confirm(`Hapus panduan "${item.title}"?`)) return;
    await apiRequest(`/api/tutorials/${item.id}`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["tutorials"] });
  };

  return (
    <Layout>
      <div className="page-shell max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">Panduan Website</h1>
            <p className="text-sm text-slate-500">FAQ dan tutorial penggunaan sistem PTAA.</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditingId("new"); setDraft({ ...emptyDraft, sortOrder: (tutorials.length + 1) * 10 }); }}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Panduan
            </Button>
          )}
        </div>

        {editingId && isAdmin && (
          <Card>
            <CardHeader><CardTitle className="text-base">{editingId === "new" ? "Tambah Panduan" : "Edit Panduan"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1"><Label>Judul</Label><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
                <div className="space-y-1"><Label>Urutan</Label><Input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></div>
              </div>
              <div className="space-y-1">
                <Label>Step by step</Label>
                <Textarea rows={6} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold">
                  <ImagePlus className="h-4 w-4" />
                  Upload Screenshot
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isProcessingImage || isSaving}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (!file) return;
                      setIsProcessingImage(true);
                      try {
                        const screenshot = await prepareScreenshot(file);
                        setDraft((current) => ({
                          ...current,
                          screenshotData: screenshot.dataUrl,
                          screenshotMimeType: screenshot.mimeType,
                        }));
                      } catch (error) {
                        toast({
                          title: "Gagal upload foto",
                          description: error instanceof Error ? error.message : "Terjadi kesalahan",
                          variant: "destructive",
                        });
                      } finally {
                        setIsProcessingImage(false);
                      }
                    }}
                  />
                </label>
                {draft.screenshotData && <Button type="button" variant="outline" disabled={isSaving} onClick={() => setDraft({ ...draft, screenshotData: null, screenshotMimeType: null })}>Hapus Gambar</Button>}
                <Button type="button" onClick={save} disabled={isSaving || isProcessingImage || !draft.title.trim() || !draft.content.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Menyimpan..." : isProcessingImage ? "Memproses..." : "Simpan"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Accordion type="single" collapsible className="space-y-3">
          {tutorials.map((item) => (
            <AccordionItem key={item.id} value={String(item.id)} className="rounded-lg border bg-white px-4">
              <AccordionTrigger className="text-left font-bold">{item.title}</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 md:grid-cols-[1fr_260px]">
                  <div className="space-y-2">
                    {stepsFromContent(item.content).map((step, index) => (
                      <div key={`${item.id}-${index}`} className="flex gap-3 rounded-md border bg-slate-50 p-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#06258d] text-xs font-bold text-white">{index + 1}</span>
                        <span>{step.replace(/^\d+[.)]\s*/, "")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-md border border-dashed bg-slate-50 p-3">
                    {item.screenshotData ? (
                      <img src={item.screenshotData} alt={item.title} className="h-40 w-full rounded object-cover" />
                    ) : (
                      <div className="flex h-40 items-center justify-center text-center text-xs font-semibold text-slate-400">Screenshot placeholder</div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(item)}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => remove(item)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Hapus</Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Layout>
  );
}
