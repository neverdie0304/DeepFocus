# Chapter 6: Legal, Social, Ethical, and Professional Issues

This chapter situates DeepFocus within the broader landscape of professional standards, legislation, and ethical considerations. A concentration detection system that combines webcam video analysis, behavioural tracking, and continuous score reporting raises a substantive set of issues that extend well beyond the technical. The system was designed with these considerations in mind from the outset, and this chapter makes that design rationale explicit. Section 6.1 identifies the professional standards and codes of conduct that have informed the work. Section 6.2 addresses the data protection and privacy legislation applicable in the United Kingdom and European Union, which forms the binding legal framework for a system of this kind. Section 6.3 examines the ethical implications for public well-being, with particular attention to surveillance, user autonomy, and informed consent. Section 6.4 discusses computer security measures. Section 6.5 addresses intellectual property and licensing. Sections 6.6 through 6.9 consider accessibility, environmental sustainability, economic and commercial factors, and globalisation. Section 6.10 consolidates the discussion of software trustworthiness, and Section 6.11 provides a summary.

## 6.1 Professional Standards and Codes of Conduct

Two professional codes of conduct are directly applicable to the design and development of DeepFocus: the British Computer Society (BCS) Code of Conduct, as the professional body for the computing profession in the United Kingdom, and the Association for Computing Machinery (ACM) Code of Ethics and Professional Conduct, which is the most widely adopted international standard in the computing profession.

### 6.1.1 The BCS Code of Conduct

The BCS Code of Conduct (BCS, 2022) is organised around four principal duties: duty to the public, duty to the relevant authority, duty to the profession, and professional competence and integrity. Several clauses bear directly on the design of DeepFocus.

Clause 1.a requires members to "have due regard for public health, privacy, security, and wellbeing of others and the environment." The design decisions documented in Chapter 3 — in particular, the commitment to local-only processing of webcam video, the data minimisation implicit in the event schema, and the graceful fallback to camera-off mode — are direct expressions of this duty. Clause 1.b ("have due regard for the legitimate rights of third parties") is satisfied by the explicit consent flow for camera access and the user-initiated deletion of sessions and accounts. Clause 4.a ("only undertake to do work or provide a service that is within your professional competence") is reflected in the decision, documented in Chapter 3, to use pre-trained MediaPipe models rather than to train face detection and landmark regression from scratch: the author's competence lies in system integration and feature engineering, and it would have been professionally imprudent to claim expertise in training production-grade computer-vision models within the time budget of an undergraduate project. Clause 4.c ("develop your professional knowledge, skills, and competence on a continuing basis") is reflected in the literature review and in the adoption of contemporary techniques (MediaPipe Face Landmarker v2 with blendshapes, XGBoost with SHAP-based feature importance analysis, TensorFlow.js for browser inference).

### 6.1.2 The ACM Code of Ethics

The ACM Code (ACM, 2018) supplements the BCS code with a more detailed treatment of data-intensive and algorithmic systems. Principle 1.6 ("respect privacy") is particularly pertinent: "Computing professionals should only use personal information for legitimate ends and without violating the rights of individuals and groups. This requires taking precautions to prevent re-identification of anonymized data or unauthorized data collection, ensuring the accuracy of data, understanding the provenance of the data, and protecting it from unauthorized access and accidental disclosure." DeepFocus addresses this principle on several fronts. No raw video or images are ever transmitted to the server (preventing unauthorised collection at the architectural level); stored event data contains no personally identifying content beyond the user's account identifier (reducing re-identification risk); users can delete individual sessions or entire accounts at any time (giving individuals control over their data); and authentication is enforced at every API boundary (preventing unauthorised access).

Principle 1.7 ("honor confidentiality") and Principle 2.9 ("design and implement systems that are robustly and usably secure") together motivate the security measures described in Section 6.4.

Principle 3.1 ("ensure that the public good is the central concern during all professional computing work") is addressed in Section 6.3.

## 6.2 Data Protection and Privacy Legislation

DeepFocus is deployed in the United Kingdom on infrastructure hosted in the United States (Render.com). It processes personal data — specifically, behavioural signals, self-reported focus ratings, and, when the user consents, facial landmarks derived from webcam video — and is therefore subject to United Kingdom data protection law. The applicable legislation is the UK General Data Protection Regulation (UK GDPR, retained from Regulation (EU) 2016/679) and the Data Protection Act 2018. Both were considered during design.

