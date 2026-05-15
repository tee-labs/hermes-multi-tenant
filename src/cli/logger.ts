let isVerbose = false;

export function setVerbose(v: boolean): void {
  isVerbose = v;
}

export function isVerboseMode(): boolean {
  return isVerbose;
}

export function info(msg: string): void {
  console.log(msg);
}

export function verbose(msg: string): void {
  if (isVerbose) {
    console.log(`  → ${msg}`);
  }
}

export function error(msg: string): void {
  console.error(msg);
}
