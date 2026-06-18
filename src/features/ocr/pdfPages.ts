import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedOcrSource {
  sourceName: string;
  dataUrl: string;
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export async function renderPdfPages(file: File, scale = 1.75): Promise<RenderedOcrSource[]> {
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "");
  const pages: RenderedOcrSource[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`无法渲染 PDF 第 ${pageNumber} 页`);
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push({
      sourceName: `${baseName}-第${pageNumber}页.png`,
      dataUrl: canvas.toDataURL("image/png"),
    });
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

export async function expandOcrFiles(files: File[]): Promise<RenderedOcrSource[]> {
  const sources: RenderedOcrSource[] = [];
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      sources.push(...await renderPdfPages(file));
    } else {
      sources.push({ sourceName: file.name, dataUrl: await fileToDataUrl(file) });
    }
  }
  return sources;
}
