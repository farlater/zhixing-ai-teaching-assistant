# Knowledge-file layout

```text
data/knowledge/<course-id>/
├── 00-course.md
├── 01-knowledge-points/<knowledge-point-id>.md
├── 02-materials/<material-id>.md
├── 03-question-bank/<question-id>.md
├── 04-classrooms/<assessment-id>/
│   ├── overview.md
│   ├── report.md
│   └── submissions/<student-id>.md
├── 05-students/<student-id>.md
└── manifest.json
```

Each Markdown file begins with YAML frontmatter containing `type`, `courseId`, and the narrow identifiers relevant to that file. Material files include source URLs, extracted content, figures, and processing notes. Submission files include the original answer, vision text, score, error type, diagnosis, and optional answer image.

`manifest.json` contains only retrieval metadata: `path`, `title`, `kind`, identifiers, knowledge-point IDs, and update time. Do not duplicate full document bodies in the manifest.

Use atomic writes. Runtime knowledge files derive from the local database and uploads, so keep `data/` and `uploads/` out of Git while versioning schemas, prompts, and this skill.
