"""Fine-tune BART on the AMI corpus (Summarizer A, objective 5).

AMI transcripts (~6,000 words) are far longer than BART's 1,024-token input, and
each meeting has only one reference summary. Following the segment-level
alignment idea of Summ^N (Zhang et al., 2022), each transcript is split into the
same chunks the app uses at inference time, and every reference summary sentence
is assigned to the chunk it overlaps with most (by ROUGE-1 recall). Each chunk is
then a training pair: chunk text -> its aligned summary sentences.

This keeps training consistent with the app's hierarchical (map-reduce) inference.

Usage:
  python research/ami.py --split train --no-audio
  python research/ami.py --split dev --no-audio
  python research/finetune_bart_ami.py --output models/bart-ami
Runs on the RTX 2060 with fp16 and gradient accumulation; Google Colab also works.
"""

from common import ROOT  # first: puts the backend on the import path

# isort: split
import argparse
import re

from ami import load
from app.pipeline.chunking import chunk_lines, clean_text
from app.pipeline.summarize_bart import BART_INPUT_TOKENS
from app.pipeline.types import TranscriptLine
from rouge_score import rouge_scorer

_SENT = re.compile(r"(?<=[.!?])\s+")
SCORER = rouge_scorer.RougeScorer(["rouge1"], use_stemmer=True)


def meeting_lines(m: dict) -> list[TranscriptLine]:
    return [
        TranscriptLine(i, f"Speaker {t['speaker']}", t["start"], t["end"], t["text"]) for i, t in enumerate(m["turns"])
    ]


def chunk_text(chunk: list[TranscriptLine]) -> str:
    # Same input format as summarize_bart._chunk_text, so training matches inference.
    return "\n".join(f"{line.speaker}: {clean_text(line.text)}" for line in chunk)


def aligned_pairs(m: dict) -> list[dict[str, str]]:
    chunks = [chunk_text(c) for c in chunk_lines(meeting_lines(m), max_tokens=BART_INPUT_TOKENS, overlap_lines=1)]
    targets: list[list[str]] = [[] for _ in chunks]
    for sentence in _SENT.split(m["abstract"]):
        if len(sentence.split()) < 3:
            continue
        scores = [SCORER.score(c, sentence)["rouge1"].recall for c in chunks]
        targets[max(range(len(chunks)), key=scores.__getitem__)].append(sentence)
    return [{"source": c, "target": " ".join(t)} for c, t in zip(chunks, targets, strict=True) if t]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="facebook/bart-large-cnn")
    parser.add_argument("--output", default=str(ROOT.parent / "models" / "bart-ami"))
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--lr", type=float, default=3e-5)
    parser.add_argument("--batch", type=int, default=1)
    parser.add_argument("--accumulate", type=int, default=8)
    args = parser.parse_args()

    from datasets import Dataset
    from transformers import (
        AutoModelForSeq2SeqLM,
        AutoTokenizer,
        DataCollatorForSeq2Seq,
        Seq2SeqTrainer,
        Seq2SeqTrainingArguments,
    )

    train = [p for m in load("train") for p in aligned_pairs(m)]
    dev = [p for m in load("dev") for p in aligned_pairs(m)]
    print(f"{len(train)} training pairs, {len(dev)} validation pairs")

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.base)

    def tokenize(batch: dict) -> dict:
        enc = tokenizer(batch["source"], max_length=1024, truncation=True)
        enc["labels"] = tokenizer(text_target=batch["target"], max_length=256, truncation=True)["input_ids"]
        return enc

    train_ds = Dataset.from_list(train).map(tokenize, batched=True, remove_columns=["source", "target"])
    dev_ds = Dataset.from_list(dev).map(tokenize, batched=True, remove_columns=["source", "target"])

    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output + "-checkpoints",
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=args.accumulate,
        gradient_checkpointing=True,  # needed to fit bart-large in 6 GB
        fp16=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        warmup_ratio=0.05,
        weight_decay=0.01,
        logging_steps=20,
        report_to="none",
        seed=42,
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=dev_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, model=model),
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved fine-tuned model to {args.output}. Set BART_MODEL to this path to use it in the app.")


if __name__ == "__main__":
    main()
