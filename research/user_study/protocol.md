# User study protocol (RQ3, NFR4)

**Do not start until the university's ethics committee has approved the study.**
Fill in the bracketed parts and attach this to the ethics application.

## Aim
Find out how accurate, complete, useful and easy to use participants find MeetMind's transcripts,
summaries and action items.

## Participants
8–12 adult volunteers (students or staff) who attended or watched the meeting they will review.
No incentives that could pressure participation. Session length: under 30 minutes.

## Materials
* MeetMind running locally (`docker compose up`), one account per participant created by the researcher.
* A meeting recording that every person in it has consented to being used (e.g. a project meeting
  recorded for this purpose), **or** an AMI test meeting the participant watches first.
* The consent form, task sheet and questionnaire below.

## Procedure
1. Explain the study, give the information sheet and take written consent (`consent_form.md`).
2. Participant uploads the recording and waits for processing (or opens a pre-processed one).
3. Tasks (think aloud; researcher notes problems, does not help unless stuck for 2 minutes):
   1. Find out what was decided about [topic].
   2. Find which action items belong to [person] and mark one as done.
   3. Check whether one summary point is correct by using its source link.
   4. Rename "Speaker 1" to the right person.
   5. Export the minutes as a PDF.
4. Questionnaire (`questionnaire.md`): SUS and three Likert ratings.
5. 5-minute interview: What was most / least useful? Did you trust the summary? What would you change?
6. Thank the participant; remind them they can withdraw until [date].

## Data handling (UK GDPR)
* Participant IDs (P01…) only; names stay on the consent forms, stored separately and securely.
* Recordings and transcripts are deleted from MeetMind (Delete button) straight after each session.
* Notes and questionnaire answers are anonymised and deleted at the end of the project.
