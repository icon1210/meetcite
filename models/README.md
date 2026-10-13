Put the fine-tuned BART checkpoint here (for example `models/bart-ami/`), then set
`BART_MODEL=/finetuned/bart-ami` in `.env`. The Docker worker mounts this folder read-only at `/finetuned`.
