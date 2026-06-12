/** Mock model list for UI validation */
module.exports.MOCK_MODELS = [
  'llama3.1:8b',
  'mistral:7b',
  'gemma:7b',
  'qwen2.5:7b',
  'phi3:3.8b',
  'deepseek-coder-v2:16b',
];

/** Mock debate content for each side */
module.exports.MOCK_DEBATE_CONTENT = {
  A: [
    `The evidence strongly supports this position. Historical data and logical reasoning both point in favor of the statement. When we examine the facts objectively, the pattern becomes clear — this is not merely opinion but a conclusion backed by observable reality.`,
    `I must address Side B's claims directly. Their arguments rest on cherry-picked data and selective interpretation. The broader body of evidence — including peer-reviewed research and real-world observations — consistently validates this position. Side B's counterarguments collapse under scrutiny.`,
    `To conclude: every major line of evidence converges on the same conclusion. The consistency across independent studies, the reproducibility of findings, and the weight of expert consensus all point decisively in favor of this statement. Side B has not presented a single argument that withstands rigorous analysis.`,
  ],
  B: [
    `This statement is fundamentally flawed. The available evidence, when examined comprehensively, contradicts the claim. Side A presents a narrow view that ignores critical counter-evidence. The data tells a different story — one that clearly refutes the statement.`,
    `Side A's reliance on selective evidence is their central weakness. They cite favorable data while ignoring the larger body of research that contradicts their position. When we look at the complete picture — including anomalies, edge cases, and contradictory findings — the statement clearly fails.`,
    `In summary, the weight of evidence decisively refutes this statement. Side A's arguments are built on a foundation of confirmation bias and incomplete data. The broader scientific consensus, the preponderance of contradictory evidence, and the logical inconsistencies in their position all demonstrate that this statement is false.`,
  ],
  judge: `**Winner: Side B**

After careful evaluation of both sides, Side B delivered the stronger performance. Here is my reasoning:

**Logical Reasoning:**
- Side B systematically addressed each of Side A's arguments with specific counter-evidence
- Side A's arguments, while coherent, relied more on assertion than rigorous analysis
- Side B demonstrated a more nuanced understanding of the topic's complexity

**Evidence Quality:**
- Side B cited a broader range of sources and acknowledged counter-evidence
- Side A's evidence was narrower and did not adequately address contradictory data
- Side B's use of specific examples strengthened their position

**Rhetorical Skill:**
- Side B's rebuttals were more targeted and effective
- Side A's responses tended to restate their position rather than directly engage with Side B's points
- Side B's concluding argument was more persuasive and comprehensive

**Conciseness:**
- Side B communicated their arguments more efficiently, using fewer words for greater impact
- Side A's arguments contained redundant phrasing that diluted their effectiveness

**Overall Assessment:**
Side B's combination of thorough evidence, direct rebuttals, and concise communication makes them the clear winner of this debate.`,
};
