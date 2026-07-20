# Q-AWED Elevator Dispatch

Q-AWED (Q-learning Adaptive Weighted Elevator Dispatch) is an interactive research model for adaptive multi-objective elevator-group dispatch. It adds a Q-learning layer above a weighted dispatch cost function so that the system can change the relative importance of waiting time, long waits, movement-energy proxy, stops, and load balance as traffic conditions change.

The browser application includes:

- animated explanations of six baseline dispatch approaches;
- six traffic scenarios and reproducible simulation controls;
- an interactive explanation of 13 Q-AWED parameters and their formulas;
- waiting-time, score, confidence-interval, and cross-scenario comparisons;
- CSV export for experiment results;
- automated Python and Node.js tests.

## Run locally

Requirements: Node.js and Python 3.

```bash
npm run dev
```

The local server opens the site in your default browser. If it does not open automatically, use the URL printed in the terminal.

## Run tests

```bash
npm test
```

## Research scope

This repository is a research simulation and presentation tool, not production elevator-control software. Reported results are generated in its unified simulated environment. The movement-based energy value is an energy proxy, and parameter recommendations should be recalibrated before use with a real building or controller.

## Authorship and citation

Original Q-AWED interactive model and implementation by [TIANYUN-LIU-Potatoes](https://github.com/TIANYUN-LIU-Potatoes), first publicly released in 2026. Citation metadata is provided in [`CITATION.cff`](CITATION.cff).

## License

Copyright (c) 2026 TIANYUN-LIU-Potatoes.

Released under the [MIT License](LICENSE). You may use, copy, modify, and redistribute this project, provided that the copyright and license notice are retained. The license permits reuse; it does not transfer authorship of the original work.
