# Resume management

CareerScout stores uploaded resumes on the local machine. Resume files and extracted text are not sent to a hosted service.

## Storage

- Default directory: `.local-job-agent/resumes/`
- Optional override: `RESUME_STORAGE_DIR` in the repository `.env` file (absolute path or repository-relative path)
- Per-user subdirectories are created with owner-only permissions (`0700`); files are written with owner-only permissions (`0600`).
- The database stores generated storage keys, a SHA-256 digest, file metadata, extraction status, and the relative key for extracted text. Original filenames are metadata only and are never used as storage paths.
- PDF and DOCX uploads are limited to 10 MiB each.

## API

All endpoints require an authenticated CareerScout session and use same-origin protection.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/resumes` | List the signed-in user's resumes |
| `POST` | `/api/resumes` | Upload one PDF or DOCX as multipart field `resume` |
| `PATCH` | `/api/resumes/:id/primary` | Set the user's primary resume |
| `GET` | `/api/resumes/:id/download` | Download the original file |
| `GET` | `/api/resumes/:id/text` | Read extracted text for review |
| `DELETE` | `/api/resumes/:id` | Delete a resume and its local files |

The first resume is made primary automatically. Deleting the primary resume promotes the most recently uploaded remaining resume.

## Extraction and review

The server extracts selectable PDF text with `pdf-parse` and DOCX text with Mammoth. Extracted text is stored locally and marked `needs_review`; it is not automatically written into education, experience, project, or skill records. A scan-only PDF is retained, but is marked `failed` with an explanatory message because no selectable text was found. The original file remains downloadable.

Profile facts should only be added after the user reviews and approves them. OCR for scanned PDFs and the profile-fact review interface are not part of this backend slice.
