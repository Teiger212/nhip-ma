# 0002. Home shows the funnel, not response time

Date: 2026-09-17. Status: accepted.

## Context

The obvious speed-to-lead metric is time from inbound to first approved send. Real-estate
agencies do not judge themselves on it. They judge themselves on how many clients they
interacted with and how many closings they got. Response time is a means; the funnel is
the end.

## Decision

Home's headline widgets are the office funnel over a period:

1. **Leads in**: new guests who wrote in.
2. **Leads engaged**: guests who received at least one approved send.
3. **In conversation**: guests with more than one exchange.
4. **Closings**: leads that became a signed lease or completed sale.
5. **Lost**: leads marked lost, with reason where known.

Response time (median and 90th percentile, first inbound to first send) is kept as a
supporting widget below the funnel, not as the headline.

Nhịp computes 1 to 3 from its own store. It does not know 4 and 5; those come from the
office's CRM through the CRM adapter (ADR 0003).

## Consequences

- The first three widgets are buildable now from inbox data. Built 2026-09-20, counted
  from Answers (ADR 0011) over a fixed 30-day window by first contact; the definitions
  are in CONTEXT.md under Funnel.
- Closings and lost depend on the CRM adapter; until an office has one connected, those
  two widgets show "connect your CRM" rather than a zero that looks like a fact.
- "Engaged" and "in conversation" need one definition each in CONTEXT.md so the chart
  and the code agree.
