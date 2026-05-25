import { Client } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function textContent(blocks: any[]): string {
  return blocks.map((b: any) => b.plain_text || "").join("");
}

function paragraph(text: string) {
  return {
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: { rich_text: [{ type: "text" as const, text: { content: text } }] },
  };
}

let rootPageCache: string | null = null;
async function getOrCreateRootPage(): Promise<string> {
  if (rootPageCache) return rootPageCache;
  const search = await notion.search({ query: "PDI App — Plataforma", filter: { property: "object", value: "page" } });
  if (search.results.length > 0) { rootPageCache = search.results[0].id; return rootPageCache; }
  const page = await notion.pages.create({ parent: { type: "workspace", workspace: true } as any, properties: { title: { title: [{ text: { content: "PDI App — Plataforma" } }] } } });
  rootPageCache = page.id;
  return rootPageCache;
}

async function createPDI(body: any) {
  const { pdi } = body;
  const page = await notion.pages.create({
    parent: { type: "page_id", page_id: await getOrCreateRootPage() },
    properties: { title: { title: [{ text: { content: "PDI — " + pdi.nome } }] } },
    children: [
      paragraph("GESTOR: " + pdi.gestorEmail),
      paragraph("COLABORADOR: " + pdi.nome),
      paragraph("CARGO: " + pdi.cargo),
      paragraph("ÁREA: " + pdi.area),
      paragraph("PRAZO: " + (pdi.prazo || "—")),
      paragraph("CRIADO EM: " + pdi.createdAt),
      paragraph("STATUS: Em andamento"),
      paragraph("ID_PDI: " + pdi.id),
      paragraph(""),
      paragraph("COMPETÊNCIAS:"),
      ...pdi.comps.map((c: any) => paragraph("- " + c.name + " | Nível inicial: " + c.nivelAntes + "/5" + (c.obsAntes ? " | Obs: " + c.obsAntes : ""))),
    ],
  });
  return { pageId: page.id };
}

async function listPDIs(gestorEmail: string) {
  const rootId = await getOrCreateRootPage();
  const children = await notion.blocks.children.list({ block_id: rootId });
  const pdis = [];
  for (const block of children.results as any[]) {
    if (block.type !== "child_page") continue;
    if (!block.child_page?.title?.startsWith("PDI —")) continue;
    try {
      const blocks = await notion.blocks.children.list({ block_id: block.id });
      const blockList = blocks.results as any[];
      const fullText = blockList.filter((b: any) => b.type === "paragraph").map((b: any) => textContent(b.paragraph.rich_text)).join("\n");
      if (!fullText.includes("GESTOR: " + gestorEmail)) continue;
      const get = (label: string) => fullText.match(new RegExp(label + ":\\s*(.+)"))?.[1]?.trim() || "";
      const compsRaw = fullText.match(/COMPETÊNCIAS:([\s\S]*?)(?:===|$)/)?.[1] || "";
      const comps = compsRaw.split("\n").filter((l: string) => l.trim().startsWith("-")).map((l: string) => ({
        name: l.match(/- (.+?) \|/)?.[1] || l.replace("- ", "").trim(),
        nivelAntes: parseInt(l.match(/Nível inicial: (\d)/)?.[1] || "1"),
        nivelDepois: l.match(/Depois: (\d)/)?.[1] ? parseInt(l.match(/Depois: (\d)/)?.[1]!) : null,
        obsAntes: l.match(/Obs: (.+)/)?.[1] || "",
        obsDepois: "",
      }));
      pdis.push({ pageId: block.id, nome: get("COLABORADOR"), cargo: get("CARGO"), area: get("ÁREA"), prazo: get("PRAZO"), gestorEmail: get("GESTOR"), status: get("STATUS") || "Em andamento", createdAt: get("CRIADO EM"), comps });
    } catch { continue; }
  }
  return pdis;
}

async function getPDI(pageId: string) {
  const blocks = await notion.blocks.children.list({ block_id: pageId });
  const blockList = blocks.results as any[];
  const fullText = blockList.filter((b: any) => b.type === "paragraph").map((b: any) => textContent(b.paragraph.rich_text)).join("\n");
  const get = (label: string) => fullText.match(new RegExp(label + ":\\s*(.+)"))?.[1]?.trim() || "";
  const compsRaw = fullText.match(/COMPETÊNCIAS:([\s\S]*?)(?:===|$)/)?.[1] || "";
  const comps = compsRaw.split("\n").filter((l: string) => l.trim().startsWith("-")).map((l: string) => ({
    name: l.match(/- (.+?) \|/)?.[1] || l.replace("- ", "").trim(),
    nivelAntes: parseInt(l.match(/Nível inicial: (\d)/)?.[1] || "1"),
    nivelDepois: l.match(/Depois: (\d)/)?.[1] ? parseInt(l.match(/Depois: (\d)/)?.[1]!) : null,
    obsAntes: l.match(/Obs: (.+)/)?.[1] || "", obsDepois: "",
  }));
  return { pageId, nome: get("COLABORADOR"), cargo: get("CARGO"), area: get("ÁREA"), prazo: get("PRAZO"), gestorEmail: get("GESTOR"), status: get("STATUS") || "Em andamento", createdAt: get("CRIADO EM"), comps };
}

async function updatePDI(body: any) {
  const { pageId, comps } = body;
  const updateText = ["", "=== AVALIAÇÃO FINAL ===", "Data: " + new Date().toLocaleDateString("pt-BR"), "STATUS: Concluído", "",
    ...comps.map((c: any) => "- " + c.name + " | Antes: " + c.nivelAntes + "/5 → Depois: " + c.nivelDepois + "/5" + (c.obsDepois ? " | Obs: " + c.obsDepois : ""))];
  await notion.blocks.children.append({ block_id: pageId, children: updateText.map(t => paragraph(t)) });
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const body = await req.json();
  const { action } = body;
  if (action !== "get" && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (action === "create") return NextResponse.json(await createPDI(body));
    if (action === "list") return NextResponse.json(await listPDIs(body.gestorEmail));
    if (action === "get") return NextResponse.json(await getPDI(body.pageId));
    if (action === "update") return NextResponse.json(await updatePDI(body));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
