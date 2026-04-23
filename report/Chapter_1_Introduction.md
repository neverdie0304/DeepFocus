# Chapter 1: Introduction

## 1.1 Background

The transition to digital environments for study and work has fundamentally reshaped how people allocate attention. Tasks that were once performed with pen and paper, in libraries, or in dedicated office spaces are now conducted in front of web browsers, often on the same devices used for communication, entertainment, and social media. Mark et al. (2008) found that workers in digital environments switch tasks approximately every three minutes on average, and that these interruptions significantly increase stress and reduce task quality. The same pattern has been documented in educational contexts: Risko et al. (2013) showed that students frequently engage in off-task behaviours during computer-based learning, including browsing unrelated websites, checking social media, and multitasking.

The COVID-19 pandemic accelerated this shift dramatically. Remote learning and working-from-home became mainstream almost overnight, amplifying pre-existing concerns about digital distraction and self-regulation (Means and Neisler, 2021). Students and professionals alike found themselves needing to sustain attention in environments filled with competing demands — notifications, open tabs, hyperlinks, and the ever-present option to switch to a more immediately rewarding task. Unlike traditional classrooms or offices, where environmental cues and social accountability help maintain focus, the digital workspace offers few such scaffolds.

Against this backdrop, the ability to measure concentration objectively and unobtrusively has become increasingly valuable. If users could receive reliable, real-time feedback about their own focus levels, they could make informed decisions about when to take breaks, when to remove distractions, or when to change tasks. For educators and employers, aggregate concentration data could inform the design of more effective learning and working environments. Researchers studying attention and productivity could obtain ecologically valid measurements that complement traditional laboratory methods.

However, measuring concentration in digital environments is non-trivial. Attention is an internal cognitive state that cannot be observed directly. Traditional measurement approaches — self-report questionnaires, physiological monitoring via EEG, and manual observation — each carry significant limitations in terms of scalability, intrusiveness, or ecological validity (Hart and Staveland, 1988; Berka et al., 2007; Fredricks et al., 2004). Recent computational approaches using machine learning and computer vision have shown promise, with multimodal systems that combine visual, behavioural, and physiological signals consistently outperforming unimodal alternatives (Dewan et al., 2019; Sharma et al., 2019). Yet these systems almost universally require specialised hardware, controlled laboratory conditions, or server-side processing — constraints that prevent them from being deployed at scale in the everyday digital environments they aim to measure.

## 1.2 Problem Statement

Despite a substantial body of work on automated attention detection, there remains no system that simultaneously satisfies the four criteria required for practical deployment in real-world digital study and work environments:

