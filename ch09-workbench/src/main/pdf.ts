// PDF에서 글자를 뽑는다 (Mozilla PDF.js). 화면에 그리지 않으므로 캔버스는 필요 없다
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Node에서는 별도 Worker 대신 같은 스레드에서 처리하도록 Worker 모듈을 직접 불러 둔다.
// 이렇게 하면 Vite가 Worker 코드까지 main.cjs 한 파일에 묶어 준다
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export interface PdfText {
  text: string;
  pages: number;
}

export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  // PDF.js가 버퍼를 넘겨받아 비우므로 복사본을 넘긴다
  const task = getDocument({ data: data.slice() });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '',
          )
          .join(''),
      );
      page.cleanup();
    }
    return { text: pages.join('\n\n').trim(), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}
