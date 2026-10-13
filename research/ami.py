"""AMI Meeting Corpus: download and prepare references for the experiments.

Downloads (from the official AMI mirror at the University of Edinburgh):
  * the manual annotations (word-level transcripts and abstractive summaries), ~22 MB
  * headset-mix audio for the chosen meetings, ~30-70 MB each

Produces in research/data/ami/:
  * <meeting>.json  - reference transcript (speaker turns with times) and abstractive summary
  * <meeting>.rttm  - reference speaker turns for DER
  * <meeting>.wav   - audio

Usage:
  python research/ami.py --split test          # the 20 test-set meetings (with audio)
  python research/ami.py --split train --no-audio   # training references for BART fine-tuning

Licence: AMI is released under CC BY 4.0 - cite Carletta et al. (2005).
"""

import argparse
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from common import DATA

AMI_DIR = DATA / "ami"
ANNOTATIONS_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip"
AUDIO_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/{m}/audio/{m}.Mix-Headset.wav"

# The commonly used "scenario-only" partition of AMI (as in the AMI corpus documentation and
# most AMI summarization papers). Each code covers the four meetings a-d of that series.
SPLITS = {
    "dev": ["ES2003", "ES2011", "IS1008", "TS3004", "TS3006"],
    "test": ["ES2004", "ES2014", "IS1009", "TS3003", "TS3007"],
}
ALL_SCENARIO = (
    [f"ES20{n:02d}" for n in range(2, 17)]
    + [f"IS10{n:02d}" for n in range(10)]
    + [f"TS30{n:02d}" for n in range(3, 13)]
)
SPLITS["train"] = [s for s in ALL_SCENARIO if s not in SPLITS["dev"] + SPLITS["test"]]
MISSING = {"IS1002a", "IS1005d"}  # not distributed with the corpus


def meetings(split: str) -> list[str]:
    return [f"{s}{p}" for s in SPLITS[split] for p in "abcd" if f"{s}{p}" not in MISSING]


def download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    print(f"Downloading {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)


def annotations() -> zipfile.ZipFile:
    path = AMI_DIR / "ami_public_manual_1.6.2.zip"
    download(ANNOTATIONS_URL, path)
    return zipfile.ZipFile(path)


def read_words(z: zipfile.ZipFile, meeting: str) -> list[dict]:
    """All words of a meeting, from every speaker, sorted by time."""
    words = []
    for name in z.namelist():
        m = re.fullmatch(rf"words/{meeting}\.([A-Z])\.words\.xml", name)
        if not m:
            continue
        root = ET.fromstring(z.read(name))
        for w in root.iter("w"):
            if w.get("starttime") is None or (w.get("punc") == "true" and not w.text):
                continue
            words.append(
                {
                    "speaker": m.group(1),
                    "start": float(w.get("starttime")),
                    "end": float(w.get("endtime") or w.get("starttime")),
                    "text": (w.text or "").strip(),
                    "punc": w.get("punc") == "true",
                }
            )
    return sorted(words, key=lambda w: (w["start"], w["speaker"]))


def turns_from_words(words: list[dict], max_gap: float = 1.0) -> list[dict]:
    """Merge consecutive words from one speaker into turns with text."""
    turns: list[dict] = []
    for w in words:
        last = turns[-1] if turns else None
        if last and last["speaker"] == w["speaker"] and w["start"] - last["end"] <= max_gap:
            last["end"] = max(last["end"], w["end"])
            last["text"] += w["text"] if w["punc"] else " " + w["text"]
        else:
            turns.append({"speaker": w["speaker"], "start": w["start"], "end": w["end"], "text": w["text"]})
    return turns


def read_abstract(z: zipfile.ZipFile, meeting: str) -> str | None:
    name = f"abstractive/{meeting}.abssumm.xml"
    if name not in z.namelist():
        return None
    root = ET.fromstring(z.read(name))
    abstract = root.find("abstract")
    if abstract is None:
        return None
    return " ".join((s.text or "").strip() for s in abstract.iter("sentence")).strip() or None


def write_rttm(meeting: str, turns: list[dict], path: Path) -> None:
    with path.open("w") as f:
        for t in turns:
            f.write(
                f"SPEAKER {meeting} 1 {t['start']:.2f} {t['end'] - t['start']:.2f} <NA> <NA> {t['speaker']} <NA> <NA>\n"
            )


def prepare(split: str, audio: bool) -> None:
    z = annotations()
    for meeting in meetings(split):
        out = AMI_DIR / f"{meeting}.json"
        words = read_words(z, meeting)
        abstract = read_abstract(z, meeting)
        if not words or not abstract:
            print(f"Skipping {meeting}: missing transcript or summary")
            continue
        turns = turns_from_words(words)
        out.write_text(
            json.dumps(
                {
                    "meeting": meeting,
                    "split": split,
                    "abstract": abstract,
                    "reference_text": " ".join(w["text"] for w in words if not w["punc"]),
                    "turns": turns,
                },
                indent=1,
            )
        )
        write_rttm(meeting, turns, AMI_DIR / f"{meeting}.rttm")
        if audio:
            download(AUDIO_URL.format(m=meeting), AMI_DIR / f"{meeting}.wav")
        print(f"Prepared {meeting}: {len(turns)} turns, abstract of {len(abstract.split())} words")


def load(split: str) -> list[dict]:
    """Load prepared meetings of one split."""
    data = []
    for meeting in meetings(split):
        path = AMI_DIR / f"{meeting}.json"
        if path.exists():
            data.append(json.loads(path.read_text()))
    if not data:
        raise SystemExit(f"No prepared AMI data for '{split}'. Run: python research/ami.py --split {split}")
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--split", choices=list(SPLITS), required=True)
    parser.add_argument("--no-audio", action="store_true", help="only download transcripts and summaries")
    args = parser.parse_args()
    prepare(args.split, audio=not args.no_audio)