### 6.2.1 Lawful Basis for Processing

Under Article 6 of the UK GDPR, any processing of personal data requires a lawful basis. For DeepFocus, the lawful basis is the consent of the data subject (Article 6(1)(a)). Consent is obtained at two distinct points. First, at account registration, the user accepts the terms under which session data will be collected and stored. Second, at session start, the user is presented with a specific consent dialogue for webcam access (implemented via the `getUserMedia` API, which itself requires an additional browser-level permission prompt). The user may decline camera access at this point and proceed in "camera-off" mode, in which case no visual features are captured at all. Consent is specific, informed, and withdrawable: the user may at any time delete individual sessions, delete their entire account (with cascading deletion of all associated events and self-reports), or simply stop using the system.

### 6.2.2 Data Minimisation

Article 5(1)(c) of the UK GDPR requires that personal data be "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed." This is one of the principles that most strongly shaped the design. DeepFocus never transmits raw images or video frames from the webcam to the server. Visual processing — face detection, landmark regression, head pose estimation, blendshape extraction, eye aspect ratio computation, iris-based gaze estimation — is performed entirely within the user's browser using the MediaPipe Face Landmarker model. Only the derived numerical features (twenty floating-point visual features per two-second sample) are transmitted to the server, alongside behavioural counts (keystroke rate, mouse velocity, etc.) and contextual flags (tab switches, window focus). This approach reflects the principle of data minimisation at an architectural level rather than merely at a policy level: even if the server were compromised, no video content could be recovered from the stored data.

### 6.2.3 Data Subject Rights

The UK GDPR grants data subjects a set of rights including access (Article 15), rectification (Article 16), erasure (Article 17, "the right to be forgotten"), and data portability (Article 20). DeepFocus provides practical mechanisms for each. The user can view all their stored sessions and events via the dashboard and history pages (supporting the right of access). Session notes and tags can be edited at any time (supporting the right to rectification). Individual sessions can be deleted via the report page, and the entire account can be deleted from settings, with cascading removal of all related records (supporting the right to erasure). The ML export endpoint, which produces a CSV of all the user's events, provides a mechanism for data portability.

### 6.2.4 Special Category Data

Biometric data — when processed for the purpose of uniquely identifying an individual — is classified as "special category data" under Article 9 of the UK GDPR and attracts heightened protection. The position of facial landmarks here requires careful analysis. DeepFocus does not perform facial recognition: it does not attempt to match faces against a database of known individuals, nor does it store facial features in a form that would permit such matching. The MediaPipe Face Landmarker produces geometric landmarks and expression coefficients that describe facial configuration, not identity; these features are used to compute head pose and engagement indicators, and the underlying landmark coordinates are not stored. By the Article 4(14) definition, which requires processing "for the purpose of uniquely identifying a natural person," the system does not process biometric special category data. Nevertheless, because the distinction is subtle, the consent flow treats camera access with the same explicitness that would be required if special category data were involved.

### 6.2.5 International Data Transfers

The Render.com infrastructure on which the backend runs is hosted in the United States. Transfers of personal data from the UK to the United States are subject to Chapter V of the UK GDPR. Following the UK Government's data bridge with the US (effective 12 October 2023), transfers to organisations certified under the UK Extension to the EU-US Data Privacy Framework are permitted without additional safeguards. Render Services, Inc. is currently enrolled in the Data Privacy Framework, placing these transfers on a compliant footing. The ML export functionality, which allows the user to download their own data for offline analysis, does not constitute a further international transfer because the user is the data subject and exports data to their own device.

## 6.3 Public Well-Being and Ethical Considerations

Beyond legal compliance, a concentration detection system raises substantive ethical questions that cannot be fully resolved by consent flows and data protection measures alone. Three issues warrant particular discussion.

### 6.3.1 Surveillance and User Autonomy

Any system that measures cognitive or behavioural states carries the potential to be deployed as a surveillance tool — for example, by employers monitoring remote workers, or by educational institutions monitoring online learners. The same technical capability that enables a student to monitor their own focus patterns, for personal self-regulation, can enable an employer to penalise workers for perceived lapses in attention. Slade and Prinsloo (2013), in their discussion of ethics in learning analytics, emphasise that the difference between self-tracking and surveillance lies not in the technology but in the locus of control.

