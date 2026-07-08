/** Mock debate content for UI validation */

/** Mock debate arguments for each side — selected at random */
export const MOCK_DEBATE_CONTENT: Record<string, string[]> = {
  A: [
    `The evidence strongly supports this position. Historical data and logical reasoning both point in favor of the statement. When we examine the facts objectively, the pattern becomes clear — this is not merely opinion but a conclusion backed by observable reality.`,
    `I must address The Negative's claims directly. Their arguments rest on cherry-picked data and selective interpretation. The broader body of evidence — including peer-reviewed research and real-world observations — consistently validates this position. The Negative's counterarguments collapse under scrutiny.`,
    `To conclude: every major line of evidence converges on the same conclusion. The consistency across independent studies, the reproducibility of findings, and the weight of expert consensus all point decisively in favor of this statement. The Negative has not presented a single argument that withstands rigorous analysis.`,
    `Consider the practical implications. When this principle is applied in real-world scenarios, the outcomes consistently demonstrate its validity. Policy decisions grounded in this understanding have produced measurable positive results across multiple domains.`,
    `The Negative attempts to reframe the discussion, but their reframing itself relies on the very principles they claim to oppose. This internal contradiction undermines their entire position. When examined honestly, their arguments actually reinforce the validity of this statement.`,
    `Let us also consider the historical perspective. Across centuries of human experience, this truth has been repeatedly confirmed. The accumulated wisdom of generations, validated by empirical observation, stands as the strongest evidence we have.`,
  ],
  B: [
    `This statement is fundamentally flawed. The available evidence, when examined comprehensively, contradicts the claim. The Affirmative presents a narrow view that ignores critical counter-evidence. The data tells a different story — one that clearly refutes the statement.`,
    `The Affirmative's reliance on selective evidence is their central weakness. They cite favorable data while ignoring the larger body of research that contradicts their position. When we look at the complete picture — including anomalies, edge cases, and contradictory findings — the statement clearly fails.`,
    `In summary, the weight of evidence decisively refutes this statement. The Affirmative's arguments are built on a foundation of confirmation bias and incomplete data. The broader scientific consensus, the preponderance of contradictory evidence, and the logical inconsistencies in their position all demonstrate that this statement is false.`,
    `The Affirmative's argument suffers from a critical logical fallacy. They confuse correlation with causation, presenting coincidental patterns as meaningful relationships. When proper statistical controls are applied, the supposed evidence evaporates entirely.`,
    `Let us examine the practical consequences. Implementing policies based on this statement would lead to demonstrably harmful outcomes. Real-world cases where this principle was applied show a consistent pattern of negative results and unintended consequences.`,
    `Finally, the most authoritative sources in this field explicitly reject this claim. Leading experts, comprehensive meta-analyses, and longitudinal studies all converge on the same conclusion: this statement does not reflect reality.`,
  ],
};

/** Mock judge verdicts — selected at random */
export const MOCK_JUDGE_VERDICTS: string[] = [
  `**Winner: The Negative**

After careful evaluation of both sides, The Negative delivered the stronger performance. Here is my reasoning:

**Logical Reasoning:**
- The Negative systematically addressed each of The Affirmative's arguments with specific counter-evidence
- The Affirmative's arguments, while coherent, relied more on assertion than rigorous analysis
- The Negative demonstrated a more nuanced understanding of the topic's complexity

**Evidence Quality:**
- The Negative cited a broader range of sources and acknowledged counter-evidence
- The Affirmative's evidence was narrower and did not adequately address contradictory data
- The Negative's use of specific examples strengthened their position

**Rhetorical Skill:**
- The Negative's rebuttals were more targeted and effective
- The Affirmative's responses tended to restate their position rather than directly engage with The Negative's points
- The Negative's concluding argument was more persuasive and comprehensive

**Overall Assessment:**
The Negative's combination of thorough evidence, direct rebuttals, and concise communication makes them the clear winner of this debate.`,

  `**Winner: The Negative**

My evaluation concludes that The Negative presented a more compelling case. Here's why:

**Argument Structure:**
- The Negative's arguments were better structured, with clear premises leading to logical conclusions
- The Affirmative's position lacked sufficient scaffolding, making their claims harder to evaluate
- The Negative anticipated and preempted potential counterarguments effectively

**Depth of Analysis:**
- The Negative explored multiple dimensions of the issue, showing comprehensive understanding
- The Affirmative focused on a single perspective, missing important contextual factors
- The Negative's willingness to acknowledge complexity strengthened their credibility

**Rebuttal Effectiveness:**
- The Negative directly dismantled each of The Affirmative's key points with specific evidence
- The Affirmative's rebuttals were largely defensive and failed to address The Negative's core arguments
- The Negative maintained offensive pressure throughout the debate

**Final Verdict:**
The Negative's superior argument structure, deeper analysis, and effective rebuttals establish them as the clear winner.`,

  `**Winner: The Affirmative**

After thorough deliberation, I find that The Affirmative presented the stronger case. My reasoning:

**Logical Coherence:**
- The Affirmative's arguments formed a cohesive, internally consistent framework
- Each point built logically upon the previous one, creating a compelling narrative
- The Negative's counterarguments contained logical gaps that weakened their overall position

**Evidence Presentation:**
- The Affirmative supported their claims with specific, verifiable evidence
- Their use of real-world examples made abstract concepts concrete and relatable
- The Negative's evidence was more speculative and less grounded in observable facts

**Response to Counterarguments:**
- The Affirmative directly addressed The Negative's criticisms with well-reasoned responses
- They acknowledged valid points while explaining why these did not undermine their core position
- The Negative failed to adequately respond to The Affirmative's strongest arguments

**Conclusion:**
The Affirmative's logical coherence, solid evidence, and effective defense of their position make them the deserving winner.`,
];

/** @deprecated Use MOCK_JUDGE_VERDICTS array instead */
export const MOCK_JUDGE_VERDICT = MOCK_JUDGE_VERDICTS[0];
