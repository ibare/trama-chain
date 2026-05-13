export class InstantaneousCycleError extends Error {
  constructor(public readonly path: string[]) {
    super(`Instantaneous (lag=0) cycle detected: ${path.join(' → ')}`);
    this.name = 'InstantaneousCycleError';
  }
}

export class MissingShapeError extends Error {
  constructor(public readonly key: string) {
    super(`Shape "${key}" not registered`);
    this.name = 'MissingShapeError';
  }
}

export class MissingCombinerError extends Error {
  constructor(public readonly key: string) {
    super(`Combiner "${key}" not registered`);
    this.name = 'MissingCombinerError';
  }
}