DeepFocus is designed to be self-tracking software. There is no administrator role, no organisational dashboard, no mechanism by which one user can view another user's data. Each account is entirely siloed: data is accessible only to the account holder, authenticated by JWT on every request. This design choice was deliberate and represents a refusal to build the features that would make the system useful as a surveillance tool. The author acknowledges, however, that this design choice cannot prevent institutional adoption in which individuals are required to install the system and share their data — for example, by installing it under an institutional account provisioned by an employer. The open-source nature of the project (discussed in Section 6.5) provides a partial mitigation: users who suspect an institutional deployment has been modified to support surveillance can inspect the source code or run an unmodified version.

Mark et al. (2014) and Roda (2011) document the substantial variability in what constitutes "distraction" across individuals and contexts. A user checking social media may be productively switching tasks or avoidantly procrastinating; the signals DeepFocus collects cannot distinguish between the two with certainty. This means that the focus scores produced by the system are, fundamentally, a model of one dimension of behavioural state — not a verdict on whether the user is working well. The user interface deliberately presents scores as real-time feedback rather than as aggregate judgements, and the system does not generate reports of the form "User X was distracted for Y% of the workday."

### 6.3.2 Informed Consent and Mental Health

Continuous focus monitoring has potential to exacerbate anxiety in users who are already predisposed to self-criticism or perfectionism. A low focus score displayed mid-session, repeated across many sessions, could reinforce negative self-perception rather than serving as useful feedback. The literature on self-monitoring and productivity interventions (Seli et al., 2016; D'Mello and Graesser, 2012) suggests that the psychological effects of such tools are not universally positive.

Several mitigations are present in the design. The focus gauge is rendered using non-judgmental colours (green / yellow / red) with neutral labels ("Focused" / "Distracted" / "Away") rather than evaluative labels ("Good" / "Poor"). The system does not apply streaks, gamification, or punitive feedback. The session report emphasises distributions ("X% of the session was focused") rather than absolute deficits. The Experience Sampling Method popup, which requests a self-rating during the session, is designed to be dismissible (auto-dismissing after ten seconds of no response) so that users who find the intervention unwelcome at a given moment can simply ignore it.

Informed consent at registration includes a description of the intended use (self-monitoring for personal productivity), the types of data collected, and the fact that visual data is processed locally. The author considers that a production deployment of the system should supplement this with access to a written privacy notice and a brief explanation of the limitations of the scoring — specifically, the fact that low scores do not necessarily indicate poor performance, and that the system is best used as a reflective tool rather than as a source of authoritative judgements.

### 6.3.3 Fairness and Group Differences

The MediaPipe Face Landmarker has been reported to perform less reliably for users with darker skin tones, certain facial features (such as those with heavy facial hair), and users wearing religious head coverings or extensive eyewear (Buolamwini and Gebru, 2018, report similar findings for commercial face analysis systems more generally). DeepFocus inherits these limitations: when face detection fails, the `face_confidence` feature drops to zero and the system falls back to the behavioural and contextual modalities. This means that, in practical terms, users for whom face detection is unreliable will receive scores derived from a smaller feature set. The author considered this when designing the scoring system: the rule-based fallback assigns weights such that behavioural signals can support a meaningful score in the absence of visual features, and the camera-off mode is a fully supported first-class path. A more comprehensive mitigation would involve systematic evaluation of accuracy across demographic subgroups — work that lies beyond the scope of an individual undergraduate project but is identified as important future work in Chapter 7.

## 6.4 Computer Security

A secure web application requires defences at multiple layers. The relevant design decisions are summarised here.

**Authentication.** User passwords are never stored in plaintext. They are hashed using Django's default PBKDF2-SHA256 algorithm with a per-user salt and a high iteration count, following OWASP recommendations for password storage (OWASP, 2023). Authentication tokens are issued as JSON Web Tokens signed with a server-side secret. Access tokens have a 30-minute lifetime and are refreshed transparently by the frontend using long-lived refresh tokens (7-day lifetime). Refresh token rotation is enabled, so a compromised refresh token becomes unusable as soon as a legitimate refresh occurs.

**Transport security.** All traffic between the browser and the backend is served over HTTPS with TLS 1.3. The Render.com hosting platform provisions certificates automatically via Let's Encrypt. Django's security middleware is configured to set HTTP security headers (Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options) and to redirect HTTP to HTTPS in production.

**Cross-origin controls.** The backend uses `django-cors-headers` to restrict cross-origin requests. In production, the frontend is served from the same origin as the backend (Django serves the compiled React bundle via `whitenoise`), obviating the need for cross-origin API calls entirely. This reduces the CORS attack surface to zero for normal operation.

**Cross-site request forgery.** Token-based authentication (rather than session cookies) means the system is not exposed to CSRF attacks on authenticated endpoints, since the JWT is held in the frontend's local storage and must be explicitly attached to each request. The frontend does not automatically submit the token in a way that a third-party site could exploit.

**Input validation.** All API endpoints use Django REST Framework serializers, which validate incoming data against the declared field types and constraints. Bulk event uploads are validated per-event before any database write occurs, preventing partial writes and schema violations.

**Webcam access.** The browser's permission model requires explicit user consent for camera access, granted per-origin. DeepFocus neither attempts to circumvent this nor to retain access longer than necessary: the `MediaStream` is released (all tracks stopped) when the session ends or when the user navigates away from the session page.

**Content Security Policy.** Inline scripts and styles are avoided in the built frontend bundle. The MediaPipe WebAssembly and model assets are loaded from Google's CDN, which is the only permitted external script source.

## 6.5 Intellectual Property

DeepFocus integrates several third-party components under open-source licences, and produces original work that must itself be licensed. Both sides of this need careful attention.

### 6.5.1 Third-Party Dependencies

The major third-party components and their licences are:

| Component | Licence | Role |
|-----------|---------|------|
| MediaPipe Tasks Vision | Apache License 2.0 | Face detection, landmarks, blendshapes |
| MediaPipe Face Landmarker model | Apache License 2.0 | Pre-trained model weights |
| React | MIT | UI framework |
| Vite | MIT | Build tool |
| TailwindCSS | MIT | Styling |
| Chart.js | MIT | Visualisations |
| axios | MIT | HTTP client |
| TensorFlow.js | Apache License 2.0 | Browser-side ML inference |
| Django | BSD 3-Clause | Backend framework |
| Django REST Framework | BSD 2-Clause | API layer |
| django-cors-headers | MIT | CORS middleware |
| djangorestframework-simplejwt | MIT | JWT authentication |
| XGBoost | Apache License 2.0 | Training |
| pandas / scikit-learn / matplotlib | BSD 3-Clause | Data analysis |

All of these licences are compatible with one another and with the project's own licence. The Apache 2.0 and MIT licences impose only attribution and, for Apache 2.0, patent grant obligations. The BSD licences likewise require attribution. No licence in the dependency tree is of the "copyleft" (GPL) variety that would require the project's own source to be released under the same licence, though the author has independently chosen to release the project as open source (see Section 6.5.3).

Attribution is provided in the project's README.md, which lists all major dependencies, and in the source code itself where library-specific code is included.

### 6.5.2 Data Provenance

The pre-trained MediaPipe Face Landmarker model was trained by Google on datasets whose composition is documented in the MediaPipe model card (Google, 2023). DeepFocus uses the released model as-is, without fine-tuning. The data used to train the project's own ML scoring model is collected from the author and a small number of volunteer participants, each of whom has given informed consent and retains the right to withdraw their data at any time. No externally sourced dataset of facial images or behavioural traces has been incorporated into the training set, which avoids questions of secondary consent and dataset licensing that would arise if, for example, the DAiSEE (Gupta et al., 2016) or a similar dataset had been used.

### 6.5.3 The Project's Own Licensing

The DeepFocus source code is released under the MIT Licence. This choice was made deliberately. The MIT Licence imposes minimal restrictions on downstream use while preserving attribution, which maximises the likelihood that the work will be useful to future students, researchers, and practitioners. It also ensures compatibility with the project's dependencies and with common commercial and academic use cases. The alternative of releasing under the Apache 2.0 Licence was considered for its explicit patent grant, but the additional complexity was not judged to be warranted for a project of this scope.

The thesis itself and the data collected from participants are treated separately from the source code. The thesis is the author's own work, subject to the university's regulations on academic integrity and copyright. Participant data is retained for the duration of the project and for the minimum period necessary to complete assessment, after which it will be deleted.

## 6.6 Accessibility

Accessibility is both a legal requirement (under the Equality Act 2010 in the UK, which prohibits discrimination against disabled persons) and a matter of design quality. DeepFocus was built with several accessibility considerations in mind.

**Users without a webcam.** The system supports a fully functional camera-off mode. In this mode, visual features are simply absent, and the scoring falls back to behavioural and contextual signals. No functionality beyond the visual feedback itself is withheld from users who choose not to, or cannot, use a camera.

**Users with visual impairments.** The interface uses high-contrast colours throughout and does not rely solely on colour to convey information. Textual labels accompany coloured indicators ("Tab Visible" / "Tab Hidden" rather than merely green/red dots). The focus gauge displays a numeric score in large, high-contrast text in addition to the coloured ring. The author acknowledges that the current implementation has not been formally audited against WCAG 2.1 AA (W3C, 2018), and that further work would be needed to reach formal conformance.

**Users with motor impairments.** Interactions are designed to be tolerant of imprecise input: targets are large, there are no time-pressured interactions, and the ESM popup auto-dismisses rather than blocking progress.

**Users with keyboard-only input.** The application is built with semantic HTML elements, so built-in keyboard navigation (Tab, Shift+Tab, Enter, Space) works throughout. The author has tested the critical user flows (registration, login, session start and end, report viewing) with keyboard-only navigation.

**Device compatibility.** The frontend targets modern evergreen browsers (Chrome, Firefox, Safari, Edge) on desktop and laptop devices. Mobile devices are not a primary target for a focus-monitoring application aimed at sustained study and work, but the responsive layout degrades gracefully on smaller screens.

**Language.** The interface is currently in English only. Full internationalisation was out of scope for the project, but the architecture does not preclude it: all user-facing strings are separable, and React's ecosystem supports localisation libraries (e.g., `react-i18next`) that could be added in future work.

## 6.7 Environmental and Sustainability Considerations

The environmental cost of software is increasingly recognised as a professional concern (Freitag et al., 2021). Two aspects of DeepFocus are relevant.

First, all computationally intensive processing — the MediaPipe face landmarking, feature extraction, and ML inference — runs on the client device. This is a deliberate departure from the server-side inference pattern common in commercial AI products, which requires large fleets of GPUs to be kept running to serve real-time requests. In DeepFocus, the user's existing laptop or desktop, which is already powered on for the duration of the focus session, performs this computation. No additional compute resources need to be provisioned, and the carbon cost of the visual analysis is effectively zero (beyond the baseline cost of the browser already running). The server-side component, by contrast, is a lightweight Django application with a SQLite database: it does no ML inference, no video processing, and no heavy analytics. It can run comfortably on the smallest available cloud instance.

Second, the data footprint is small. A one-hour session at 2-second sampling produces approximately 1,800 events. Each event record, including all 36 ML features, occupies a few hundred bytes. One hour of DeepFocus produces on the order of half a megabyte of data — orders of magnitude smaller than the video-recording approach that would be required if visual analysis were performed server-side. Smaller data means smaller storage, smaller backups, and less energy consumed in moving data between systems.

The author acknowledges that these benefits apply only in comparison with the particular alternatives (server-side video processing). A more complete sustainability analysis would need to account for the energy cost of the client-side computation, which is not negligible when summed across many users. The small model size (the distilled TensorFlow.js MLP is under 1 MB) and the modest inference frequency (once per two seconds, per session) put this cost at a level that is reasonable in the context of a voluntary productivity tool, but the principle of computational frugality should remain a design consideration as the system evolves.

## 6.8 Economic and Commercial Factors

DeepFocus is a free, open-source alternative to commercial focus-tracking and productivity-monitoring products. RescueTime, described in the Literature Review, is a subscription service that requires desktop installation and monitors system-wide application usage; Hubstaff, Teramind, and similar workplace monitoring products go further by capturing screenshots and categorising activity. Each of these products represents a particular position in a trade-off space between functionality, intrusiveness, and cost.

By providing a free alternative with a deliberately narrower scope — focus measurement within a single browser tab, with local processing of visual data — DeepFocus extends the available options. Users who are unable or unwilling to pay for commercial productivity tools, or who are uncomfortable with the intrusiveness of system-wide monitoring, have an alternative available. The system's design does not preclude commercial extension: an organisation could, for example, fork the codebase and add administrator features (dashboards aggregating multiple users' data) to produce a team-oriented product. The MIT Licence under which the code is released explicitly permits this. The author's view, however, is that the value of the present system lies precisely in its refusal to build such features, and a commercial deployment that added them would be a qualitatively different product.

