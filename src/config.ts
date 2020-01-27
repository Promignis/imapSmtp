import c from 'config';

//config check
export function validateConfig(): {valid: boolean, wrongProps: string[]} {
    const values: string[] = ["server", "logger", "redis", "db"]
    let wrongProps: string[] = []
    // TODO: Add more granular checks for each property and type
    values.forEach(v => {
        if(!c.has(v)){
            wrongProps.push(v)
        }
    });

    let valid = wrongProps.length == 0

    return {valid, wrongProps}
}

export const config = c