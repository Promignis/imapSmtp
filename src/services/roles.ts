// Role info:
/**
 * TODO: Should not have hardcoded roles like this. Roles will be put in the db
 * so that the admin can create new roles with more granular access. Version 1.0 will
 * not have the feature to create new roles but will be setup in a way that this can be easily 
 * added in future verions.
 * 
 * Even in that case there should always be 2 roles, "admin" and "user".
 * These roles and its privilages are hardcoded and can NOT be modified.
 * For now user has a string property called role. It will be replaced by a ref to a role
 * document. 
 * 
 * The two harcoded roles mentioned above will be created when the server instance
 * during first setup
 * 
 * Note: Maybe These hardcoded role documents can be decorated in the main fastify instance so 
 * that they can be easily accessed without making any db calls.
 */
export const ROLES = {
    ADMIN: 'admin',
    USER: 'user'
}