Deployment cost for the present system is nominal. Render.com's free tier supports small web services at no cost; the backend database is a single SQLite file; the frontend is compiled to static assets. For the duration of the project, all infrastructure costs are zero. A production-scale deployment would incur modest costs (roughly the cost of a small cloud instance, plus object storage for database backups), but these are at the level that a small non-profit, educational institution, or even an individual could sustain.

## 6.9 Globalisation

A system that depends on webcam-based analysis, modern browser capabilities, and reliable internet access is necessarily biased toward users in regions with these resources. DeepFocus does not attempt to overcome this bias directly: it is not designed to function on low-end devices, over unreliable connections, or in environments where webcams are uncommon. The target deployment context is students and professionals working in digital environments that are broadly similar to those documented in the educational technology literature.

Within that target context, several choices support broader applicability. The interface is language-neutral in its visual elements: the focus gauge, the coloured indicators, and the task-type icons communicate without textual reliance. As noted in Section 6.6, adding full internationalisation is feasible. The scoring system does not encode culturally specific assumptions about what constitutes focused behaviour: it operates on quantitative signals (head orientation, input rates, tab switching patterns) that are broadly invariant to cultural context. The selection of task types (coding, reading, writing, video, study, other) covers the range of digital work common across academic and professional contexts globally.

