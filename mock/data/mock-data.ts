/** Mock debate content for UI validation */

/** Mock debate arguments for each side */
export const MOCK_DEBATE_CONTENT: Record<string, string[]> = {
  A: [
    `The evidence strongly supports this position. Historical data and logical reasoning both point in favor of the statement. When we examine the facts objectively, the pattern becomes clear — this is not merely opinion but a conclusion backed by observable reality.`,
    `I must address The Negative's claims directly. Their arguments rest on cherry-picked data and selective interpretation. The broader body of evidence — including peer-reviewed research and real-world observations — consistently validates this position. The Negative's counterarguments collapse under scrutiny.`,
    `To conclude: every major line of evidence converges on the same conclusion. The consistency across independent studies, the reproducibility of findings, and the weight of expert consensus all point decisively in favor of this statement. The Negative has not presented a single argument that withstands rigorous analysis.`,
  ],
  B: [
    `This statement is fundamentally flawed. The available evidence, when examined comprehensively, contradicts the claim. The Affirmative presents a narrow view that ignores critical counter-evidence. The data tells a different story — one that clearly refutes the statement.`,
    `The Affirmative's reliance on selective evidence is their central weakness. They cite favorable data while ignoring the larger body of research that contradicts their position. When we look at the complete picture — including anomalies, edge cases, and contradictory findings — the statement clearly fails.`,
    `In summary, the weight of evidence decisively refutes this statement. The Affirmative's arguments are built on a foundation of confirmation bias and incomplete data. The broader scientific consensus, the preponderance of contradictory evidence, and the logical inconsistencies in their position all demonstrate that this statement is false.`,
  ],
};

/** Mock judge verdict (always Negative wins) */
export const MOCK_JUDGE_VERDICT = `**Winner: The Negative**

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

**Conciseness:**
- The Negative communicated their arguments more efficiently, using fewer words for greater impact
- The Affirmative's arguments contained redundant phrasing that diluted their effectiveness

**Overall Assessment:**
The Negative's combination of thorough evidence, direct rebuttals, and concise communication makes them the clear winner of this debate.`;
