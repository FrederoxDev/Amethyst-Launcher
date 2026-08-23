export type SetStateAction<T> = T | ((previous: T) => T);
export type StateSetter<T> = (value: SetStateAction<T>) => void;

export class StateUtils {
    static resolveSetStateAction<T>(value: SetStateAction<T>, previous: T): T {
        return typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
    }
}