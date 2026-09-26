// Glicko-2 rating update for a single game (each game treated as its own rating period).
export interface Rating {
  r: number;
  rd: number;
  vol: number;
}
export const DEFAULT_RATING: Rating = { r: 1500, rd: 350, vol: 0.06 };
const TAU = 0.5;
const SCALE = 173.7178;
const MIN_RD = 45;
const MAX_RD = 350;

export function glicko2(player: Rating, opponent: Rating, score: 0 | 0.5 | 1): Rating {
  const mu = (player.r - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const muJ = (opponent.r - 1500) / SCALE;
  const phiJ = opponent.rd / SCALE;
  const sigma = player.vol;

  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / (g * g * E * (1 - E));
  const delta = v * g * (score - E);

  // Volatility (Illinois algorithm).
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * g * (score - E);

  return {
    r: Math.round((newMu * SCALE + 1500) * 100) / 100,
    rd: Math.min(MAX_RD, Math.max(MIN_RD, newPhi * SCALE)),
    vol: newSigma,
  };
}
