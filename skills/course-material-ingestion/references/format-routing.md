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

## Optional enhancement engines

- [MinerU](https://github.com/opendatalab/MinerU) converts PDF, images and Office files to Markdown/JSON, including formulas, tables, reading order and OCR. Consider it when the teacher PC can afford its larger installation.
- [Docling](https://github.com/docling-project/docling) provides a unified document representation, advanced PDF layout understanding, OCR and Markdown/JSON export. Consider it for complex tables or multi-column documents.

Do not silently switch to an optional engine. Record the chosen parser and any page/image cap in the material notes.
