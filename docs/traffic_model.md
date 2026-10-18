# Traffic model and assumptions

## Analytical model

The analytical engine uses a reproducible discrete-time queue model at each approach. A seeded Python random generator distributes demand arrivals over each one-second step using a binomial approximation. An arrival is added to its approach queue. The signal state machine allocates each configured green interval to one approach in a fixed cycle, with amber time treated as not dischargeable. During green, a queue can discharge up to `lanes × saturation_flow × step / 3600`; effective discharge is reduced by an obstruction factor and adjusted by the intervention. The step is one second, and all candidates use identical seed, demand, and duration.

Metrics are calculated from arrivals/departures: average stopped delay (integrated queue vehicle-seconds divided by arrivals), mean trip-time proxy (free-flow approach travel time plus modeled delay), mean speed proxy, average and maximum queue, vehicles served, throughput per hour, occupancy proxy, and an emissions proxy. For emitted vehicles, the demonstration class mix is sampled at 46% cars, 30% two-wheelers, 18% autos, and 6% buses and multiplied by fixed class-average grams/km factors in the engine. Pedestrian conflict exposure is a relative proxy based on modeled queue presence, pedestrian flow, and risk factor. It is not a crash probability or a validated surrogate safety measure.

This queue abstraction does not model lane-by-lane car-following, turning paths, coordinated neighboring junctions, or individual pedestrian trajectories. The 3D viewport is an illustrative, separately animated visual layer. Do not treat it as a calibrated digital twin or use the demo outputs for real infrastructure decisions.

## Reproducibility

`seed`, network input, step, duration, and intervention are captured in every saved experiment. The same input tuple gives the same metrics. Candidate runs clone the input network and apply independent parameters before simulation.

## Signal model

The signal state machine cycles through the four configured green allocations in north/south/east/west order, with configured amber time after each approach. Remaining cycle time is all-red clearance. Only the active approach receives service. Protected turning movements and inter-junction conflict zones are outside this demonstration model.

## Synthetic sample provenance

School Gate Junction, road geometry, demand, pedestrian volumes, obstruction factors, and signal timings were authored as synthetic sample values for a software demonstration. They are not an actual intersection, survey, observed count, or official dataset.
