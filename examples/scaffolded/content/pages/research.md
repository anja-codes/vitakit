---
title: Research
description: Analytic combinatorics and random discrete structures.
order: 10
---

<figure class="figure-right">
  <img src="/img/tree.svg" alt="A simulated random tree" width="240" height="140">
  <figcaption>A random tree on eight nodes.</figcaption>
</figure>

My work concerns the asymptotic behaviour of large random trees. A simple
family is described by the equation $T(z) = z\,\phi(T(z))$, whose singular
expansion determines almost everything about the limit shape:

$$
T(z) = \tau - \gamma \sqrt{1 - z/\rho} + O(1 - z/\rho).
$$

From this, the expected height of a random tree with $n$ nodes satisfies

$$
\mathbb{E}[H_n] \sim c \sqrt{n}, \qquad n \to \infty.
$$

## Tools

| Technique | Used for |
| --- | --- |
| Singularity analysis | asymptotics of coefficients |
| Analytic combinatorics in several variables | multivariate limit laws |
| Simulation | checking conjectures before proving them |
