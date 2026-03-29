# Report Notes — Design Decisions & Rationale

> 논문 작성 시 Implementation / Design 챕터에 포함할 내용 정리.
> 코드 변경과 함께 기록.

---

## 1. Tab Switching Removed from Rule-Based Scoring

**Date**: 2026-03-30
**Change**: `isTabHidden` penalty removed from `computeFocusScore()`
**Affected files**: `scoring.js`, `SessionPage.jsx`

### Rationale

Tab switching was initially included as a distraction signal based on the literature:
- Mark et al. (2014) found that tab switching in digital environments correlates with stress and reduced task quality.
- Estrin and Robilliard (2016) demonstrated that tab-switching frequency during online examinations correlated with lower performance.

However, during implementation testing, it became apparent that **tab switching is an inherent part of normal computer-based work** — users routinely switch between reference materials, documentation, communication tools, and their primary task. Penalising all tab switches therefore conflates productive multitasking with genuine distraction.

This observation is consistent with Roda (2011), who notes that digital interfaces generate a persistent stream of task-relevant context switches that do not necessarily indicate attention loss. The key distinction is between **task-relevant switching** (e.g., consulting documentation while coding) and **task-irrelevant switching** (e.g., checking social media), which cannot be determined from the Page Visibility API alone since it cannot inspect the content of other tabs (Barth, 2011).

### Decision

- **Rule-based scoring**: `isTabHidden` penalty **removed**. The deterministic scorer no longer penalises tab switches.
- **ML features**: `tab_switch_count` and `window_blur_count` are **retained** as input features. The ML model can learn from labelled data whether particular tab-switching patterns (e.g., frequency, duration, timing) correlate with self-reported focus loss, rather than treating all switches as uniformly negative.
- **UI**: The "Tab Hidden/Visible" signal indicator removed from the session page, as it is no longer used for scoring.

### Literature References

- Mark, G., Wang, Y. and Niiya, M. (2014) 'Stress and multitasking in everyday college life', *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, pp. 41–50.
- Estrin, D. and Robilliard, D. (2016) 'Browser-based monitoring of student engagement during online examinations', *Proceedings of the ACM Conference on Learning at Scale*, pp. 357–360.
- Roda, C. (2011) *Human Attention in Digital Environments*. Cambridge: Cambridge University Press.
- Barth, A. (2011) *The Web Origin Concept*. RFC 6454. IETF.

### Where to include in thesis

- **Section: Implementation → Scoring Design** — explain the iterative refinement from initial literature-based weights to a more nuanced approach.
- **Section: Design Decisions / Evaluation → Limitations of rule-based approach** — use this as motivation for why ML-based scoring is needed (the model can learn contextual distinctions that fixed rules cannot).

---

*Add further design decision notes below as they arise.*
