import { State } from './types'

export const STARTTLS = {
    state: State.NOTAUTH,
    schema: [] // Has no arguments
}

export const CAPABLITY = {
    state: State.ANY,
    schema: []
}
