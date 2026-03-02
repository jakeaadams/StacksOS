# StacksOS Voluntary Product Accessibility Template (VPAT)

**Based on VPAT 2.5 Rev (WCAG 2.1)**

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| **Product**            | StacksOS                                                         |
| **Version**            | 0.1.0                                                            |
| **Report Date**        | 2026-03-01                                                       |
| **Contact**            | support@stacksos.io                                              |
| **Evaluation Methods** | Automated (axe-core 4.11), manual keyboard/screen reader testing |

---

## WCAG 2.1 Level A Conformance

| Criteria                        | Level | Conformance | Notes                                                           |
| ------------------------------- | ----- | ----------- | --------------------------------------------------------------- |
| 1.1.1 Non-text Content          | A     | Supports    | Alt text on images; decorative images marked `aria-hidden`      |
| 1.2.1 Audio/Video (Prerecorded) | A     | N/A         | No audio/video content                                          |
| 1.3.1 Info and Relationships    | A     | Supports    | Semantic HTML, ARIA landmarks, labeled forms                    |
| 1.3.2 Meaningful Sequence       | A     | Supports    | DOM order matches visual order                                  |
| 1.3.3 Sensory Characteristics   | A     | Supports    | Instructions do not rely on shape/color alone                   |
| 1.4.1 Use of Color              | A     | Supports    | Status indicators include text labels alongside color           |
| 1.4.2 Audio Control             | A     | N/A         | Audio used only for self-checkout feedback tones                |
| 2.1.1 Keyboard                  | A     | Supports    | All interactive elements keyboard accessible                    |
| 2.1.2 No Keyboard Trap          | A     | Supports    | Focus is never trapped; dialogs return focus on close           |
| 2.1.4 Character Key Shortcuts   | A     | Supports    | No single-character key shortcuts                               |
| 2.2.1 Timing Adjustable         | A     | Supports    | Self-checkout timeout is configurable; OPAC has no auto-timeout |
| 2.2.2 Pause, Stop, Hide         | A     | N/A         | No auto-updating content                                        |
| 2.3.1 Three Flashes             | A     | Supports    | No flashing content                                             |
| 2.4.1 Bypass Blocks             | A     | Supports    | Skip-to-content link on all pages                               |
| 2.4.2 Page Titled               | A     | Supports    | Unique titles on all pages                                      |
| 2.4.3 Focus Order               | A     | Supports    | Logical tab order throughout                                    |
| 2.4.4 Link Purpose              | A     | Supports    | Link text describes destination                                 |
| 2.5.1 Pointer Gestures          | A     | Supports    | No multi-point or path-based gestures required                  |
| 2.5.2 Pointer Cancellation      | A     | Supports    | Actions fire on up-event                                        |
| 2.5.3 Label in Name             | A     | Supports    | Visible labels match accessible names                           |
| 2.5.4 Motion Actuation          | A     | N/A         | No motion-triggered functions                                   |
| 3.1.1 Language of Page          | A     | Supports    | `lang` attribute set on `<html>`                                |
| 3.2.1 On Focus                  | A     | Supports    | Focus does not trigger context changes                          |
| 3.2.2 On Input                  | A     | Supports    | Form input does not auto-submit                                 |
| 3.3.1 Error Identification      | A     | Supports    | Errors described in text with visual indicators                 |
| 3.3.2 Labels or Instructions    | A     | Supports    | All form fields have visible labels                             |
| 4.1.1 Parsing                   | A     | Supports    | Valid HTML; no duplicate IDs                                    |
| 4.1.2 Name, Role, Value         | A     | Supports    | Custom components use ARIA appropriately                        |

## WCAG 2.1 Level AA Conformance

| Criteria                        | Level | Conformance | Notes                                           |
| ------------------------------- | ----- | ----------- | ----------------------------------------------- |
| 1.3.4 Orientation               | AA    | Supports    | Content works in portrait and landscape         |
| 1.3.5 Identify Input Purpose    | AA    | Supports    | `autocomplete` attributes on relevant inputs    |
| 1.4.3 Contrast (Minimum)        | AA    | Supports    | Design tokens enforce 4.5:1 minimum contrast    |
| 1.4.4 Resize Text               | AA    | Supports    | Text scales to 200% without loss                |
| 1.4.5 Images of Text            | AA    | Supports    | No images of text used                          |
| 1.4.10 Reflow                   | AA    | Supports    | Responsive layout down to 320px                 |
| 1.4.11 Non-text Contrast        | AA    | Supports    | UI components meet 3:1 contrast                 |
| 1.4.12 Text Spacing             | AA    | Supports    | Content adapts to user text spacing preferences |
| 1.4.13 Content on Hover/Focus   | AA    | Supports    | Tooltips are dismissible and persistent         |
| 2.4.5 Multiple Ways             | AA    | Supports    | Search, navigation, and breadcrumbs available   |
| 2.4.6 Headings and Labels       | AA    | Supports    | Descriptive headings on all sections            |
| 2.4.7 Focus Visible             | AA    | Supports    | Visible focus ring on all interactive elements  |
| 3.1.2 Language of Parts         | AA    | Supports    | Language attribute on locale-switched content   |
| 3.2.3 Consistent Navigation     | AA    | Supports    | Navigation consistent across pages              |
| 3.2.4 Consistent Identification | AA    | Supports    | Components with same function use same name     |
| 3.3.3 Error Suggestion          | AA    | Supports    | Form errors include correction suggestions      |
| 3.3.4 Error Prevention          | AA    | Supports    | Destructive actions require confirmation        |
| 4.1.3 Status Messages           | AA    | Supports    | Toast notifications use `role="status"`         |

## Testing Infrastructure

- **Automated**: axe-core 4.11 integrated via Playwright E2E tests (14 page-level tests)
- **Manual**: Keyboard navigation tested across all OPAC and staff workflows
- **Screen readers**: Tested with VoiceOver (macOS) and NVDA (Windows)
- **User controls**: Font size, contrast modes, dyslexia-friendly font available in OPAC settings

## Known Limitations

- Complex data tables (reports, item status) may benefit from additional `aria-describedby` annotations
- Self-checkout kiosk assumes touchscreen or keyboard; mouse-only users fully supported
- PDF generation (receipt printing) inherits browser accessibility for printed content
