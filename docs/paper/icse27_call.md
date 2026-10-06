# ICSE 2027 Tool Demonstration track — requirements and our status

*Call provided by Paul on 2026-10-06. This file is the checklist; the plan to
meet it is in docs/design/roadmap.md ("ICSE 2027 submission plan").*

## Dates (AoE = UTC−12)

| | Date |
|---|---|
| **Submission** | **Friday 23 October 2026, AoE** |
| Notification | Friday 11 December 2026 |
| Camera ready | Wednesday 20 January 2027 |
| After acceptance | optional ICSE 2027 Artifact Evaluation (available / reusable / reproduced badges) |

Submission site: https://icse27demos.hotcrp.com/

## Paper

| Requirement | Status |
|---|---|
| IEEE conference format: `\documentclass[10pt,conference]{IEEEtran}`, no compsoc options; title 24 pt, text 10 pt; no spacing/font tweaks (desk reject) | to do |
| **≤ 4 pages including references, figures, tables, appendices** | outline assumes this (docs/paper/outline.md) |
| PDF | to do |
| **Single-anonymous: author names in the paper** | authors + order to confirm (Paul) |
| ORCID iDs for all authors | to collect |
| **Video URL appended at the end of the abstract** | to do |
| **Link to the publicly available tool + usage instructions** (and repository if open source) | repo public on GitHub; usage instructions = README quickstart (to finish) |
| Not previously published in demo form; for a companion of a research paper, the tool details must not be in that paper and must add a substantial contribution beyond it | the REAL paper (arXiv:2606.31589) describes the framework, not this tool; our additions are listed in tool_paper_alignment.md §2 — make them explicit in the paper |

## Content the demo paper must communicate

| Item | Where in our paper | Status |
|---|---|---|
| Envisioned users | §1: requirements engineers and ML/AV engineers who test learned components and must decide what to change; assurance reviewers | to write |
| Software engineering challenge | §1: testing finds failures but does not say whether to change the data, the model, the system, the requirement or the assumptions | to write |
| Methodology / workflow required of users | §3: write requirement → run search → read report → review & decide → accept R1 → next round | to write; figure 1 |
| Results of validation studies (mature) **or** design of planned studies (early prototype) | §4: case study rounds 1-3 on CARLA (validation); §5: planned practitioner study design | rounds 1-2 have; 2b / GE / round 3 pending |
| Relevant literature | §6 | to write |
| Carbon footprint (encouraged) | §5 or §7: GPU-hours of all Narval runs × A100 power | numbers in job logs; to compute |

## Evaluation criteria (what reviewers score)

Relevance to ICSE · technical soundness · novelty · **quality of the video** ·
potential applications and usefulness · relevant literature.

## Video

| Requirement | Status |
|---|---|
| **3-5 minutes** | script docs/voiceover.md (~5 min — trim to ~4:30) |
| Overview of capabilities + walk-through of some capabilities | script covers both; needs real screen recordings |
| Voice-over and/or annotations | script exists |
| "Engaging and exciting" | — |
| **Uploaded to YouTube**, accessible during review (unlisted is fine) | to do |

## Tool distribution

| Requirement | Status |
|---|---|
| **Easy-to-use form: website, VM image, or container (e.g. Docker). "Do not expect reviewers to have to build your code!"** | **built 2026-10-06** (Notes §8.30) — publish the image so reviewers `docker run` without building: a Docker image running the demo mode + review page (no CARLA/GPU needed); the full CARLA pipeline as the existing Apptainer image + Narval instructions |
| Usage instructions | README "Try it in 5 minutes" — **written** |
