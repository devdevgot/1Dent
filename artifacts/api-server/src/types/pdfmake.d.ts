declare module "pdfmake" {
  import type { Readable } from "stream";

  interface TFontDictionary {
    [fontName: string]: {
      normal?: string;
      bold?: string;
      italics?: string;
      bolditalics?: string;
    };
  }

  interface TDocumentDefinitions {
    content: unknown[];
    styles?: Record<string, unknown>;
    defaultStyle?: Record<string, unknown>;
    pageSize?: string;
    pageMargins?: number | number[];
    [key: string]: unknown;
  }

  class PdfPrinter {
    constructor(fontDescriptors: TFontDictionary);
    createPdfKitDocument(docDefinition: TDocumentDefinitions, options?: Record<string, unknown>): Readable & { end(): void };
  }

  export = PdfPrinter;
}
