# Deep Search: Source Trustworthiness

The Deep Search tool incorporates a system to evaluate and consider the trustworthiness of information sources it encounters during its research process. This helps the AI prioritize and weigh information from more reliable sources when generating summaries and final answers.

## How Trust is Assessed (Initial Approach - MVP)

Our current approach to source trustworthiness combines several factors:

1.  **Pre-defined High-Signal Domains & TLDs:**
    *   The system is seeded with a list of Top-Level Domains (TLDs) and specific domains that are generally considered authoritative or high-signal. This includes:
        *   Government TLDs (e.g., `.gov`, `.gc.ca`, `.gov.uk`, `.bund.de`, `.europa.eu`).
        *   Educational TLDs (e.g., `.edu`, `.ac.uk`).
        *   Well-known technical documentation sites (e.g., `python.org`, `developer.mozilla.org`, `stackoverflow.com`).
        *   Major international news organizations and reputable academic publishers.
    *   These sources receive an initial positive bias in their trust assessment.

2.  **HTTPS Encryption:**
    *   The system checks if a source uses HTTPS. Secure connections are a positive signal, though not a sole determinant of trust.

3.  **Domain Age:**
    *   The age of a domain is determined via WHOIS lookups. Generally, older, more established domains may receive a slightly more positive consideration than very new domains, though this is just one heuristic among others.

4.  **Provisional Scoring for New Domains:**
    *   When Deep Search encounters a domain not in its pre-defined list, it performs live checks (HTTPS, domain age) and assigns an initial provisional trust score.

## How Trust Information is Used

The AI model performing the reasoning and synthesis steps within Deep Search is instructed to:
*   Pay attention to the trust indicators associated with each piece of information.
*   Give more weight to information from sources with higher indicated trust.
*   Be more skeptical of, or clearly qualify, information from sources with lower indicated trust or those with only provisional scores.

## Transparency and Responsibility

We believe in transparency regarding how our tools operate. The initial list of high-signal TLDs and domains represents a baseline established by Scalytics. This system is designed to be dynamic and will evolve.

## Future Enhancements

We are continuously working to improve the sophistication of our source trustworthiness assessment. Future enhancements will include:

*   **Outbound Link Analysis:** Analyzing the quality of sites that a source links to. Sources linking to other high-trust domains are generally considered more reliable.
*   **Content-Based Signals:** Exploring NLP techniques to assess content for factors like objectivity, presence of citations, and clarity.
*   **Cross-Referencing and Discrepancy Detection:** More advanced analysis to identify and weigh information that is corroborated across multiple high-trust sources, and to flag or down-weigh information that is contradicted.

Our goal is to provide users with research results that are not only comprehensive but also grounded in the most reliable information available.
