/**
 * A hook that returns a stable callback reference that always calls the latest version of the function.
 * This avoids the need to include the callback in dependency arrays while ensuring the latest version is called.
 */
export declare const useLatestCallback: <Args extends unknown[], Return>(callback: (...args: Args) => Return) => (...args: Args) => Return;
//# sourceMappingURL=useLatestCallback.d.ts.map