1. **Multimodal integration.** The literature robustly demonstrates that combining multiple signal types produces more accurate and robust attention predictions than any single modality (Whitehill et al., 2014; D'Mello et al., 2012; Monkaresi et al., 2017). A system that relies on gaze alone, or typing alone, or tab activity alone, will necessarily miss the nuances that distinguish superficially similar but cognitively distinct states — such as the difference between quietly reading a long passage (high concentration, low input activity) and briefly stepping away from the computer (low concentration, low input activity).

2. **Browser-native deployment.** Digital study and work overwhelmingly take place inside web browsers. A concentration detection system that requires installing desktop software, wearing sensors, or running a separate application introduces friction that most users will not accept. Deployment within the browser — as a web application accessed via a URL — aligns with how users already interact with their digital environments.

3. **Real-time processing.** Post-hoc analysis of recorded sessions has limited practical value. For concentration measurement to inform user behaviour, feedback must be delivered while the session is ongoing. This requires computer vision and feature extraction to run at sufficient frame rates on consumer hardware, without server round-trips that introduce latency.

4. **Privacy-preserving local computation.** Continuous webcam recording raises legitimate privacy concerns, particularly in educational and workplace contexts. A system that transmits raw video to a remote server for processing creates a surveillance footprint that many users, institutions, and regulators will reject. Performing all visual analysis locally — on the user's device, with only aggregated scores leaving the browser — addresses these concerns while preserving the benefits of camera-based monitoring.

Existing systems fall into several categories, each satisfying some of these criteria but not all. Research-grade attention detection systems such as those developed by Whitehill et al. (2014) and Bosch et al. (2016) achieve high accuracy but require controlled conditions and offline video processing. Multimodal systems such as D'Mello et al. (2012) and Sharma et al. (2019) demonstrate the value of signal fusion but depend on specialised hardware (eye trackers, physiological sensors) and laboratory deployment. Browser-based tools such as WebGazer.js (Papoutsaki et al., 2016) achieve lightweight deployment but as standalone gaze estimation components rather than integrated concentration detection systems. Commercial products such as RescueTime operate at the operating-system level, requiring desktop installation and full system-wide access that runs counter to the privacy-preserving ideal.

This gap — between what the literature establishes is possible in controlled settings and what can actually be deployed in everyday digital environments — is the space in which the present work is situated.

## 1.3 Research Questions

This project investigates whether the gap identified above can be closed through careful system design and pragmatic choices of off-the-shelf components. Three research questions guide the work:

**RQ1.** Can a multimodal concentration detection system that combines visual, behavioural, and contextual signals be implemented to run entirely within a standard web browser, without specialised hardware or server-side processing?

**RQ2.** To what extent does multimodal signal fusion improve concentration estimation accuracy compared to any single modality, when the system is constrained to operate within browser-native limits?

**RQ3.** Can a lightweight machine learning model, trained on a modest quantity of user-labelled data, outperform a fixed-weight rule-based scoring scheme when both are evaluated against human ground-truth ratings?

RQ1 is a feasibility question concerning the engineering: whether the constraints of the browser environment (WebAssembly, WebGL, limited computational budget, same-origin policy) can accommodate the multimodal pipeline demanded by the literature. RQ2 probes the value of multimodality in this constrained setting through an ablation study. RQ3 tests whether the limitations of fixed-weight rule-based scoring — acknowledged throughout the literature as a weakness of heuristic approaches (Dewan et al., 2019) — can be meaningfully reduced by data-driven methods, even with the modest labelled data feasible for a single MSc-level project.

## 1.4 Contributions

This project makes four primary contributions:

**C1. DeepFocus: a browser-native multimodal concentration detection system.** An open-source web application that combines visual features extracted via MediaPipe Face Mesh (head pose, eye aspect ratio, iris-based gaze, twelve engagement-relevant facial blendshapes), behavioural features derived from keyboard and mouse interaction (typing rate, mouse velocity, click and scroll rates, idle duration, activity entropy), and contextual features captured via the Page Visibility and focus/blur events (tab-switching patterns, session progress). All visual processing runs locally in the browser; no raw images or video are transmitted or stored. To the author's knowledge, this combination of properties is unique in the existing literature.

**C2. A pragmatic training strategy for small-data settings.** A three-layer labelling approach combining Experience Sampling Method (ESM) self-reports as primary ground truth, post-session ratings as session-level supervision, and signal-based pseudo-labels for the remainder. This approach allows a useful ML model to be trained with far less labelled data than would otherwise be required, addressing a common limitation of MSc-level projects while preserving methodological rigour.

**C3. An empirical comparison of rule-based and machine-learned concentration scoring.** A systematic evaluation of a fixed-weight rule-based scorer against a machine-learned alternative, both evaluated against the same human ground-truth ratings. This comparison quantifies, in a concrete setting, how much value data-driven methods add over heuristic scoring — a question the literature has discussed but rarely measured directly for browser-deployed systems.

**C4. An ablation study over modalities.** A decomposition of the full multimodal system into its constituent modalities (visual only, behavioural only, contextual only, temporal only, and selected combinations), allowing the contribution of each signal type to be quantified. Results inform both the thesis and any future work that must choose which modalities to include under tighter computational or privacy constraints.

## 1.5 Thesis Structure

The remainder of this thesis is organised as follows:

**Chapter 2 — Literature Review** establishes the theoretical and methodological foundations of concentration measurement. It examines how attention and concentration are defined in cognitive psychology, reviews the measurement approaches that have been employed in traditional and computational paradigms, surveys the gaze estimation and face detection technologies that enable visual monitoring, discusses keyboard and mouse behavioural analysis as indicators of cognitive engagement, examines the browser-based APIs and constraints relevant to web-native deployment, and presents a comparative analysis of existing systems, culminating in the identification of the specific gap that DeepFocus addresses.

**Chapter 3 — Design** presents the system architecture and the design rationale behind it. It describes the functional and non-functional requirements, the overall system architecture, the selection and engineering of features across the four modalities, the dual scoring scheme (rule-based baseline and ML-based primary), and the key design decisions — including the exclusion of tab-switching as a rule-based penalty despite its inclusion as an ML feature, the three-layer label strategy, and the handling of browser security constraints.

**Chapter 4 — Implementation** describes the concrete realisation of the design. It covers the browser-side visual pipeline built on MediaPipe Face Mesh, the behavioural signal collection via DOM event listeners, the sliding-window feature aggregation, the backend API built on Django REST Framework, the Experience Sampling popup mechanism, and the machine learning pipeline including data export, feature engineering, model training, and TensorFlow.js deployment.

**Chapter 5 — Evaluation** presents the experimental evaluation of the system. It describes the participants, the data collection protocol, and the ground-truth construction. It reports quantitative results comparing the ML-based scorer against the rule-based baseline, presents the ablation study quantifying each modality's contribution, analyses feature importance to identify which signals drive predictions, and reports inference latency to verify real-time feasibility.

**Chapter 6 — Discussion** interprets the results in light of the research questions. It examines the extent to which each research question has been answered, acknowledges the limitations of the study — most notably the small participant pool — and discusses implications for future work, including broader user studies, additional modalities, and deployment in educational contexts.

**Chapter 7 — Conclusion** summarises the work, restates the contributions, and reflects on the broader significance of browser-native multimodal attention detection as a research direction.