The user study conducted to evaluate the system is, as noted in Chapter 5, limited to a small number of participants. A broader cross-cultural study is identified as future work in Chapter 7.

## 6.10 Software Trustworthiness

Several dimensions of software trustworthiness apply here. Some have been addressed in other sections (security in 6.4, privacy in 6.2, intellectual property in 6.5). Three further dimensions warrant explicit discussion.

**Reproducibility.** The source code is version-controlled with Git and hosted publicly. Each commit captures a complete, buildable state of the system. The training pipeline (`ml/`) is similarly scripted: a future researcher can reproduce the trained ML model by running the scripts in order, provided the same raw data is available. The random seeds used in the training procedure (in XGBoost and in the train/validation split) are fixed, making the specific numerical results reproducible to within the tolerances of the underlying libraries.

**Testability.** The backend is covered by a test suite built on Django's testing framework, exercising models, serializers, API endpoints, and permissions. The frontend scoring logic is covered by unit tests in Vitest. The details of the testing strategy are described in Chapter 4.

**Documentation.** Every significant module of the codebase carries inline documentation, with particular attention to non-obvious decisions (for example, the comment in `scoring.js` explaining why tab switching is retained as an ML feature but removed from the rule-based penalty references the design discussion in Chapter 3). The `REPORT_NOTES.md` file, retained in the repository, documents the reasoning behind several design decisions for future readers.

## 6.11 Summary

DeepFocus is situated in a landscape where technical design decisions have substantive legal, ethical, and social implications. The system's commitment to local-only processing of visual data, its data minimisation at the architectural level, its treatment of consent as ongoing and withdrawable, and its refusal to build features that would enable surveillance of one user by another are not peripheral features but central design choices. They are informed by the BCS and ACM professional codes, by the UK GDPR and the Data Protection Act 2018, and by the learning analytics ethics literature. The open-source release of the code under the MIT Licence, together with the careful attribution of third-party dependencies, situates the work in a tradition of shared technical infrastructure. Accessibility, environmental sustainability, and the needs of users outside the immediate target demographic have been considered in proportion to their relevance within the scope of an undergraduate project. The author recognises that this chapter describes the design's intentions and the reasoning behind them, and that some aspects — in particular, fairness across demographic subgroups, formal accessibility conformance, and broader cross-cultural validation — warrant more work than was feasible within the present scope and are identified as future work in Chapter 7.
