"""Human factual-support review of generated claims (FR19, spec §21 rubric).

Each reviewer gives each claim one label: supported, partial, unsupported,
contradicted or unclear. These labels - not the automatic AI check - are the
evidence for RQ2. The claim text is stored with the label so later edits do
not change what was judged.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DB, CurrentUser, owned_child
from app.models import ActionItem, ClaimReview, Decision, Meeting, Summary, utcnow
from app.schemas import ClaimReviewIn, ClaimReviewOut

router = APIRouter(prefix="/api/claims", tags=["claim reviews"])

# Claims stored inside a summary's JSON: /api/claims/point/{summary_id}:{path}
# where path is e.g. "point:0", "topic:1", "topic:1:position:0", "question:2", "risk:0".
JSON_TYPES = {"point", "topic", "position", "question", "risk"}


def _json_claim(summary: Summary, path: list[str]) -> str:
    """Return the text of the claim at ``path`` in the summary, or raise 404."""
    try:
        kind, index = path[0], int(path[1])
        if kind == "point":
            return str(summary.points[index]["text"])
        if kind == "question":
            return str(summary.open_questions[index]["text"])
        if kind == "risk":
            return str(summary.risks[index]["text"])
        if kind == "topic":
            topic = summary.topics[index]
            if len(path) == 2:
                return str(topic["summary"])
            sub, sub_index = path[2], int(path[3])
            item = topic["positions" if sub == "position" else "points"][sub_index]
            return f"{item['speaker']}: {item['view']}" if sub == "position" else str(item["text"])
    except (IndexError, KeyError, ValueError):
        pass
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")


@router.post("/{claim_type}/{claim_id}/review", response_model=ClaimReviewOut)
def review_claim(claim_type: str, claim_id: str, body: ClaimReviewIn, user: CurrentUser, db: DB) -> ClaimReview:
    if claim_type in ("decision", "action"):
        if not claim_id.isdigit():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
        item: Decision | ActionItem
        if claim_type == "decision":
            item = owned_child(db, user, Decision, int(claim_id))
            text = item.text
        else:
            item = owned_child(db, user, ActionItem, int(claim_id))
            text = item.task
        meeting_id = item.meeting_id
        configuration = item.summary.configuration
        key = f"{claim_type}:{item.id}"
    elif claim_type in JSON_TYPES:
        summary_part, _, path = claim_id.partition(":")
        if not summary_part.isdigit():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
        summary = db.scalar(
            select(Summary)
            .join(Meeting, Meeting.id == Summary.meeting_id)
            .where(Summary.id == int(summary_part), Meeting.user_id == user.id)
        )
        if summary is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
        text = _json_claim(summary, path.split(":"))
        meeting_id = summary.meeting_id
        configuration = summary.configuration
        key = f"summary:{summary.id}:{path}"
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown claim type")

    review = db.scalar(select(ClaimReview).where(ClaimReview.reviewer_id == user.id, ClaimReview.claim_key == key))
    if review is None:
        review = ClaimReview(reviewer_id=user.id, claim_key=key, meeting_id=meeting_id)
        db.add(review)
    review.claim_type = claim_type
    review.claim_text = text
    review.configuration = configuration
    review.label = body.label
    review.notes = body.notes
    review.created_at = utcnow()
    db.commit()
    return review
