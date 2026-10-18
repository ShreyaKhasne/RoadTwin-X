# Demo guide

1. Start the API and Vite client using the README instructions.
2. Observe the moving traffic and signal heads. Use the camera chips to switch between isometric and overhead views.
3. Click an approach slab or its inspector item. Change lane count/speed; the network state shown in the client updates.
4. Edit the plain-language objective and budget, then run the candidate batch.
5. Review baseline/candidate outcomes and read each hard-constraint status. A red infeasible badge means the plan is not recommended.
6. Save the resulting evidence as a report, then export the saved JSON report.
7. Restart FastAPI and reload saved reports to see SQLite persistence.

The sample data is synthetic and all cost, risk, and emissions coefficients are demonstration assumptions.
