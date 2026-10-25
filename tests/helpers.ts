import { jugglerStandardV1, type JugglerStandardV1Data } from "../src/core/models/jugglerStandardV1";
import { resolvePrior } from "../src/core/priors/preset";
import type { Observation } from "../src/core/types";
import data from "../src/machines/data/my-juggler-v.json";

export const model = jugglerStandardV1;
export const machine: JugglerStandardV1Data = jugglerStandardV1.parseMachine(data);
export const uniform = resolvePrior(machine, "uniform");
export const standard = resolvePrior(machine, "standard");
export const ON = { enabled: { grape: true } };

export function obs(N: number, b: number, r: number, session?: { n: number; g: number | null; known?: { bw: number; rw: number } }): Observation {
  return {
    total: { games: N, counts: { big: b, reg: r } },
    session: session
      ? { games: session.n, counts: { grape: session.g }, totalDelta: session.known ? { big: session.known.bw, reg: session.known.rw } : null }
      : null,
  };
}
