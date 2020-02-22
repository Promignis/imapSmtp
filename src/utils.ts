import crypto from 'crypto'
import bcrypt from 'bcrypt'

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


export function generateRandomString(length: number): string {
    // TODO: Add a more sphisticated lib to do this?
    return crypto.randomBytes(Math.ceil(length * 0.5)).toString('hex').slice(0, length);
}

export async function bcryptHash(rawPassword: string): Promise<string>{
    let saltRounds = 10;
    return new Promise((res, rej) => {
        bcrypt.hash(rawPassword, saltRounds, function(err, hash){
            if (err) rej(err)
            res(hash)
        })
    })
}

export async function bcryptVerify(password: string, passwordHash: string): Promise<boolean> {
  let err, result: any
  [err, result] = await to(bcrypt.compare(password, passwordHash))
  if(err != null) {
    throw err
  }
  return result
}
