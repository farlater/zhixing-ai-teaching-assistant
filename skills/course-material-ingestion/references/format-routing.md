# Format routing

## Default routes

| Input | Deterministic pass | Visual pass |
| --- | --- | --- |
| PDF | extract text and page count; render bounded page images | use when selectable text is sparse, formulas are lost, or layout/figures carry meaning |
| PPTX | read slide XML in slide order; extract `ppt/media` | describe diagrams, screenshots, formulas, and tables |
| DOCX | extract paragraphs; extract `word/media` | describe embedded teaching figures only |
| Image | preserve original bytes | OCR text/formulas and describe instructional relationships |
| Markdown/text | decode as UTF-8 and preserve headings | none |

Use a hybrid pass for Office files: direct parsing preserves semantic structure, while selective OCR of extracted images recovers text that native parsers miss.

## Active cloud route

- When `MINERU_API_TOKEN` is configured, send PDF, images, DOC/DOCX and PPT/PPTX to the official MinerU Precision Extract API with `model_version=vlm`, OCR, formulas and tables enabled. Preserve the returned `full.md`, content-list/intermediate JSON and images.
- Inspect MinerU content-list output after extraction. Scanned-page text, formulas and structured tables are already handled by MinerU and must not be sent to another vision model. Only extracted `image` / `chart` blocks without semantic `content` may enter the secondary image-description pass.
- Plain text, Markdown, CSV and JSON remain local deterministic reads.

## Local fallback and optional engines

- [MinerU](https://github.com/opendatalab/MinerU) can also run locally, but the current product uses its official cloud API to avoid teacher-PC model requirements.
- [Docling](https://github.com/docling-project/docling) provides a unified document representation, advanced PDF layout understanding, OCR and Markdown/JSON export. Consider it for complex tables or multi-column documents.

Do not silently switch parsers or truncate selected pages/images. Record the chosen parser, provider task ID and any failed item in the material notes.
