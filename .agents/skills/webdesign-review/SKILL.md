---
name: Webdesign Review
description: Meta-skill: revisão completa orquestrando as 20 skills de design em sequência de prioridade.
---

Run a comprehensive web design review of this project. You are acting as a senior design director reviewing the entire project.

Conduct the review in this order (most impactful to least):

ROUND 1 — Critical Issues (fix before launch):
1. Accessibility: check WCAG 2.1 AA compliance (semantic HTML, keyboard nav, contrast, forms)
2. Usability: heuristic evaluation — are there any critical usability violations (H1-H10)?
3. Responsive Design: does the layout work at 320px, 768px, and 1280px without breaking?
4. Performance: are images optimized? Is LCP under 2.5s? Are fonts loading correctly?

ROUND 2 — Quality Improvements (high impact):
5. UI Design: is the visual hierarchy clear? Is the component system consistent?
6. Navigation: can users always find their way? Is the nav accessible?
7. Landing Page / Conversion: is the primary CTA clear? Is there sufficient social proof?
8. Color & Typography: does the design system feel cohesive and intentional?

ROUND 3 — Polish (launch + polish):
9. Visual Direction: does the design feel current for 2026 standards?
10. Brand Consistency: is the brand applied consistently across all screens?
11. Motion & Micro-interactions: are there meaningful micro-animations?
12. Empty States & Edge Cases: are loading, error, empty, and success states designed?

For each round, provide:
- A score out of 10 for the current state
- The top 3 specific issues found
- The highest-priority fix with exact code

End with: an overall design health score (out of 100), a prioritized punch list of 10 improvements, and a recommendation: Ready to launch / Needs polish / Needs significant work.
