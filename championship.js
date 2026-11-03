import { POINTS } from '../config.js';

export class Championship {
  constructor(names) { this.points = Object.fromEntries(names.map(n => [n, 0])); this.rounds = []; this.wins = {}; }
  // finishing order: array of names, winner first
  addResult(order) {
    const awarded = order.map((name, k) => ({ name, pts: POINTS[k] || 0 }));
    for (const a of awarded) this.points[a.name] = (this.points[a.name] || 0) + a.pts;
    this.wins[order[0]] = (this.wins[order[0]] || 0) + 1;
    this.rounds.push(awarded);
    return awarded;
  }
  standings() {
    return Object.entries(this.points).map(([name, points]) => ({ name, points, wins: this.wins[name] || 0 }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  }
}
