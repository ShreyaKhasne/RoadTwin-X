# Candidate generation and optimization

The local planner deterministically creates distinct plans: rebalance signal green time toward the busiest approach, remove the modeled roadside obstruction, add a turning-lane capacity treatment, coordinate signal and obstruction changes, and manage the school crossing phase. Each has explicit parameter changes and an illustrative estimated cost.

Every plan is simulated from a fresh copy of the same input network and seed. The objective parser recognizes delay-reduction percentages and currency budgets in the submitted sentence; controls provide pedestrian-proxy limit and budget directly. Hard safety and budget filters run before ranking. Candidate feasibility also checks a requested delay-reduction target. A candidate failing any hard constraint cannot become the recommendation.

For feasible candidates, the engine computes a transparent weighted score from normalized delay, queue, travel-time, throughput, pedestrian-proxy, emissions, and cost outcomes. Weights and score terms are returned in the response. This is a bounded heuristic search over a few authored options, not a global optimum, learned policy, Pareto-frontier solver, or real-world recommendation.
