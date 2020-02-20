import { ROLES } from '../services/roles'

export const userCreateSchema = {
    body: {
        type: 'object',
        required: ['username', 'tempPassword', 'firstname', 'lastname', 'role'],
        properties: {
            username: { type: 'string', minLength: 4 },
            tempPassword: { type: 'string', minLength: 8 },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: {
                type: 'string',
                enum: [ROLES.ADMIN, ROLES.USER]
            }
        },
        additionalProperties: false
    },
    response: {
        200: {
            type: 'object',
            properties: {
                address: { type: 'string' },
                tempPass: { type: 'string' }
            },
            additionalProperties: false
        }
    }
}

export const getAllMailboxSchema = {
    body: {
        type: 'object',
        required: [],
        properties: {
            //This is the optional address id, if not given then defaults to user's primary addresss
            id: { type: 'string', minLength: 12, maxLength: 12 } // Using mongo ObjectId type that has length 12 
        },
        additionalProperties: false
    },
    response: {
        200: {
            type: 'object',
            properties: {
                mailboxes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            total: { type: 'number' },
                            unseen: { type: 'number' },
                            size: { type: 'number' },
                        }
                    }
                }
            },
            additionalProperties: false
        }
    }
}