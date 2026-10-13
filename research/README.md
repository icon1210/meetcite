# Research experiments (spec §18)

These scripts produce the results for the dissertation. They call the **same pipeline code the web app
uses** (`backend/app/pipeline`), so the numbers describe the real system.

## Setup

Use the backend virtual environment with the ML extras, then:

```bash
pip install -r research/requirements.txt
python research/ami.py --split test            # 20 test meetings with audio (~0.7 GB)
python research/ami.py --split train --no-audio
python research/ami.py --split dev --no-audio
```

The split is the standard AMI "scenario-only" partition: 98 training, 20 validation and 20 test meetings.
Results are appended to CSV files in `research/results/`.

## Experiments

| ID | Question | Command | Metrics |
|---|---|---|---|
| — | Fine-tune Summarizer A | `python research/finetune_bart_ami.py` | validation loss |
| E1 | RQ1: Whisper size vs accuracy/speed | `python research/e1_transcription.py --models small medium large-v3` | WER, real-time factor |
| E2 | RQ1: diarization accuracy | `python research/e2_diarization.py` | DER (0.25 s collar), missed / false alarm / confusion |
| E3 | RQ2: BART vs local LLM (vs cloud) | `python research/e3_summarization.py --models bart llm` | ROUGE-1/2/L, BERTScore, time |
| E3b | RQ2: end-to-end (with ASR errors) | `python research/e3_summarization.py --models bart llm --asr` | as E3 |
| E4 | RQ2: factual accuracy | `python research/e4_hallucination_sheet.py`, annotate, then `--score` | % supported / partial / unsupported |
| E5 | NFR1: speed by length | `python research/e5_speed.py --lengths 15 30 60` | seconds per stage |
| SUS | RQ3 / NFR4 | `python research/sus_score.py` | SUS (0–100), Likert means |

### Method notes for the dissertation

* **BART fine-tuning (segment alignment).** AMI transcripts are ~6,000 words but BART reads 1,024 tokens,
  and there is one reference summary per meeting. Each transcript is split into the chunks the app uses at
  inference; each reference sentence is assigned to the chunk with the highest ROUGE-1 recall, giving
  chunk→sentences training pairs (after Summ^N, Zhang et al., 2022). Training therefore matches the
  hierarchical inference used in the app.
* **WER** is computed with jiwer after lower-casing and removing punctuation on both sides.
* **DER** uses pyannote.metrics with a 0.25 s collar and overlapping speech included.
* **ROUGE** uses `rougeLsum` with one sentence per line; **BERTScore** is rescaled with the baseline.
* **E4** hides model identity behind codes (`M1`, `M2`…) so annotation is blind; ideally a second annotator
  labels a subset so you can report agreement (Cohen's kappa).
* **Automatic fact-checker (novel contribution).** MeetMind's verifier labels every generated point as
  supported, partial or unsupported. The E3 outputs keep the notes, so after the manual E4 annotation you can
  measure how well the automatic labels agree with the human ones (accuracy, Cohen's kappa). That answers
  whether automatic verification can be trusted to flag hallucinations, which strengthens RQ2.
* **Cloud LLM** (optional): only with AMI meetings, never participants' recordings (spec §19).

## User study (RQ3)

`user_study/` contains the protocol, consent form, and questionnaire. Record answers in
`research/data/user_study.csv` with columns
`participant,sus1,…,sus10,accuracy,completeness,usefulness` and run `python research/sus_score.py`.
Ethical approval must be granted before recruiting participants.
