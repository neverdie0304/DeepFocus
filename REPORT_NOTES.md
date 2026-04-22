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

---

## 2. Semi-Supervised Training Strategy

**Date**: 2026-03-30
**Change**: Added semi-supervised pseudo-labeling as primary training strategy
**Affected files**: `ml/train_xgboost.py`

### Problem

Training the ML model on the rule-based focus score as a proxy target is circular — the model simply learns to replicate the rule-based system and cannot demonstrate improvement over it. Meaningful evaluation requires **human ground truth** (ESM self-reports), but collecting sufficient labeled data (1,000+ samples) requires significant user testing time.

### Solution: Three-Layer Label Strategy

The training pipeline now combines three label sources in priority order:

1. **ESM labels (highest priority)**: In-the-moment self-reports (1–5 scale) collected via random popup during sessions. These directly replace any lower-quality label for that timestamp.
2. **Post-session labels**: Overall session ratings (1–10, scaled to 1–5) applied to all events in that session. Weaker than ESM but still human-provided.
3. **Pseudo-labels (base layer)**: Signal-based heuristic assignments for high-confidence states:
   - Face present + active input + looking at screen → score 5 (clearly focused)
   - Face missing OR idle >30s OR looking far away → score 1 (clearly distracted)
   - Intermediate states assigned scores 2–4 based on signal combinations

This ensures the model always has a meaningful non-circular target, while real human labels are used wherever available.

### Key Evaluation: Rule-Based vs ML

Both systems are compared against the same human ground truth:
- Rule-based score (0–100, scaled to 1–5)
- ML predicted score (1–5)
- Ground truth: ESM / post-session / pseudo-labels

If ML achieves lower MAE and higher correlation than rule-based against this ground truth, the contribution is demonstrated.

### Literature Basis

- Nezami et al. (2020) — Semi-supervised engagement detection with limited labeled data (Literature Review Section 2.10.1)
- D'Mello & Graesser (2012) — Using self-report probes as ground truth for affective state detection (Section 2.2.1)

### Where to include in thesis

- **Section: Implementation → Model Training Strategy** — explain the three-layer approach and why proxy targets are insufficient
- **Section: Evaluation → Experimental Setup** — describe how ground truth was constructed and why this is valid

---

---

## 3. Tab Switching Cannot Distinguish Productive vs Distractive Switches

**Date**: 2026-04-11
**Type**: Limitation & Mitigation

### Problem

Tab switching as a distraction signal is inherently ambiguous. A user switching to YouTube is distracted, but a user switching to a Word document for reference is productively multitasking. Ideally, the system would penalise only task-irrelevant switches.

### Why It Cannot Be Resolved (Browser Security)

The **same-origin policy** (Barth, 2011) prevents any web application from inspecting the content, URL, or title of other browser tabs. The Page Visibility API (W3C, 2013) reports only that the user has left the current tab — not where they went. This is a fundamental constraint of the browser security model, not an implementation oversight.

Desktop-level applications such as RescueTime can monitor system-wide application usage because they operate outside the browser sandbox. DeepFocus deliberately operates within browser constraints to preserve user privacy (no OS-level permissions required).

### Mitigation: Behavioural Pattern Analysis via ML

While the system cannot determine the destination of a tab switch, the **behavioural signals before and after a tab switch** provide indirect evidence of whether it was productive:

- **Short switch + immediate typing on return** → likely productive (consulting reference material)
- **Long absence + idle on return** → likely distractive (watching content)
- **Frequent rapid switches + low activity** → likely aimless browsing

By retaining `tab_switch_count` and `time_since_tab_return` as ML features alongside behavioural features (`keystroke_rate`, `idle_duration`, `activity_level`), the model can learn these contextual patterns from ESM-labelled data — something a rule-based system with fixed penalties cannot achieve.

### Literature References

- Barth, A. (2011) The Web Origin Concept. RFC 6454. IETF. — **Literature Review Section 2.8.3**
- W3C (2013) Page Visibility (Second Edition). — **Section 2.8.1**
- Mark et al. (2008) — task switching cognitive cost varies by context — **Section 2.8.2**
- Roda, C. (2011) — digital interfaces generate task-relevant context switches — **Section 2.1.3**

### Where to include in thesis

- **Section: Design → Limitations and Mitigations** — explain the browser security constraint and why ML-based pattern analysis is the appropriate response
- **Section: Evaluation → Discussion** — if ablation shows `tab_switch_count` has high feature importance in the ML model despite being removed from rule-based scoring, this validates the approach

---

*Add further design decision notes below as they arise.*
