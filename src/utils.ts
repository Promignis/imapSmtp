// This gives better looking error handling. Can avoid using try catch everywhere with async await
// eg: [err, result] = await to (fetch("google.com"))
export function to<T, U = Error>(
    promise: Promise<T>,
    errorExt?: object
): Promise<[U | null, T | undefined]> {
    return promise
        .then<[null, T]>((data: T) => [null, data])
        .catch<[U, undefined]>((err: U) => {
            if (errorExt) {
                Object.assign(err, errorExt);
            }

            return [err, undefined];
        });
}