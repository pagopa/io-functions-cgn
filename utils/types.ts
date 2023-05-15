/**
 * Type-safe implementation for Object.keys()
 *
 * @param o the object to get the keys from
 *
 * @returns the keys of the provided object
 */
// eslint-disable-next-line
export const keys = <T extends Object>(o: T): ReadonlyArray<keyof T> =>
  (Object.keys(o) as unknown) as ReadonlyArray<keyof T>;

/**
 * Utility to perform exhaustive checks. It behaves as an identity function
 *
 * @param input the value to be checked
 * @param retValue optional, if valued overrides the returned value
 *
 * @returns the passed value if not overridden, the override otherwise
 */
export const unhandledValue = (input: never, retValue = input): never =>
  retValue;

/**
 * Utility to perform exhaustive checks. It just throws, that means the path should not be possible
 *
 * @param input the value to be checked
 */
export const assertNever = (_: never): never => {
  throw new Error(`Unhandled value`);
};
