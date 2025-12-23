type DebounceOptions = {
    maxWait?: number;
    leading?: boolean;
    trailing?: boolean;
};
export declare const useDebounceCallback: <Args extends unknown[], Return>(callback: (...args: Args) => Return, delay?: number, options?: DebounceOptions) => {
    (...args: Args): Return | undefined;
    cancel(): void;
    flush(): Return | undefined;
};
export {};
//# sourceMappingURL=useDebounceCallback.d.ts.map